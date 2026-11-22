import assert from 'node:assert/strict'
import test from 'node:test'
import { scopedChatTurns, updateScopedChatMessages, validatedLearningFeedback } from '../src/chatMessages.js'
import { createDailySession, updateLearningDay } from '../src/learningDays.js'
import { buildLearningObservation, observationForModel, saveWithLearningObservation } from '../src/learningObservation.js'
import { LEARNING_SESSION_KEY, loadLearningSession, saveDailyLearningSession } from '../src/learningSessionStorage.js'
import { makePlan, makeTask, sourceRefs } from './fixtures/dailyLearningPlan.js'

const at = 1_800_000_000_000
const newSession = (projectId = 'learning-project') => createDailySession(makePlan(), projectId, at)
const nowDay = (session) => session.days.at(-1)
const advance = (session) => updateLearningDay(session, { type: 'advance', dayId: nowDay(session).id, now: at + 10 })
const action = (session, type, taskId) => updateLearningDay(session,
  { type, dayId: nowDay(session).id, now: at + 20, instanceId: `${nowDay(session).id}:${taskId}` })
const memory = () => {
  const values = new Map()
  return { setItem: (key, value) => values.set(key, value), getItem: (key) => values.get(key) ?? null }
}

function question(session, id, taskId, text, dayId = nowDay(session).id) {
  return { id, projectId: session.projectId, dayId, instanceId: taskId ? `${dayId}:${taskId}` : null,
    taskId, question: text, createdAt: at + 1, status: 'pending', answer: '', citations: [] }
}

const append = (state, turn) => updateScopedChatMessages(state, turn, (turns) => [...turns, turn])
const reply = (state, turn, data) => updateScopedChatMessages(state, turn, (turns) =>
  turns.map((item) => item.id === turn.id ? { ...item, ...data } : item))
const sent = (state, turn, data, save = () => true) =>
  saveWithLearningObservation(state, reply(state, turn, data), { type: 'chatReply', messageId: turn.id }, save)
const difficulty = { kind: 'difficulty', excerpt: '我还是跟不上' }

test('切日先将旧日、问答和新日一起写入，随后才释放去重观察；双击和失写无新观察', () => {
  const storage = memory()
  const first = newSession()
  const turn = question(first, 'pending', 'first', '这一步怎么做？')
  const before = append(first, turn)
  const saved = saveWithLearningObservation(before, advance(before), { type: 'advance' }, (next) => {
    assert.equal(next.days.length, 2)
    assert.notEqual(next.days[0].endedAt, null)
    assert.equal(next.days[0].instances[0].status, 'notStarted')
    assert.equal(next.messages[0].dayId, 'day-1')
    return saveDailyLearningSession(next, storage)
  })
  assert.equal(saved.event.id, 'nextDay:day-2')
  const restored = loadLearningSession(storage).session
  assert.deepEqual(restored.observations, [saved.event])
  assert.equal(restored.messages[0].status, 'interrupted')
  assert.ok(buildLearningObservation(restored, saved.event))
  const stale = { type: 'advance', dayId: 'day-1', now: at + 30 }
  assert.equal(saveWithLearningObservation(restored, updateLearningDay(restored, stale), stale, () => true).event, null)
  const failed = saveWithLearningObservation(before, advance(before), { type: 'advance' }, () => false)
  assert.equal(nowDay(failed.session).dayNumber, 2)
  assert.equal(failed.event, null)
  assert.equal(buildLearningObservation(failed.session, saved.event), null)
})

test('模型只见模拟日时钟，封存的未开始和进行中均记未完成，开放日暂不判定', () => {
  const before = action(newSession(), 'start', 'practice')
  const { session, event } = saveWithLearningObservation(before, advance(before), { type: 'advance' }, () => true)
  const frame = observationForModel(buildLearningObservation(session, event))
  assert.equal(frame.simulatedMinute, 1440)
  assert.deepEqual(frame.recentDays.map(({ closed, simulatedMinute }) => [closed, simulatedMinute]), [[true, 0], [false, 1440]])
  assert.deepEqual(frame.recentDays[0].instances.map(({ status, outcome }) => [status, outcome]),
    [['notStarted', 'unfinished'], ['inProgress', 'unfinished']])
  assert.ok(frame.recentDays[1].instances.every(({ outcome }) => outcome === 'open'))
  assert.equal(Object.hasOwn(frame.recentDays[0].instances[1], 'startedAt'), false)
  assert.equal(frame.summaries.find(({ taskId }) => taskId === 'practice').consecutiveUnfinishedOffers, 1)
})

test('普通知识问答、勾选与重复反馈不会提供即时观察；首次任务困难可独立于答疑结果入队', () => {
  const first = newSession()
  let turn = question(first, 'one', 'practice', '怎么交替敲击？')
  let result = sent(append(first, turn), turn, { status: 'answered', answer: '观察节奏', citations: sourceRefs })
  assert.equal(result.event, null)
  assert.equal(saveWithLearningObservation(first, action(first, 'start', 'practice'), { type: 'start' }, () => true).event, null)

  turn = question(result.session, 'two', 'practice', '交替练习，我还是跟不上。')
  const pending = append(result.session, turn)
  result = sent(pending, turn, { status: 'insufficient', feedback: difficulty })
  assert.equal(result.event.type, 'taskFeedback')
  assert.equal(buildLearningObservation(result.session, result.event).messages.find(({ evidenceId }) => evidenceId === 'message:two').feedback.kind, 'difficulty')
  const duplicate = question(first, 'three', 'practice', '我还是跟不上！')
  assert.equal(sent(append(result.session, duplicate), duplicate, {
    status: 'insufficient', feedback: { ...difficulty, kind: 'selfAssessment' },
  }).event, null)
  assert.equal(sent(result.session, turn, { status: 'insufficient', feedback: difficulty }).event, null)
  assert.equal(validatedLearningFeedback(turn.question, { ...difficulty, excerpt: '模型补写' }), null)
})

test('空日项目问答、迟到回复与同一周期任务的新实例保持各自归属，刷新拒绝跨项目回调', () => {
  const storage = memory()
  const first = newSession()
  const old = question(first, 'task-reply', 'practice', '我还是跟不上')
  const project = question(first, 'project-reply', null, '这个计划对我太难了')
  let session = advance(append(append(first, old), project))
  const newTurn = question(session, 'day-two', 'practice', '第二天怎么练？')
  session = append(session, newTurn)
  session = { ...session, effectivePlan: makePlan([makeTask('first')]) }
  const result = sent(session, old, { status: 'insufficient', feedback: difficulty })
  assert.equal(result.event, null)
  session = sent(result.session, project, { status: 'insufficient', feedback: { kind: 'direction', excerpt: project.question } }).session
  assert.equal(session.observations, undefined)
  assert.equal(saveDailyLearningSession(session, storage), true)
  const restored = loadLearningSession(storage).session
  assert.ok(restored.effectivePlan.tasks.every(({ id }) => id !== 'practice'))
  assert.deepEqual(scopedChatTurns(restored.messages, null, project).map(({ id }) => id), ['project-reply'])
  assert.deepEqual(scopedChatTurns(restored.messages, 'practice', old).map(({ id }) => id), ['task-reply'])
  assert.deepEqual(scopedChatTurns(restored.messages, 'practice', newTurn).map(({ id }) => id), ['day-two'])
  const replacement = newSession('other-project')
  assert.equal(reply(replacement, old, { status: 'error' }), replacement)
  const next = saveWithLearningObservation(restored, advance(restored), { type: 'advance' }, () => true)
  const context = buildLearningObservation(next.session, next.event)
  assert.ok(context.messages.some(({ evidenceId, feedback }) => evidenceId === 'message:project-reply' && feedback.kind === 'direction'))
  assert.ok(context.messages.some(({ evidenceId }) => evidenceId === 'message:task-reply'))
})

test('观测包保留依赖、历史未完成、可靠引用和曾提供帮助，并限制历史长度及项目边界', () => {
  let state = newSession()
  state = action(action(state, 'start', 'first'), 'complete', 'first')
  const turn = question(state, 'help', 'first', '如何观察手腕？')
  state = sent(append(state, turn), turn, { status: 'answered', answer: '已解释节奏', citations: sourceRefs }).session
  for (let i = 0; i < 10; i++) {
    state = advance(state)
    const extra = question(state, `p-${i}`, null, '问题'.repeat(280))
    state = append(state, extra)
  }
  state = { ...state, messages: [...state.messages, { ...turn, id: 'outside', projectId: 'another' }] }
  const { session, event } = saveWithLearningObservation(state, advance(state), { type: 'advance' }, () => true)
  const result = buildLearningObservation(session, event)
  assert.equal(result.recentDays.length, 5)
  assert.equal(result.plan.oneTime.completed, 1)
  assert.deepEqual(result.plan.effectiveTasks.find(({ id }) => id === 'reflection').prerequisiteTaskIds, ['first'])
  assert.ok(result.summaries.find(({ taskId }) => taskId === 'practice').consecutiveUnfinishedOffers > 4)
  assert.ok(result.messages.some(({ helpProvided }) => helpProvided === '已解释节奏'))
  assert.ok(result.messages.length <= 10 && result.messages.every(({ question }) => question.length <= 320))
  assert.ok(result.messages.every(({ evidenceId }) => evidenceId !== 'message:outside'))
  assert.equal(result.sources[0].excerpt, sourceRefs[0].excerpt)
  assert.equal(buildLearningObservation(advance(session), event), null)
})

test('已生效回执与随后练习分开，无实际操作便等待；失败提议不算变更', () => {
  const first = newSession()
  const { session, event } = saveWithLearningObservation(first, advance(first), { type: 'advance' }, () => true)
  const adjustments = [{ id: 'adjusted', action: 'ADJUST_PRACTICE', status: 'applied', dayId: 'day-2', appliedAt: at + 10, taskIds: ['practice'] },
    { id: 'failed', status: 'failed', dayId: 'day-2', appliedAt: at + 10, taskIds: ['practice'] }]
  let result = buildLearningObservation(session, event, { adjustments })
  assert.deepEqual(result.adjustments.map(({ receiptId, waitingForPractice }) => [receiptId, waitingForPractice]), [['receipt:adjusted', true]])
  const practiced = action(action(session, 'start', 'practice'), 'complete', 'practice')
  result = buildLearningObservation(practiced, event, { adjustments })
  assert.equal(result.adjustments[0].waitingForPractice, false)
  assert.equal(result.adjustments[0].subsequentPractice[0].evidenceId, 'instance:day-2:practice')
  assert.equal(result.adjustments[0].subsequentPractice[0].status, 'completed')
  const turn = { ...question(practiced, 'after-change', 'practice', '我还是跟不上'), createdAt: at + 40 }
  const reported = sent(append(practiced, turn), turn, { status: 'insufficient', feedback: difficulty })
  result = buildLearningObservation(reported.session, event, { adjustments })
  assert.equal(result.adjustments[0].subsequentFeedback[0].evidenceId, 'message:after-change')
})

test('旧 V2 没有观察字段时正常恢复，伪造事件、反馈和无归属消息不会保留', () => {
  const storage = memory()
  const first = newSession()
  const state = append(first, question(first, 'fake', null, '普通问题'))
  assert.equal(saveDailyLearningSession(state, storage), true)
  const raw = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  delete raw.observations
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(raw))
  assert.deepEqual(loadLearningSession(storage).session.observations, [])
  raw.observations = [{ id: 'nextDay:day-2', type: 'nextDay', dayId: 'day-2' },
    { id: 'taskFeedback:fake', type: 'taskFeedback', dayId: 'day-1', messageId: 'fake' }]
  raw.messages[0].feedback = difficulty
  raw.messages.push({ ...raw.messages[0], id: 'outside', projectId: 'wrong' })
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(raw))
  const restored = loadLearningSession(storage).session
  assert.deepEqual(restored.observations, [])
  assert.equal(restored.messages.length, 1)
  assert.equal(restored.messages[0].feedback, undefined)
})
