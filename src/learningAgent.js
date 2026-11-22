import { AGENT_ACTIONS, EMPTY_AGENT_STATE, normalizeAgentDecision, prepareAgentAction } from './agentActions.js'
import { shortText, validStoredPlanDelta } from './agentPlanChanges.js'
import { activeLearningPlan } from './learningDays.js'
import { buildLearningObservation, observationForModel } from './learningObservation.js'
import { hasValidSourceRefs, indexSourceEvidence } from './services/validateLearningPlan.js'

export const AGENT_BUDGET = Object.freeze({ tools: 3, decisions: 4, modelCalls: 5, totalMs: 34_000 })
const terminalStatuses = ['kept', 'finished', 'waiting', 'budget', 'stale', 'timeout', 'failed']

function setRound(session, round, changes = {}) {
  return { ...session, revision: session.revision + 1, agent: { ...session.agent, ...changes,
    rounds: session.agent.rounds.map((item) => item.id === round.id ? round : item) } }
}

export function restoredAgentState(value, session, now = Date.now()) {
  const input = value ?? EMPTY_AGENT_STATE
  const days = new Set(session.days.map(({ id }) => id))
  const tasks = new Set(activeLearningPlan(session).tasks.map(({ id }) => id))
  const rounds = Array.isArray(input.rounds) ? [...new Map(input.rounds.filter((round) => days.has(round?.dayId) &&
    typeof round.eventId === 'string' && round.id === `round:${round.eventId}` && Number.isFinite(round.startedAt) &&
    Number.isFinite(round.deadline) && ['running', ...terminalStatuses].includes(round.status) &&
    Array.isArray(round.steps) && round.steps.length <= AGENT_BUDGET.decisions).map((round) => [
    round.id, round.status === 'running' && round.deadline <= now ? { ...round, status: 'timeout', endedAt: round.deadline } : round,
  ])).values()] : []
  const evidence = indexSourceEvidence(session.plan.sources)
  const notes = Array.isArray(input.notes) ? input.notes.filter((note) => days.has(note?.dayId) &&
    ['GUIDE', 'CLARIFY'].includes(note.type) && shortText(note.id, 220) && shortText(note.text, 300) &&
    (note.taskId === null || shortText(note.taskId, 180)) &&
    Number.isFinite(note.createdAt) && (note.ignoredAt === undefined || Number.isFinite(note.ignoredAt)) &&
    (note.instanceId == null || typeof note.taskId === 'string' && note.instanceId === `${note.dayId}:${note.taskId}`) &&
    (note.type !== 'GUIDE' || hasValidSourceRefs(note.sourceRefs, evidence))) : []
  const changes = Array.isArray(input.changes) ? input.changes.filter((change) => days.has(change?.dayId) &&
    shortText(change.id, 240) && shortText(change.reason, 220) && ['pending', 'applied', 'rejected', 'undone'].includes(change.status) &&
    Number.isFinite(change.proposedAt) && (change.status !== 'applied' || Number.isFinite(change.appliedAt)) &&
    Array.isArray(change.taskIds) && change.taskIds.every((id) => shortText(id, 180)) &&
    (change.appliedRevision === undefined || Number.isSafeInteger(change.appliedRevision) && change.appliedRevision > 0) &&
    (change.dayEffects === undefined || Array.isArray(change.dayEffects) && change.dayEffects.length <= 5 &&
      change.dayEffects.every((effect) => change.taskIds.includes(effect?.taskId) &&
        ['updated', 'scheduled', 'paused', 'removed', 'future'].includes(effect.effect) &&
        (effect.instanceId === undefined || effect.instanceId === `${change.dayId}:${effect.taskId}`) &&
        (effect.estimatedMinutes === undefined || Number.isSafeInteger(effect.estimatedMinutes) && effect.estimatedMinutes > 0))) &&
    [...AGENT_ACTIONS, 'RESTORE'].includes(change.action?.type) && validStoredPlanDelta(change.delta, evidence)) : []
  const schedule = Array.isArray(input.schedule) ? [...new Map(input.schedule.filter((item) => tasks.has(item?.taskId) &&
    [item.notBefore, item.priorityDay].every((number) => number === undefined || Number.isSafeInteger(number) && number > 0))
    .map((item) => [item.taskId, item])).values()] : []
  return { rounds, notes, changes, schedule }
}

export function claimAgentRound(session, event, now, deadline) {
  const dayId = session.days.at(-1).id
  const agent = session.agent ?? EMPTY_AGENT_STATE
  if (dayId !== event.dayId || !session.observations?.some(({ id, dayId: day }) => id === event.id && day === dayId) ||
    agent.rounds.some(({ eventId }) => eventId === event.id)) return session
  const rounds = agent.rounds.map((round) => round.status === 'running'
    ? { ...round, status: round.deadline <= now ? 'timeout' : 'stale', endedAt: now } : round)
  rounds.push({ id: `round:${event.id}`, eventId: event.id, dayId, status: 'running', startedAt: now, deadline, steps: [] })
  return { ...session, revision: session.revision + 1, agent: { ...agent, rounds } }
}

export function finishAgentRound(session, roundId, status, now) {
  const round = session.agent?.rounds.find(({ id }) => id === roundId)
  return round?.status === 'running' && terminalStatuses.includes(status)
    ? setRound(session, { ...round, status, endedAt: now })
    : session
}

function frameForRound(session, event) {
  const agent = session.agent
  const observation = buildLearningObservation(session, event, { adjustments: agent.changes.filter((change) => !change.revertedBy)
    .map((change) => ({ ...change, action: change.action.type })) })
  if (!observation) return null
  const reply = session.messages.find(({ id, clarificationId }) => id === event.messageId && clarificationId)
  const prompt = reply && agent.notes.find(({ id }) => id === reply.clarificationId)
  const notes = [...new Set([prompt, ...agent.notes.slice(-6)].filter(Boolean))].slice(0, 6)
  return { ...observation, ...(prompt ? { clarification: { promptId: `note:${prompt.id}`, replyId: `message:${reply.id}` } } : {}),
    priorNotes: notes.map(({ id, type, taskId, text, dayId }) => ({
    evidenceId: `note:${id}`, type, taskId, text, dayId,
  })), recentProposals: agent.changes.slice(-6).map(({ id, taskIds, status, action, reason }) => ({
    id, taskIds, status, action: action.type, reason,
  })) }
}

function stepResult(session, round, decision, prepared, actionId, now) {
  const previous = round.steps.filter(({ receipt }) => receipt?.status === 'rejected').at(-1)
  const rejectedAgain = prepared.code && previous?.receipt.code === prepared.code &&
    round.steps.at(-1)?.receipt === previous.receipt
  const receipt = { id: actionId, status: prepared.code ? 'rejected' : prepared.status ?? prepared.stop,
    ...(prepared.code ? { code: prepared.code } : {}),
    ...(prepared.sources ? { sources: prepared.sources } : {}),
    ...(prepared.note ? { taskId: prepared.note.taskId, noteId: actionId } : {}),
    ...(prepared.change ? { taskIds: prepared.change.taskIds, changeId: actionId,
      ...(prepared.change.dayEffects ? { dayEffects: prepared.change.dayEffects } : {}) } : {}),
    ...(prepared.waiting ? { awaitsUser: true } : {}) }
  const recorded = { type: decision.type, reason: decision.reason, issue: decision.issue,
    evidenceIds: prepared.code === 'unknown_evidence' ? [] : decision.evidenceIds,
    ...(decision.action ? { action: prepared.code ? { type: decision.action.type, taskId: decision.action.taskId } : decision.action } : {}),
    intervention: Boolean(prepared.note || prepared.change),
    needsConfirmation: prepared.change?.needsConfirmation ?? false, receipt, at: now }
  const steps = [...round.steps, recorded]
  const status = rejectedAgain ? 'failed' : prepared.status === 'kept' ? 'kept'
    : prepared.stop === 'wait' ? 'waiting' : prepared.stop === 'finish' ? 'finished' : 'running'
  const next = prepared.status === 'applied' ? prepared.next : session
  return setRound(next, { ...round, steps, status, ...(status === 'running' ? {} : { endedAt: now }) }, {
    ...(prepared.note ? { notes: [...next.agent.notes, prepared.note] } : {}),
    ...(prepared.change ? { changes: [...next.agent.changes, prepared.change] } : {}),
  })
}

export async function requestAgentStep(input, signal) {
  const response = await fetch('/api/learning-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input), signal })
  if (!response.ok) throw new Error(response.status === 504 ? 'timeout' : 'upstream')
  return response.json()
}

function withDeadline(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('timeout'))
      return
    }
    const abort = () => reject(new Error('timeout'))
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export async function runLearningAgent(event, { commit, request = requestAgentStep, now = Date.now, budget = AGENT_BUDGET }) {
  const launchedAt = now()
  const deadline = launchedAt + budget.totalMs
  const roundId = `round:${event.id}`
  let claimed = false
  let latest = await commit((session) => {
    const next = claimAgentRound(session, event, launchedAt, deadline)
    claimed = next !== session
    return next
  })
  if (!claimed || !latest) return 'ignored'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - now()))
  let modelCalls = 0
  let tools = 0
  const tell = async (input) => {
    if (controller.signal.aborted || now() >= deadline) throw new Error('timeout')
    modelCalls++
    return withDeadline(request(input, controller.signal), controller.signal)
  }
  const finish = async (status) => {
    await commit((session) => finishAgentRound(session, roundId, status, now()))
    return status
  }
  try {
    for (let index = 0; index < budget.decisions && modelCalls < budget.modelCalls; index++) {
      const round = latest.agent.rounds.find(({ id }) => id === roundId)
      const frame = frameForRound(latest, event)
      if (!frame || round.status !== 'running') return await finish('stale')
      const receipts = round.steps.map(({ receipt }) => receipt)
      const waiting = receipts.some(({ awaitsUser }) => awaitsUser)
      const answer = await tell({ operation: 'decide', frame: observationForModel(frame), receipts, remainingTools: waiting ? 0 : budget.tools - tools })
      const decision = normalizeAgentDecision(answer.decision)
      if (!decision) return await finish('failed')
      if (waiting && decision.type === 'act') return await finish('waiting')
      const takingAction = decision.type === 'act' && decision.action.type !== 'KEEP_PLAN'
      if (takingAction && ++tools > budget.tools) return await finish('budget')
      const actionId = `learn-${roundId}-${index + 1}`
      let prepared = prepareAgentAction(latest, frame, receipts, decision, actionId, now())
      if (prepared.review) {
        if (modelCalls === budget.modelCalls) return await finish('budget')
        const relevant = prepared.review.sourceRefs ?? [...prepared.review.target.sourceRefs, ...prepared.review.updates.flatMap((update) =>
          [...update.steps.flatMap(({ sourceRefs }) => sourceRefs), ...(update.difficulty?.sourceRefs ?? []),
            ...(update.frequency?.sourceRefs ?? []), ...(update.reviewAfter?.sourceRefs ?? [])])]
        const sources = [...new Map([...relevant, ...frame.sources, ...receipts.flatMap(({ sources: matches }) => matches ?? [])]
          .map(({ sourceId, excerpt }) => [JSON.stringify([sourceId, excerpt]), { sourceId, excerpt }])).values()].slice(0, 20)
        const reviewed = await tell({ operation: 'review', action: decision.action.type,
          topic: frame.plan.topic, material: prepared.review, sources })
        if (reviewed.supported !== true) prepared = { code: 'unsupported_material' }
      }
      const expected = latest
      const authorized = !prepared.code
      let applied = false
      latest = await commit((session) => {
        if (session.revision !== expected.revision || session.projectId !== frame.projectId ||
          session.days.at(-1).id !== frame.dayId || controller.signal.aborted || now() >= deadline) return session
        const confirmed = authorized ? prepareAgentAction(session, frame, receipts, decision, actionId, now()) : prepared
        if (waiting && confirmed.stop === 'finish') confirmed.stop = 'wait'
        applied = true
        return stepResult(session, round, decision, confirmed, actionId, now())
      })
      if (!latest) return 'unsaved'
      if (!applied) return await finish(controller.signal.aborted || now() >= deadline ? 'timeout' : 'stale')
      const status = latest.agent.rounds.find(({ id }) => id === roundId).status
      if (status !== 'running') return status
    }
    const steps = latest.agent.rounds.find(({ id }) => id === roundId).steps
    return await finish(steps.some(({ receipt }) => receipt.awaitsUser) ? 'waiting' : 'budget')
  } catch (error) {
    return await finish(controller.signal.aborted || error.message === 'timeout' ? 'timeout' : 'failed')
  } finally {
    clearTimeout(timer)
  }
}
