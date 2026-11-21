import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAgentChange } from '../src/agentActions.js'
import { applyPlanDelta } from '../src/agentPlanChanges.js'
import { activeLearningPlan, createDailySession, currentDayInstances, getOneTimeProgress, updateLearningDay } from '../src/learningDays.js'
import { AGENT_BUDGET, runLearningAgent } from '../src/learningAgent.js'
import { saveWithLearningObservation } from '../src/learningObservation.js'
import { LEARNING_SESSION_KEY, loadLearningSession, saveDailyLearningSession } from '../src/learningSessionStorage.js'
import { makePlan, makeTask, practice, sourceRefs } from './fixtures/dailyLearningPlan.js'
import { createLearningAgentHandler } from '../api/learning-agent.js'

const at = 1_800_001_000_000
const today = (session) => session.days.at(-1)
const task = (session, id) => activeLearningPlan(session).tasks.find((item) => item.id === id)
const act = (type, taskId, params = {}, extra = {}) => ({ type: 'act', reason: '依据现有记录提供少量帮助', evidenceIds: [],
  action: { type, ...(taskId ? { taskId } : {}), params }, ...extra })
const stop = (type = 'finish') => ({ type, reason: '先按现有安排练习', evidenceIds: [] })
const steps = [
  { text: '交替敲击。', sourceRefs }, { text: '听节奏是否均匀。', sourceRefs },
]
const exercise = { title: '检查交替敲击', minutes: 2, criterion: '听辨节奏是否均匀', steps }

function progress(session, type, id, now = at + 400, feedback = []) {
  return updateLearningDay(session, { type, dayId: today(session).id, instanceId: `${today(session).id}:${id}`, now, feedback })
}

function fixture(plan = makePlan(), start = (session) => session, limits) {
  let state = start(createDailySession(plan, 'agent-project', at, limits))
  const items = new Map()
  const storage = { setItem: (key, value) => items.set(key, value), getItem: (key) => items.get(key) ?? null }
  const read = () => state
  function commit(update) {
    const next = update(state)
    if (next === state) return state
    assert.equal(saveDailyLearningSession(next, storage), true)
    state = loadLearningSession(storage).session
    return state
  }
  function nextDay() {
    const old = state
    const next = updateLearningDay(old, { type: 'advance', dayId: today(old).id, now: at + 500 })
    const result = saveWithLearningObservation(old, next, { type: 'advance' }, (value) => saveDailyLearningSession(value, storage))
    state = loadLearningSession(storage).session
    return result.event
  }
  function feedback(id, text, taskId = 'practice', kind = 'difficulty') {
    const day = today(state)
    const turn = { id, projectId: state.projectId, taskId, instanceId: `${day.id}:${taskId}`, dayId: day.id, question: text,
      createdAt: at + 800, status: 'pending', answer: '', citations: [] }
    const before = { ...state, messages: [...state.messages, turn] }
    const after = { ...before, revision: before.revision + 2, messages: [...state.messages, {
      ...turn, status: 'insufficient', feedback: { kind, excerpt: text },
    }] }
    const result = saveWithLearningObservation(before, after, { type: 'chatReply', messageId: id }, (value) => saveDailyLearningSession(value, storage))
    state = loadLearningSession(storage).session
    return result.event
  }
  return { read, commit, storage, nextDay, feedback }
}

async function simulate(store, event, choose, options = {}) {
  const seen = []
  let n = 0
  const outcome = await runLearningAgent(event, {
    commit: store.commit, now: () => at + 1_000 + n++, ...options,
    request: async (input, signal) => {
      seen.push(input)
      if (input.operation === 'review') return { supported: options.review ? options.review(input) : true }
      const decision = await choose(input, signal)
      if (decision.type === 'act' && !['KEEP_PLAN', 'SEARCH_SOURCES'].includes(decision.action.type) && !decision.evidenceIds.length) {
        decision.evidenceIds = [input.frame.sources[0]?.evidenceId ?? input.frame.messages[0].evidenceId]
      }
      return { decision }
    },
  })
  return { outcome, seen, round: store.read().agent.rounds.find(({ eventId }) => eventId === event.id) }
}

test('KEEP_PLAN 保存实际决策且没有提示或调整；同一事件并发启动与刷新后均只执行一次', async () => {
  const store = fixture()
  const event = store.nextDay()
  const initial = store.read().plan
  const [first, duplicate] = await Promise.all([
    simulate(store, event, () => act('KEEP_PLAN')), simulate(store, event, () => act('KEEP_PLAN')),
  ])
  assert.deepEqual([first.outcome, duplicate.outcome], ['kept', 'ignored'])
  assert.equal(first.seen.length, 1)
  assert.equal(first.round.steps[0].receipt.status, 'kept')
  assert.equal(first.round.steps[0].intervention, false)
  assert.equal(store.read().agent.notes.length, 0)
  assert.equal(store.read().effectivePlan, null)
  assert.deepEqual(store.read().plan, initial)
  assert.equal((await simulate(store, event, () => assert.fail('replayed'))).outcome, 'ignored')
})

test('搜索、指导、语义核验和继续循环使用真实回执；指导可定位原文且不写计划', async () => {
  const store = fixture()
  const event = store.nextDay()
  const run = await simulate(store, event, ({ receipts }) => {
    if (!receipts.length) return act('SEARCH_SOURCES', null, { query: '交替敲击' })
    if (receipts.length === 1) {
      assert.equal(receipts[0].status, 'searched')
      assert.ok(receipts[0].sources[0].excerpt.includes('交替敲击'))
      return act('GUIDE', 'practice', { text: '交替敲击后听节奏是否均匀', sourceRefs },
        { evidenceIds: [receipts[0].sources[0].evidenceId] })
    }
    assert.equal(receipts[1].status, 'published')
    assert.equal(store.read().agent.notes[0].id, receipts[1].noteId)
    return stop()
  })
  assert.deepEqual(run.seen.map(({ operation }) => operation), ['decide', 'decide', 'review', 'decide'])
  assert.equal(run.outcome, 'finished')
  assert.equal(store.read().agent.notes[0].taskId, 'practice')
  assert.deepEqual(store.read().agent.notes[0].sourceRefs, sourceRefs)
  assert.equal(store.read().effectivePlan, null)
})

test('澄清真的进入教学记录并回传等待回执，没有用户回复仍可切日', async () => {
  const store = fixture()
  const event = store.nextDay()
  const run = await simulate(store, event, ({ remainingTools, receipts }) => {
    if (!receipts.length) return act('CLARIFY', 'practice', { question: '你遇到的是时间不足，还是敲击动作不清楚？' })
    assert.equal(receipts.at(-1).awaitsUser, true)
    assert.equal(remainingTools, 0)
    return stop('wait')
  })
  assert.equal(run.outcome, 'waiting')
  assert.equal(store.read().agent.notes[0].type, 'CLARIFY')
  const day3 = store.nextDay()
  const duplicate = await simulate(store, day3, ({ receipts }) => receipts.length ? stop()
    : act('CLARIFY', 'practice', { question: '你遇到的是时间不足，还是敲击动作不清楚？' }))
  assert.equal(duplicate.round.steps[0].receipt.code, 'already_provided')
  assert.equal(today(store.read()).dayNumber, 3)
})

test('已公开的提示在同一轮换措辞也不重复发布，后续观察在没有新实践时仍等待', async () => {
  const store = fixture()
  const run = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length < 2
    ? act('GUIDE', 'practice', { text: receipts.length ? '留意敲击节奏均匀' : '敲击时听节奏是否均匀', sourceRefs })
    : stop())
  assert.equal(run.round.steps[1].receipt.code, 'already_provided')
  assert.equal(store.read().agent.notes.length, 1)
  const next = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('GUIDE', 'practice', { text: '交替敲击并留意节奏', sourceRefs }))
  assert.equal(next.round.steps[0].receipt.code, 'already_provided')
  assert.equal(store.read().agent.notes.length, 1)
})

test('拆解要确认，子任务按顺序安排并保留原目标；撤销无活动的调整不修改历史', async () => {
  const store = fixture()
  const event = store.nextDay()
  const originalDays = store.read().days
  const run = await simulate(store, event, ({ receipts }) => receipts.length ? stop('wait')
    : act('DECOMPOSE_TASK', 'first', { parts: [{ ...exercise, title: '准备姿势' }, exercise] }))
  assert.equal(run.outcome, 'waiting')
  assert.equal(run.round.steps[0].receipt.status, 'pendingConfirmation')
  assert.equal(run.round.steps[0].needsConfirmation, true)
  assert.equal(store.read().effectivePlan, null)
  const proposal = store.read().agent.changes[0]
  let state = store.commit((session) => resolveAgentChange(session, proposal.id, 'accept', at + 2_000))
  const [part, second] = state.agent.changes[0].delta.tasks
  assert.equal(task(state, 'first').objective, task({ plan: state.plan }, 'first').objective)
  assert.deepEqual(task(state, 'first').prerequisiteTaskIds, [second.taskId])
  assert.deepEqual(task(state, second.taskId).prerequisiteTaskIds, [part.taskId])
  assert.ok(today(state).instances.some(({ task }) => task.id === part.taskId))
  assert.ok(today(state).instances.every(({ task }) => task.id !== second.taskId))
  assert.deepEqual(state.days[0], originalDays[0])
  assert.equal(resolveAgentChange(state, proposal.id, 'accept', at + 2_000), state)
  state = store.commit((session) => resolveAgentChange(session, proposal.id, 'undo', at + 2_001))
  assert.equal(state.agent.changes[0].status, 'undone')
  assert.equal(task(state, part.taskId), undefined)
  assert.deepEqual(state.days[0], originalDays[0])
})

test('带问答的旧实例保留只读记录，确认新增前置后仍须完成两步才能开始原任务', async () => {
  const plan = makePlan([makeTask('first'), makeTask('reflection', { prerequisiteTaskIds: ['first'] })])
  const store = fixture(plan, undefined, { minutes: 6, tasks: 3 })
  const event = store.nextDay()
  store.commit((state) => ({ ...state, messages: [{
    id: 'prior-question', projectId: state.projectId, dayId: 'day-2', instanceId: 'day-2:first', taskId: 'first',
    question: '还需要先练什么？', status: 'insufficient', createdAt: at + 510, answer: '', citations: [],
  }] }))
  await simulate(store, event, ({ receipts }) => receipts.length ? stop()
    : act('DECOMPOSE_TASK', 'first', { parts: [{ ...exercise, title: '准备姿势' }, exercise] }))
  const proposal = store.read().agent.changes[0]
  let state = store.commit((session) => resolveAgentChange(session, proposal.id, 'accept', at + 2_000))
  const [part, second] = state.agent.changes[0].delta.tasks
  assert.equal(today(state).instances.find(({ task }) => task.id === 'first').held, true)
  assert.equal(state.messages[0].instanceId, 'day-2:first')
  assert.deepEqual(currentDayInstances(state).map(({ task }) => task.id), [part.taskId])
  assert.equal(progress(state, 'start', 'first', at + 2_001), state)
  state = store.commit((session) => progress(progress(session, 'start', part.taskId), 'complete', part.taskId))
  assert.ok(currentDayInstances(state).some(({ task }) => task.id === second.taskId))
  assert.equal(progress(state, 'start', 'first', at + 2_001), state)
  store.commit((session) => progress(progress(session, 'start', second.taskId), 'complete', second.taskId))
  store.nextDay()
  const after = store.read()
  assert.ok(currentDayInstances(after).some(({ task }) => task.id === 'first'))
  assert.equal(after.days[1].instances.find(({ task }) => task.id === 'first').status, 'notStarted')
  assert.equal(after.messages[0].id, 'prior-question')
})

test('练习调整影响可执行步骤、难度和两类间隔；已开始任务需要用户确认', async () => {
  const store = fixture()
  const event = store.nextDay()
  store.commit((state) => progress(state, 'start', 'practice', at + 510))
  const params = { minutes: 3, frequency: 2, reviewAfter: 3, difficulty: { text: '聚焦一次交替敲击', sourceRefs }, steps }
  const run = await simulate(store, event, ({ receipts }) => receipts.length ? stop('wait') : act('ADJUST_PRACTICE', 'practice', params))
  assert.equal(run.round.steps[0].receipt.status, 'pendingConfirmation')
  assert.equal(task(store.read(), 'practice').estimatedMinutes, 6)
  const change = store.read().agent.changes[0]
  const state = store.commit((session) => resolveAgentChange(session, change.id, 'accept', at + 2_000))
  const updated = task(state, 'practice')
  assert.equal(updated.estimatedMinutes, 3)
  assert.equal(updated.practice.frequency.interval, 2)
  assert.equal(updated.practice.reviewAfter.interval, 3)
  assert.deepEqual(updated.practice.difficulty, params.difficulty)
  assert.deepEqual(updated.steps, steps)
  const instance = today(state).instances.find(({ task }) => task.id === 'practice')
  assert.equal(instance.startedAt, at + 510)
  assert.equal(instance.task.estimatedMinutes, 3)
  assert.equal(state.days[0].instances.find(({ task }) => task.id === 'practice').task.estimatedMinutes, 6)
})

test('低影响频率和时长自动生效，尚未实践默认等待；有记录后的恢复另写一条变更', async () => {
  const store = fixture()
  let event = store.nextDay()
  await simulate(store, event, ({ receipts }) => receipts.length ? stop() : act('ADJUST_PRACTICE', 'practice', { minutes: 4, frequency: 2 }))
  const first = store.read().agent.changes[0]
  assert.equal(first.status, 'applied')
  assert.equal(first.needsConfirmation, false)
  event = store.nextDay()
  const blocked = await simulate(store, event, ({ receipts }) => receipts.length ? stop() : act('ADJUST_PRACTICE', 'practice', { minutes: 3 }))
  assert.equal(blocked.round.steps[0].receipt.code, 'awaiting_practice')
  store.nextDay()
  store.commit((state) => progress(progress(state, 'start', 'practice', at + 2_000), 'complete', 'practice', at + 2_001))
  const before = store.read()
  assert.equal(resolveAgentChange(before, first.id, 'undo', at + 3_000), before)
  const restored = store.commit((session) => resolveAgentChange(session, first.id, 'restore', at + 3_000))
  assert.equal(restored.agent.changes[0].revertedBy, `restore:${first.id}`)
  assert.equal(restored.agent.changes[1].restores, first.id)
  assert.equal(task(restored, 'practice').estimatedMinutes, 6)
  assert.deepEqual(restored.days, before.days)
})

test('用户反馈后可调整尚未开始的今日实例，原问答和变更前内容仍可恢复', async () => {
  const store = fixture()
  const event = store.feedback('today-feedback', '这项练习今天还没有开始，我只有三分钟')
  await simulate(store, event, ({ receipts }) => receipts.length ? stop() : act('ADJUST_PRACTICE', 'practice', { minutes: 3 }))
  const snapshot = loadLearningSession(store.storage).session
  const instance = today(snapshot).instances.find(({ task }) => task.id === 'practice')
  assert.equal(instance.id, 'day-1:practice')
  assert.equal(instance.task.estimatedMinutes, 3)
  assert.equal(snapshot.agent.changes[0].delta.tasks[0].before.estimatedMinutes, 6)
  assert.equal(snapshot.messages[0].instanceId, instance.id)
  assert.equal(snapshot.messages[0].question, '这项练习今天还没有开始，我只有三分钟')
})

test('连续困难的多日观察可以促成实际调整，再依据真实练习和用户反馈观察其效果', async () => {
  const store = fixture()
  store.feedback('difficulty-one', '我分不清节奏是否均匀')
  store.nextDay()
  store.feedback('difficulty-two', '我还是听不明白哪一下偏快')
  store.nextDay()
  const event = store.feedback('difficulty-three', '完整练习对我太难了，想先练一小段')
  const run = await simulate(store, event, ({ frame, receipts }) => {
    if (receipts.length) return stop('wait')
    assert.equal(frame.summaries.find(({ taskId }) => taskId === 'practice').consecutiveUnfinishedOffers, 2)
    assert.ok(frame.messages.some(({ evidenceId }) => evidenceId === 'message:difficulty-one'))
    assert.ok(frame.messages.some(({ evidenceId }) => evidenceId === 'message:difficulty-three'))
    return act('ADJUST_PRACTICE', 'practice', { minutes: 3 }, { evidenceIds: ['message:difficulty-three'] })
  })
  assert.equal(run.round.steps[0].receipt.status, 'applied')
  store.commit((state) => progress(progress(state, 'start', 'practice', at + 4_000), 'complete', 'practice', at + 4_001))
  const next = store.nextDay()
  const followed = await simulate(store, next, ({ frame }) => {
    assert.equal(frame.adjustments[0].waitingForPractice, false)
    assert.equal(frame.adjustments[0].subsequentPractice[0].status, 'completed')
    assert.equal(frame.adjustments[0].subsequentPractice[0].id, 'day-3:practice')
    return stop('wait')
  })
  assert.equal(followed.outcome, 'waiting')
})

test('重复完成和自述熟练只作为证据，模型可提供独立选学自检', async () => {
  const store = fixture()
  store.commit((state) => progress(progress(state, 'start', 'practice'), 'complete', 'practice'))
  store.nextDay()
  store.commit((state) => progress(progress(state, 'start', 'practice'), 'complete', 'practice'))
  store.nextDay()
  const event = store.feedback('self-report', '现在觉得交替敲击已经熟练了', 'practice', 'selfAssessment')
  const run = await simulate(store, event, ({ frame, receipts }) => {
    if (receipts.length) return stop()
    assert.equal(frame.summaries.find(({ taskId }) => taskId === 'practice').completedInstances, 2)
    assert.equal(frame.messages.find(({ evidenceId }) => evidenceId === 'message:self-report').feedback.kind, 'selfAssessment')
    return act('CHECK_MASTERY', 'practice', exercise, { evidenceIds: ['message:self-report'] })
  })
  const assignment = currentDayInstances(store.read()).find((item) => item.task.id === run.round.steps[0].receipt.changeId)
  assert.ok(assignment.optional && assignment.task.selfCheck)
  assert.equal(assignment.status, 'notStarted')
  assert.equal(getOneTimeProgress(store.read().days).size, 0)
})

test('拆解已生效且尚未实践时，同一困难不会重复改变任务', async () => {
  const store = fixture()
  const parts = [{ ...exercise, title: '准备姿势' }, exercise]
  await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop('wait') : act('DECOMPOSE_TASK', 'first', { parts }))
  const change = store.read().agent.changes[0]
  store.commit((state) => resolveAgentChange(state, change.id, 'accept', at + 4_000))
  const next = store.nextDay()
  const result = await simulate(store, next, ({ frame, receipts }) => {
    assert.equal(frame.adjustments[0].waitingForPractice, true)
    return receipts.length ? stop('wait') : act('DECOMPOSE_TASK', 'first', { parts })
  })
  assert.equal(result.round.steps[0].receipt.code, 'awaiting_practice')
  assert.equal(store.read().agent.changes.length, 1)
})

test('新困难例外必须有调整后原话，既有困难不能凭模型标签覆盖保护', async () => {
  const store = fixture()
  await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop() : act('ADJUST_PRACTICE', 'practice', { minutes: 4 }))
  const fake = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('ADJUST_PRACTICE', 'practice', { minutes: 3 }, { exception: 'newSevereDifficulty' }))
  assert.equal(fake.round.steps[0].receipt.code, 'awaiting_practice')
  const newer = store.feedback('new', '这次即使缩短了也完全听不出敲击是否均匀')
  store.commit((state) => ({ ...state, revision: state.revision + 1, messages: state.messages.map((item) =>
    item.id === 'new' ? { ...item, createdAt: at + 2_000 } : item) }))
  const result = await simulate(store, newer, ({ receipts }) => receipts.length ? stop()
    : act('ADJUST_PRACTICE', 'practice', { minutes: 3 }, { exception: 'newSevereDifficulty', evidenceIds: ['message:new'] }))
  assert.equal(result.round.steps[0].receipt.status, 'applied')
  assert.equal(task(store.read(), 'practice').estimatedMinutes, 3)
})

test('安排变更可延期、优先无依赖任务及巩固已完成任务，不绕过前置或重写原完成', async () => {
  const store = fixture(makePlan(), (state) => progress(progress(state, 'start', 'first'), 'complete', 'first'))
  const run = await simulate(store, store.nextDay(), ({ receipts }) => {
    if (!receipts.length) return act('RESCHEDULE', 'practice', { operation: 'defer', days: 2 })
    if (receipts.length === 1) return act('RESCHEDULE', 'reflection', { operation: 'advance' })
    if (receipts.length === 2) return act('RESCHEDULE', 'first', { operation: 'reinforce' })
    return stop()
  })
  assert.deepEqual(run.round.steps.slice(0, 3).map(({ receipt }) => receipt.status), ['applied', 'applied', 'applied'])
  assert.ok(today(store.read()).instances.every(({ task }) => task.id !== 'practice'))
  store.nextDay()
  assert.equal(today(store.read()).instances[0].task.id, 'reflection')
  const reinforcement = today(store.read()).instances.find(({ task }) => task.title.startsWith('巩固'))
  assert.ok(reinforcement.optional)
  assert.equal(store.read().days[0].instances.find(({ task }) => task.id === 'first').completedAt, at + 400)
  assert.ok(today(store.read()).instances.every(({ task }) => task.id !== 'first'))
  const other = fixture()
  await simulate(other, other.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('RESCHEDULE', 'reflection', { operation: 'advance' }))
  other.nextDay()
  assert.ok(today(other.read()).instances.every(({ task }) => task.id !== 'reflection'))
})

test('自检出现为真实可做的选学，满配额时可在下一日提供，不等于掌握或主线完成', async () => {
  const store = fixture()
  const run = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('CHECK_MASTERY', 'practice', exercise))
  const id = run.round.steps[0].receipt.changeId
  assert.ok(today(store.read()).instances.find(({ task }) => task.id === id).optional)
  let state = store.commit((session) => progress(progress(session, 'start', id), 'complete', id, at + 2_001, [exercise.criterion]))
  const check = today(state).instances.find(({ task }) => task.id === id)
  assert.deepEqual(check.feedback, [exercise.criterion])
  assert.equal(getOneTimeProgress(state.days).size, 0)
  assert.equal(state.days[0].instances.find(({ task }) => task.id === 'practice').status, 'notStarted')
  const full = fixture(makePlan(), undefined, { minutes: 6, tasks: 1 })
  await simulate(full, full.nextDay(), ({ receipts }) => receipts.length ? stop() : act('CHECK_MASTERY', 'first', exercise))
  full.nextDay()
  assert.ok(today(full.read()).instances[0].task.selfCheck)
  assert.equal(today(full.read()).instances[0].optional, true)
})

test('伪造证据、未知任务、直接越权参数和无依据指导均被拒；合法修正可真正执行', async () => {
  const store = fixture()
  const run = await simulate(store, store.nextDay(), ({ receipts }) => {
    if (!receipts.length) return act('REMOVE_SOURCE', 'practice', { id: 'source' }, { evidenceIds: ['made-up'] })
    if (receipts.length === 1) return act('GUIDE', 'no-task', { text: '提示', sourceRefs })
    if (receipts.length === 2) return act('ADJUST_PRACTICE', 'practice', { completionCriteria: '假完成', objective: '改变目标', minutes: 3 })
    return stop()
  })
  assert.deepEqual(run.round.steps.slice(0, 3).map(({ receipt }) => receipt.code),
    ['unknown_evidence', 'unknown_task', 'invalid_practice'])
  assert.equal(store.read().effectivePlan, null)
  const external = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('REPLAN_AND_EXECUTE', null, { endpoint: 'https://invalid.example/', status: 'completed' }))
  assert.equal(external.round.steps[0].receipt.code, 'unknown_action')
  const corrected = await simulate(store, store.nextDay(), ({ receipts }) => {
    if (!receipts.length) return act('GUIDE', 'practice', { text: '音高必须升两度', sourceRefs })
    if (receipts.length === 1) return act('ADJUST_PRACTICE', 'practice', { minutes: 4 })
    return stop()
  }, { review: ({ action }) => action !== 'GUIDE' })
  assert.deepEqual(corrected.round.steps.slice(0, 2).map(({ receipt }) => receipt.code ?? receipt.status), ['unsupported_material', 'applied'])
  assert.equal(store.read().agent.notes.length, 0)
  assert.equal(task(store.read(), 'practice').estimatedMinutes, 4)
})

test('原文频率、拒绝过的提案和过期确认受保护，非法依赖不会进入日程', async () => {
  const natural = { ...practice, frequency: { unit: 'elapsedMinutes', interval: 2880, basis: 'source',
    sourceRefs: [{ sourceId: 'src_1', excerpt: '两次练习相隔48小时。' }] } }
  const store = fixture(makePlan([makeTask('practice', { type: 'recurring', practice: natural }), makeTask('setup')]))
  const run = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('ADJUST_PRACTICE', 'practice', { frequency: 2 }))
  assert.equal(run.round.steps[0].receipt.code, 'source_timing')
  const high = act('DECOMPOSE_TASK', 'setup', { parts: [exercise, { ...exercise, title: '下一小步' }] })
  await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop('wait') : high)
  const id = store.read().agent.changes[0].id
  store.commit((state) => resolveAgentChange(state, id, 'reject', at + 3_000))
  const repeat = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('DECOMPOSE_TASK', 'setup', high.action.params))
  assert.equal(repeat.round.steps[0].receipt.code, 'user_already_declined')
  const different = [exercise, { ...exercise, title: '改用两小步' }]
  await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop('wait')
    : act('DECOMPOSE_TASK', 'setup', { parts: different }))
  const pending = store.read().agent.changes.at(-1)
  const invalid = structuredClone(pending.delta)
  invalid.tasks[0].after.prerequisiteTaskIds.push(invalid.tasks[0].taskId)
  assert.equal(applyPlanDelta(store.read(), invalid, at + 3_500), null)
  store.nextDay()
  assert.equal(resolveAgentChange(store.read(), pending.id, 'accept', at + 4_000), store.read())
  assert.equal(store.read().effectivePlan, null)
})

test('缩短时长仍要核验原文要求，核验也消耗整轮模型预算', async () => {
  const store = fixture()
  const rejected = await simulate(store, store.nextDay(), ({ receipts }) => receipts.length ? stop()
    : act('ADJUST_PRACTICE', 'practice', { minutes: 2 }), { review: ({ material }) => {
      assert.equal(material.target.estimatedMinutes, 6)
      assert.equal(material.updates[0].estimatedMinutes, 2)
      return false
    } })
  assert.equal(rejected.round.steps[0].receipt.code, 'unsupported_material')
  assert.equal(task(store.read(), 'practice').estimatedMinutes, 6)

  const limited = await simulate(store, store.nextDay(), ({ receipts }) => {
    if (!receipts.length) return act('GUIDE', 'practice', { text: '听敲击节奏是否均匀', sourceRefs })
    if (receipts.length === 1) return act('ADJUST_PRACTICE', 'practice', { minutes: 4 })
    return act('CHECK_MASTERY', 'first', exercise)
  })
  assert.equal(limited.outcome, 'budget')
  assert.equal(limited.seen.length, 5)
  assert.equal(limited.seen.filter(({ operation }) => operation === 'review').length, 2)
  assert.equal(store.read().agent.changes.length, 1)
  assert.ok(activeLearningPlan(store.read()).tasks.every(({ selfCheck }) => !selfCheck))
})

test('中断、超时、调用预算和日程推进期间的过期响应均不会串写', async () => {
  const store = fixture()
  const timed = await simulate(store, store.nextDay(), () => new Promise(() => {}),
    { budget: { ...AGENT_BUDGET, totalMs: 20 } })
  assert.equal(timed.outcome, 'timeout')
  assert.equal(today(store.read()).dayNumber, 2)
  assert.equal(store.read().effectivePlan, null)
  const limited = await simulate(store, store.nextDay(), () => act('SEARCH_SOURCES', null, { query: '敲击' }))
  assert.equal(limited.outcome, 'budget')
  assert.equal(limited.seen.length, 4)
  assert.equal(limited.round.steps.length, 3)
  const failed = await simulate(store, store.nextDay(), () => { throw new Error('network') })
  assert.equal(failed.outcome, 'failed')
  const stale = await simulate(store, store.nextDay(), () => {
    store.nextDay()
    return act('ADJUST_PRACTICE', 'practice', { minutes: 2 })
  })
  assert.equal(stale.outcome, 'stale')
  assert.equal(store.read().agent.changes.length, 0)
  assert.equal(JSON.parse(store.storage.getItem(LEARNING_SESSION_KEY)).agent.rounds.at(-1).status, 'stale')
})

test('API 只请求现有 DeepSeek 端点，返回受限决策，服务异常和上游超时可区分', async () => {
  const payload = { operation: 'decide', frame: { recentDays: [], messages: [], sources: [] }, receipts: [], remainingTools: 3 }
  const send = (handler, body = payload) => handler(new Request('http://localhost/api/learning-agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
  const result = (value) => Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] })
  assert.equal((await send(createLearningAgentHandler({ env: {} }))).status, 503)
  const env = { DEEPSEEK_API_KEY: 'test-only' }
  const handler = createLearningAgentHandler({ env, fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions')
    assert.equal(JSON.parse(options.body).model, 'deepseek-flash')
    assert.doesNotMatch(JSON.parse(options.body).messages[1].content, /unauthorized/)
    return result(act('KEEP_PLAN'))
  } })
  assert.equal((await (await send(handler, { ...payload, endpoint: 'unauthorized' })).json()).decision.action.type, 'KEEP_PLAN')
  assert.equal((await send(handler, { ...payload, receipts: Array(4).fill({}) })).status, 400)
  assert.equal((await send(handler, { ...payload, oversized: 'a'.repeat(93_000) })).status, 413)
  assert.equal((await send(createLearningAgentHandler({ env, fetchImpl: async () => result({ unrelated: true }) }))).status, 502)
  const slow = createLearningAgentHandler({ env, timeoutMs: 5, fetchImpl: async (_url, { signal }) => {
    await new Promise((resolve) => setTimeout(resolve, 15))
    if (signal.aborted) throw new Error('timeout')
    return result(act('KEEP_PLAN'))
  } })
  assert.equal((await send(slow)).status, 504)
})
