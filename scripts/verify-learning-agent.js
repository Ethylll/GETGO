import assert from 'node:assert/strict'
import { createLearningAgentHandler } from '../api/learning-agent.js'
import { activeLearningPlan, createDailySession, updateLearningDay } from '../src/learningDays.js'
import { runLearningAgent } from '../src/learningAgent.js'
import { saveWithLearningObservation } from '../src/learningObservation.js'
import { loadLearningSession, saveDailyLearningSession } from '../src/learningSessionStorage.js'
import { makePlan } from '../tests/fixtures/dailyLearningPlan.js'

const url = process.argv[2]
const handler = createLearningAgentHandler()

async function demo(name, feedback) {
  const time = Date.now()
  let state = createDailySession(makePlan(), `demo-${name}`, time)
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const save = (session) => saveDailyLearningSession(session, storage)
  const commit = (update) => {
    const next = update(state)
    if (next !== state) {
      assert.ok(save(next))
      state = loadLearningSession(storage).session
    }
    return state
  }
  const before = state
  let trigger
  let changed
  if (feedback) {
    const message = { id: 'demo-feedback', projectId: state.projectId, dayId: 'day-1', instanceId: 'day-1:practice',
      taskId: 'practice', status: 'pending', createdAt: time + 1, question: feedback.excerpt, answer: '', citations: [] }
    state = { ...state, messages: [message] }
    changed = { ...state, revision: 1, messages: [{ ...message, status: 'insufficient', feedback }] }
    trigger = { type: 'chatReply', messageId: message.id }
  } else {
    for (const action of ['start', 'complete']) {
      state = updateLearningDay(state, { type: action, dayId: 'day-1', instanceId: 'day-1:first', now: time + 1 })
    }
    changed = updateLearningDay(state, { type: 'advance', dayId: 'day-1', now: time + 2 })
    trigger = { type: 'advance' }
  }
  const saved = saveWithLearningObservation(feedback ? state : before, changed, trigger, save)
  assert.ok(saved.event)
  state = loadLearningSession(storage).session
  let observedAdjustment = false
  const outcome = await runLearningAgent(saved.event, {
    commit,
    request: async (input, signal) => {
      if (input.receipts?.some(({ status }) => status === 'applied')) {
        observedAdjustment = input.frame.adjustments.some(({ waitingForPractice, subsequentPractice }) =>
          waitingForPractice && !subsequentPractice.length)
      }
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal }
      const response = url ? await fetch(url, options) : await handler(new Request('http://localhost/api/learning-agent', options))
      if (!response.ok) {
        console.log(name, 'HTTP', response.status)
        throw new Error(response.status === 504 ? 'timeout' : 'upstream')
      }
      const result = await response.json()
      if (input.operation === 'review') console.log(name, 'review:', result.supported)
      return result
    },
  })
  const round = state.agent.rounds.at(-1)
  console.log(name, outcome, round.steps.map(({ action, receipt }) => [action?.type, receipt.status, receipt.code ?? '']))
  return { state, outcome, round, observedAdjustment }
}

const stable = await demo('stable')
assert.ok(['kept', 'finished', 'waiting'].includes(stable.outcome))
assert.equal(stable.state.effectivePlan, null)
assert.equal(stable.state.agent.notes.length, 0)

const confused = await demo('help', { kind: 'difficulty', excerpt: '我实际敲了两次，还是不知道敲的当下要听什么。能先根据原资料提醒我应该听什么吗？' })
assert.equal(confused.state.agent.notes.length, 1)
assert.ok(['GUIDE', 'CLARIFY'].includes(confused.state.agent.notes[0].type))
assert.ok(confused.round.steps.length >= 2)
assert.equal(confused.state.effectivePlan, null)

const busy = await demo('time', { kind: 'time', excerpt: '我每天只有三分钟练习。现在这项交替敲击要六分钟，今天还没开始。请把每次时长改为三分钟，原步骤和完成标准保留。' })
const practiced = activeLearningPlan(busy.state).tasks.find(({ id }) => id === 'practice')
assert.equal(practiced.estimatedMinutes, 3)
assert.ok(busy.round.steps.some(({ receipt }) => receipt.status === 'applied'))
assert.ok(busy.round.steps.length >= 2)
assert.ok(busy.observedAdjustment)
assert.equal(busy.state.days.at(-1).instances.find(({ task }) => task.id === 'practice').task.estimatedMinutes, 3)
assert.equal(busy.state.plan.tasks.find(({ id }) => id === 'practice').estimatedMinutes, 6)
