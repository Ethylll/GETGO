import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { agentChangeControls, resolveAgentChange } from '../src/agentActions.js'
import { planChangeFor } from '../src/agentPlanChanges.js'
import { activeLearningPlan, createDailySession, updateLearningDay } from '../src/learningDays.js'
import { runLearningAgent } from '../src/learningAgent.js'
import { saveWithLearningObservation } from '../src/learningObservation.js'
import { LEARNING_SESSION_KEY, loadLearningSession, saveDailyLearningSession } from '../src/learningSessionStorage.js'
import { clarificationCards, respondToClarification } from '../src/teachingInteractions.js'
import { makePlan } from './fixtures/dailyLearningPlan.js'

const at = 1_800_001_000_000
const timeQuestion = { id: 'q-time', type: 'CLARIFY', taskId: 'practice', dayId: 'day-1',
  text: '时间不足还是不清楚怎么敲击？', createdAt: at + 1 }
const projectQuestion = { ...timeQuestion, id: 'q-project', taskId: null, text: '这个学习安排哪里需要帮助？' }
const testDay = (session, amount = 10) => updateLearningDay(session, { type: 'advance', dayId: session.days.at(-1).id, now: at + amount })
const currentPractice = (session) => session.days.at(-1).instances.find(({ task }) => task.id === 'practice')
const feedback = (options = {}) => ({ noteId: timeQuestion.id, messageId: 'm-time', projectId: 'demo', text: '我只有三分钟',
  now: at + 30, ...options })

function fixture(notes = []) {
  const session = createDailySession(makePlan(), 'demo', at)
  return { ...session, agent: { rounds: [], notes, changes: [], schedule: [] } }
}

function memory() {
  const data = new Map()
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('进入新旧 V2 学习页即告知 DeepSeek 接收学习记录和问答，下一日按钮关联说明', async () => {
  const vite = await createServer({ server: { middlewareMode: true, watch: null, ws: false } })
  try {
    const { default: DailyLearningView } = await vite.ssrLoadModule('/src/DailyLearningView.jsx')
    const initialPlan = makePlan()
    for (const restored of [undefined, testDay(fixture())]) {
      const html = renderToStaticMarkup(createElement(DailyLearningView, { initialPlan, restored }))
      const notice = html.match(/<p id="agent-data-notice"[^>]*>([^<]+)<\/p>/u)
      assert.match(notice?.[1] ?? '', /学习记录、问答和资料片段会发送给 DeepSeek.*数据处理以 DeepSeek 的条款为准/u)
      assert.match(html, /<button[^>]*aria-describedby="agent-data-notice"[^>]*>下一日<\/button>/u)
      assert.ok(notice.index < html.indexOf('aria-describedby="agent-data-notice"'))
    }
  } finally {
    await vite.close()
  }
})

test('稍后回答可刷新恢复，学习安排和进度保持原样，也不启动新一轮观察', () => {
  const old = fixture([timeQuestion])
  const ignored = respondToClarification(old, feedback({ text: undefined }))
  assert.equal(ignored.agent.notes[0].ignoredAt, at + 30)
  assert.equal(ignored.days, old.days)
  assert.equal(ignored.effectivePlan, old.effectivePlan)
  assert.equal(ignored.messages.length, 0)
  assert.equal(respondToClarification(ignored, feedback({ text: undefined })), ignored)
  const saved = memory()
  assert.ok(saveDailyLearningSession(ignored, saved))
  const restored = loadLearningSession(saved).session
  assert.equal(restored.agent.notes[0].ignoredAt, at + 30)
  assert.deepEqual(restored.observations, [])
  assert.equal(clarificationCards(restored, 'day-1', 'day-1', 'first', false)[0].deferred, true)
  assert.equal(testDay(restored).days.length, 2)
})

test('跨日回复保留原项目、原日、原任务，并在保存后把问题和回复一起提供给当前观察', async () => {
  const initial = fixture([timeQuestion])
  let session = testDay(initial)
  const before = session
  const replied = respondToClarification(session, feedback())
  const storage = memory()
  const result = saveWithLearningObservation(before, replied, { type: 'clarificationReply', messageId: 'm-time' },
    (next) => saveDailyLearningSession(next, storage))
  assert.equal(result.event.id, 'clarificationReply:q-time')
  assert.equal(result.event.dayId, 'day-2')
  session = loadLearningSession(storage).session
  const reply = session.messages[0]
  assert.deepEqual([reply.projectId, reply.dayId, reply.taskId, reply.instanceId, reply.clarificationId, reply.question],
    ['demo', 'day-1', 'practice', 'day-1:practice', 'q-time', '我只有三分钟'])
  assert.equal(clarificationCards(session, 'day-2', 'day-1', 'practice', true)[0].reply.id, reply.id)
  assert.equal(clarificationCards(session, 'day-2', 'day-2', 'first', false)[0].reply.id, reply.id)
  const commit = (update) => {
    assert.ok(saveDailyLearningSession(update(session), storage))
    session = loadLearningSession(storage).session
    return session
  }
  const status = await runLearningAgent(result.event, { commit, now: () => at + 100,
    request({ frame }) {
      assert.deepEqual(frame.clarification, { promptId: 'note:q-time', replyId: 'message:m-time' })
      assert.equal(frame.priorNotes.find(({ evidenceId }) => evidenceId === 'note:q-time').text, timeQuestion.text)
      assert.equal(frame.messages.find(({ evidenceId }) => evidenceId === 'message:m-time').question, '我只有三分钟')
      return { decision: { type: 'wait', reason: '等待实际练习', evidenceIds: ['note:q-time', 'message:m-time'] } }
    },
  })
  assert.equal(status, 'waiting')
  assert.deepEqual(session.agent.rounds.at(-1).steps[0].evidenceIds, ['note:q-time', 'message:m-time'])
  assert.equal(respondToClarification(session, feedback({ messageId: 'dupe' })), session)
  assert.equal(await runLearningAgent(result.event, { commit, request: () => assert.fail('replayed') }), 'ignored')
})

test('项目级和未排入今日的任务澄清均可回复，无效项目、问题和伪造归属被拦截', () => {
  const future = { ...timeQuestion, id: 'q-future', taskId: 'reflection', instanceId: null }
  const before = fixture([projectQuestion, future])
  assert.equal(respondToClarification(before, feedback({ noteId: 'missing' })), before)
  assert.equal(respondToClarification(before, feedback({ noteId: projectQuestion.id, projectId: 'wrong' })), before)
  assert.equal(respondToClarification(before, feedback({ noteId: projectQuestion.id, text: ' ' })), before)
  let session = respondToClarification(before, feedback({ noteId: projectQuestion.id, messageId: 'm-project' }))
  session = respondToClarification(session, feedback({ noteId: future.id, messageId: 'm-future' }))
  assert.deepEqual(session.messages.map(({ taskId, instanceId }) => [taskId, instanceId]), [[null, null], ['reflection', null]])
  const storage = memory()
  assert.ok(saveDailyLearningSession(session, storage))
  const raw = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  raw.messages.push({ ...raw.messages[0], id: 'm-fake', projectId: 'wrong' })
  raw.messages.push({ ...raw.messages[1], id: 'm-other', dayId: 'day-2' })
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(raw))
  assert.deepEqual(loadLearningSession(storage).session.messages.map(({ id }) => id), ['m-project', 'm-future'])
})

test('保存失败时不给观察机会，澄清回复保留于已落盘快照的前提下才重启观察', () => {
  const session = fixture([timeQuestion])
  const update = respondToClarification(session, feedback())
  const failure = saveWithLearningObservation(session, update, { type: 'clarificationReply', messageId: 'm-time' }, () => false)
  assert.equal(failure.event, null)
  assert.equal(failure.saved, false)
})

function proposal(session, minutes, id = 'change') {
  const action = { type: 'ADJUST_PRACTICE', taskId: 'practice', params: { minutes } }
  const { delta } = planChangeFor(session, action, id)
  const record = { id, dayId: session.days.at(-1).id, action, taskIds: ['practice'], reason: '只有少量学习时间',
    proposedAt: at + 1, appliedAt: null, needsConfirmation: true, status: 'pending', delta }
  return { ...session, agent: { ...session.agent, changes: [...session.agent.changes, record] } }
}

test('待确认、过时和拒绝均保持现行安排，接受重复一次无第二次写入', () => {
  const state = proposal(fixture(), 3)
  const change = state.agent.changes[0]
  assert.deepEqual(agentChangeControls(state, change), { status: 'pending', commands: ['accept', 'reject'] })
  assert.equal(currentPractice(state).task.estimatedMinutes, 6)
  const declined = resolveAgentChange(state, change.id, 'reject', at + 2)
  assert.equal(declined.agent.changes[0].status, 'rejected')
  assert.equal(declined.effectivePlan, null)
  const later = testDay(state)
  assert.equal(agentChangeControls(later, change).status, 'expired')
  assert.equal(resolveAgentChange(later, change.id, 'accept', at + 30), later)
  const accepted = resolveAgentChange(state, change.id, 'accept', at + 3)
  assert.equal(currentPractice(accepted).task.estimatedMinutes, 3)
  assert.equal(resolveAgentChange(accepted, change.id, 'accept', at + 4), accepted)
})

test('撤销和恢复使用同一权限判断，有记录后的恢复保存新的变更和原实践', () => {
  const pending = proposal(fixture(), 3)
  const applied = resolveAgentChange(pending, 'change', 'accept', at + 3)
  const change = applied.agent.changes[0]
  assert.deepEqual(agentChangeControls(applied, change).commands, ['undo'])
  const undone = resolveAgentChange(applied, change.id, 'undo', at + 4)
  assert.equal(currentPractice(undone).task.estimatedMinutes, 6)
  assert.equal(undone.agent.changes[0].status, 'undone')
  const practiced = ['start', 'complete'].reduce((state, type) => updateLearningDay(state,
    { type, dayId: 'day-1', instanceId: 'day-1:practice', now: at + 12 }), applied)
  assert.deepEqual(agentChangeControls(practiced, change).commands, ['restore'])
  assert.equal(resolveAgentChange(practiced, change.id, 'undo', at + 20), practiced)
  const restored = resolveAgentChange(practiced, change.id, 'restore', at + 20)
  assert.deepEqual(currentPractice(restored), currentPractice(practiced))
  assert.equal(activeLearningPlan(restored).tasks.find(({ id }) => id === 'practice').estimatedMinutes, 6)
  assert.equal(restored.agent.changes[1].restores, change.id)
  assert.equal(agentChangeControls(restored, restored.agent.changes[0]).status, 'restored')
  const storage = memory()
  assert.ok(saveDailyLearningSession(restored, storage))
  assert.equal(loadLearningSession(storage).session.agent.changes.length, 2)
})

test('多个变更叠加时旧卡片不提供无效撤销，损坏的单条变更不会破坏学习恢复', () => {
  const first = resolveAgentChange(proposal(fixture(), 3), 'change', 'accept', at + 3)
  const second = resolveAgentChange(proposal(first, 2, 'second'), 'second', 'accept', at + 4)
  assert.equal(agentChangeControls(second, second.agent.changes[0]).status, 'superseded')
  assert.equal(resolveAgentChange(second, 'change', 'undo', at + 5), second)
  const storage = memory()
  assert.ok(saveDailyLearningSession(second, storage))
  const raw = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  raw.agent.changes[0].delta.tasks[0].after.steps[0].sourceRefs[0].excerpt = '伪造的步骤'
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(raw))
  const restored = loadLearningSession(storage)
  assert.equal(restored.status, 'restored')
  assert.equal(restored.session.agent.changes.length, 1)
  assert.equal(currentPractice(restored.session).task.estimatedMinutes, 2)
})
