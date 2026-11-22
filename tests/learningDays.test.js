import assert from 'node:assert/strict'
import test from 'node:test'
import { activeLearningPlan, createDailySession, getOneTimeProgress, updateLearningDay } from '../src/learningDays.js'
import { LEARNING_SESSION_KEY, loadLearningSession, saveDailyLearningSession, saveLearningSession } from '../src/learningSessionStorage.js'
import { continueAnalysis, startAnalysis } from '../src/analysisFlow.js'
import { makePlan, makeTask, practice, sourceRefs } from './fixtures/dailyLearningPlan.js'

const at = Date.UTC(2026, 10, 21, 6)
const current = (session) => session.days.at(-1)
const ids = (session) => current(session).instances.map(({ task }) => task.id)
const newSession = (plan = makePlan(), limits) => createDailySession(plan, 'demo', at, limits)
const advance = (session, now = at + 1) => updateLearningDay(session, { type: 'advance', dayId: current(session).id, now })

function work(session, taskId, type, feedback, now = at + 1) {
  return updateLearningDay(session, { type, dayId: current(session).id, now, instanceId: `${current(session).id}:${taskId}`, feedback })
}

function finish(session, id, feedback) {
  return work(work(session, id, 'start'), id, 'complete', feedback)
}

function memoryStorage() {
  const records = new Map()
  return { getItem: (key) => records.get(key) ?? null, setItem: (key, value) => records.set(key, value) }
}

test('Day 1 并行组装一次性任务与到期周期练习，完成后只解锁选学', () => {
  const session = newSession()
  assert.deepEqual(ids(session), ['first', 'practice'])
  const next = finish(session, 'first')
  assert.deepEqual(ids(next), ['first', 'practice', 'reflection'])
  assert.equal(current(next).instances.at(-1).optional, true)
  assert.equal(current(next).instances.filter(({ optional }) => !optional).length, 2)
  assert.deepEqual([...getOneTimeProgress(next.days)], ['first'])
  assert.equal(current(session).instances[0].status, 'notStarted')
  assert.deepEqual(newSession(), session)
})

test('主动跨日封存真实时间和未完成状态，同自然日推进也不会补练或补记完成', () => {
  const session = work(newSession(), 'first', 'start')
  const next = advance(session)
  const last = advance(next)
  assert.equal(last.days.length, 3)
  assert.equal(next.days[0].endedAt, next.days[1].startedAt)
  assert.equal(last.days[2].startedAt, at + 1)
  assert.deepEqual(last.days[0].instances.map(({ status }) => status), ['inProgress', 'notStarted'])
  assert.equal(last.days[0].instances[0].completedAt, null)
  assert.deepEqual(ids(next), ['first', 'practice'])
  assert.equal(ids(last).filter((id) => id === 'practice').length, 1)
  assert.notEqual(next.days[0].instances[1].id, current(next).instances[1].id)
  assert.equal(getOneTimeProgress(last.days).size, 0)
})

test('48 小时间隔仅依模拟时间，同一墙钟到 Day 3 即到期', () => {
  const natural = { ...practice, frequency: { unit: 'elapsedMinutes', interval: 2880, basis: 'source',
    sourceRefs: [{ sourceId: 'src_1', excerpt: '两次练习相隔48小时。' }] } }
  const everyTwo = { ...practice, frequency: { ...practice.frequency, interval: 2 } }
  const plan = makePlan([makeTask('elapsed', { type: 'recurring', practice: natural }),
    makeTask('learningDay', { type: 'recurring', practice: everyTwo })])
  const first = finish(newSession(plan), 'elapsed')
  const second = advance(first)
  assert.deepEqual(ids(second), [])
  assert.deepEqual(ids(advance(first, at + 2880 * 60_000 + 1)), [])
  const session = advance(second)
  assert.deepEqual(ids(session), ['elapsed', 'learningDay'])
  assert.deepEqual(session.days.map(({ simulatedMinute }) => simulatedMinute), [0, 1440, 2880])
  assert.equal(current(session).startedAt, at + 1)
  assert.deepEqual([...getOneTimeProgress(session.days)], [])
})

test('自检反馈与单次完成分别解锁，未入门的周期任务不能提前开始', () => {
  const plan = makePlan([
    makeTask('setup'),
    makeTask('practice', { type: 'recurring', practice: { ...practice, startCondition: 'afterPrerequisites' },
      prerequisiteTaskIds: ['setup'] }),
    makeTask('completed-gate', { prerequisiteTaskIds: ['practice'], prerequisiteGates: [{ taskId: 'practice', kind: 'practiceCompletion' }] }),
    makeTask('feedback-gate', { prerequisiteTaskIds: ['practice'],
      prerequisiteGates: [{ taskId: 'practice', kind: 'selfCheckFeedback', criterion: '动作平稳' }] }),
  ])
  const opened = finish(newSession(plan), 'setup')
  assert.deepEqual(ids(opened), ['setup', 'practice'])
  assert.equal(current(opened).instances[1].optional, true)
  const withoutCheck = finish(opened, 'practice', ['布尔猜测'])
  assert.deepEqual(ids(withoutCheck), ['setup', 'practice', 'completed-gate'])
  assert.deepEqual(current(withoutCheck).instances[1].feedback, [])
  const withCheck = finish(opened, 'practice', ['动作平稳'])
  assert.deepEqual(ids(withCheck), ['setup', 'practice', 'completed-gate', 'feedback-gate'])
})

test('任务和时长双限，积压与独立任务轮流出现，解锁满额后保留到下日', () => {
  const pool = Array.from({ length: 12 }, (_, index) => makeTask(`t${index}`))
  const first = newSession(makePlan(pool))
  const second = advance(first)
  assert.equal(ids(first).length, 5)
  assert.equal(ids(second).length, 5)
  assert.ok(ids(second).every((id) => !ids(first).includes(id)))
  const longer = newSession(makePlan(pool.map((task) => ({ ...task, estimatedMinutes: 11 }))))
  assert.equal(current(longer).limits.minutes, 30)
  assert.equal(ids(longer).length, 2)
  assert.equal(current(longer).instances.reduce((minutes, { task }) => minutes + task.estimatedMinutes, 0), 22)
  const short = newSession(makePlan(), { minutes: 6, tasks: 1 })
  assert.deepEqual(ids(finish(short, 'first')), ['first'])
  assert.deepEqual(ids(advance(finish(short, 'first'))), ['practice'])
  assert.deepEqual(ids(advance(advance(finish(short, 'first')))), ['reflection'])
})

test('调度只消费有效计划，保留历史内容与完成时间，巩固项使用新 ID', () => {
  const old = finish(newSession(), 'first')
  const changed = makePlan([
    makeTask('first', { title: '已调整的定义' }), makeTask('add', { title: '重练握姿' }),
  ])
  const pending = advance({ ...old, proposedPlan: changed })
  assert.equal(ids(pending).includes('add'), false)
  const applied = advance({ ...old, effectivePlan: changed })
  assert.deepEqual(ids(applied), ['add'])
  assert.equal(applied.days[0].instances[0].task.title, '准备握姿')
  assert.equal(applied.days[0].instances[0].completedAt, current(old).instances[0].completedAt)
  assert.equal(applied.plan.tasks[0].title, '准备握姿')
  assert.equal(activeLearningPlan(applied).tasks[0].title, '已调整的定义')
})

test('同一日推进、开始和完成可重试，陈旧动作不影响新日', () => {
  const original = newSession()
  const action = { type: 'advance', dayId: 'day-1', now: at }
  const next = updateLearningDay(original, action)
  assert.equal(updateLearningDay(next, action), next)
  assert.equal(work(original, 'first', 'complete'), original)
  const started = work(original, 'first', 'start')
  assert.equal(work(started, 'first', 'start'), started)
  const completed = work(started, 'first', 'complete')
  assert.equal(work(completed, 'first', 'complete'), completed)
  assert.equal(updateLearningDay(next, { type: 'complete', dayId: 'day-1', instanceId: 'day-1:first', now: at }), next)
})

test('V2 快照恢复原始与有效计划、封存实例和发送日，原文只存一份', () => {
  const previous = advance(finish(newSession(), 'first'))
  const effectivePlan = makePlan()
  effectivePlan.tasks[0].title = '调整后的握姿练习'
  const session = { ...previous, effectivePlan, messages: [
    { id: 'reply', projectId: 'demo', dayId: 'day-1', instanceId: 'day-1:first', taskId: 'first',
      question: '怎么练习？', answer: '交替敲击并留意节奏', status: 'answered', citations: sourceRefs, createdAt: at },
    { id: 'unknown', projectId: 'demo', dayId: 'day-2', instanceId: 'day-1:first', taskId: 'first',
      question: '无实际关联', status: 'pending', createdAt: at },
  ] }
  const storage = memoryStorage()
  assert.equal(saveDailyLearningSession(session, storage), true)
  const raw = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  assert.equal(raw.effectivePlan.sources, undefined)
  assert.equal(raw.plan.planVersion, 2)
  const loaded = loadLearningSession(storage)
  assert.equal(loaded.status, 'restored')
  assert.deepEqual(loaded.plan.sources, session.plan.sources)
  assert.equal(loaded.session.days.length, 2)
  assert.equal(activeLearningPlan(loaded.session).tasks[0].title, '调整后的握姿练习')
  assert.equal(loaded.session.days[0].instances[0].task.title, '准备握姿')
  assert.equal(loaded.session.days[0].instances[0].completedAt, at + 1)
  assert.deepEqual(loaded.session.messages, [session.messages[0]])
  assert.deepEqual(ids(loaded.session), ids(session))
  assert.deepEqual(raw.days.map(({ simulatedMinute }) => simulatedMinute), [0, 1440])
  delete raw.days[0].simulatedMinute
  delete raw.days[1].simulatedMinute
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(raw))
  const legacy = loadLearningSession(storage).session
  assert.equal(current(legacy).simulatedMinute, 1440)
  assert.equal(current(advance(legacy)).simulatedMinute, 2880)

  raw.days[0].instances[0].task.steps[0].sourceRefs[0].excerpt = '伪造引用'
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(raw))
  assert.equal(loadLearningSession(storage).status, 'invalid')
  assert.equal(JSON.parse(storage.getItem(LEARNING_SESSION_KEY)).days[0].instances[0].task.steps[0].sourceRefs[0].excerpt, '伪造引用')
  assert.equal(saveDailyLearningSession(session, { setItem() { throw new Error('full') } }), false)
})

test('仍打开的 V1 学习视图不能覆盖已存在的 V2 会话', () => {
  const storage = memoryStorage()
  const legacy = { ...makePlan(), planVersion: undefined }
  assert.equal(saveLearningSession(legacy, { currentTaskId: 'first', completedTaskIds: [] }, storage), true)
  assert.equal(loadLearningSession(storage).plan.planVersion, undefined)
  const session = newSession()
  assert.equal(saveDailyLearningSession(session, storage), true)
  assert.equal(saveLearningSession(legacy, { currentTaskId: 'practice', completedTaskIds: ['first'] }, storage), false)
  assert.equal(loadLearningSession(storage).session.projectId, session.projectId)
})

test('旧快照保留已封存练习，对缺时间依据的旧频率恢复为教学建议', () => {
  const storage = memoryStorage()
  const legacy = advance(finish(newSession(), 'practice'))
  assert.ok(saveDailyLearningSession(legacy, storage))
  const snapshot = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  const unsupported = { unit: 'elapsedMinutes', interval: 99, basis: 'source', sourceRefs }
  snapshot.plan.tasks.find(({ id }) => id === 'practice').practice.frequency = unsupported
  for (const day of snapshot.days) day.instances.find(({ task }) => task.id === 'practice').task.practice.frequency = unsupported
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(snapshot))
  const restored = loadLearningSession(storage)
  assert.equal(restored.status, 'restored')
  assert.deepEqual(restored.session.plan.tasks.find(({ id }) => id === 'practice').practice.frequency, practice.frequency)
  assert.deepEqual(restored.session.days[0].instances.find(({ task }) => task.id === 'practice').task.practice.frequency, unsupported)
  assert.ok(saveDailyLearningSession(restored.session, storage))
})

test('新项目在部分读取失败及澄清后仍按 V2 协议规划', async () => {
  const plan = makePlan()
  const stages = []
  const service = {
    readSources: async () => ({ status: 'ready', sources: plan.sources, requiresConfirmation: true }),
    planLearning: async ({ planVersion, clarification }) => {
      assert.equal(planVersion, 2)
      assert.equal(clarification === undefined || clarification === '打击乐', true)
      return clarification ? plan : { status: 'needsClarification' }
    },
  }
  const initial = await startAnalysis([], (stage) => stages.push(stage), service, 2)
  assert.equal(initial.phase, 'confirmation')
  const clarifying = await continueAnalysis({ sources: initial.result.sources, confirmPartial: true, planVersion: initial.planVersion }, () => {}, service)
  assert.equal(clarifying.phase, 'clarification')
  const final = await continueAnalysis({ ...clarifying, clarification: '打击乐' }, () => {}, service)
  assert.equal(final.result.planVersion, 2)
})
