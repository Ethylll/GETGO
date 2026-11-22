import { validatedLearningFeedback } from './chatMessages.js'
import { activeLearningPlan, getOneTimeProgress, simulatedMinute } from './learningDays.js'
import { sourceText } from './learningSources.js'

const EVENT_LIMIT = 32
const TASK_LIMIT = 12
const DAY_LIMIT = 5
const MESSAGE_LIMIT = 10
const SOURCE_LIMIT = 8
const ADJUSTMENT_LIMIT = 5

const normalized = (text) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '')
const field = (value, limit) => typeof value === 'string' ? value.slice(0, limit) : ''
export const occursAfter = (revision, time, priorRevision, priorTime) =>
  Number.isSafeInteger(revision) && Number.isSafeInteger(priorRevision) ? revision > priorRevision : time !== null && time > priorTime

export function storedObservations(events, dayIds, messages) {
  if (!Array.isArray(events)) return []
  const turns = new Map(messages.map((turn) => [turn.id, turn]))
  const result = new Map()
  for (const event of events.slice(-EVENT_LIMIT)) {
    if (!dayIds.has(event?.dayId)) continue
    const message = turns.get(event.messageId)
    if (event.type === 'nextDay' && event.id === `nextDay:${event.dayId}` && event.dayId !== 'day-1') {
      result.set(event.id, { id: event.id, type: event.type, dayId: event.dayId })
    } else if (event.type === 'taskFeedback' && event.id === `taskFeedback:${event.messageId}` &&
      message?.instanceId && message.dayId === event.dayId && message.feedback) {
      result.set(event.id, { id: event.id, type: event.type, dayId: event.dayId, messageId: message.id })
    } else if (event.type === 'clarificationReply' && message?.status === 'clarification' &&
      event.id === `clarificationReply:${message.clarificationId}`) {
      result.set(event.id, { id: event.id, type: event.type, dayId: event.dayId, messageId: message.id })
    }
  }
  return [...result.values()]
}

export function learningObservationEvent(before, next, trigger) {
  const day = next.days.at(-1)
  if (trigger.type === 'advance' && next !== before && day.id !== before.days.at(-1).id) {
    return { id: `nextDay:${day.id}`, type: 'nextDay', dayId: day.id }
  }
  const turn = next.messages.find(({ id }) => id === trigger.messageId)
  if (trigger.type === 'clarificationReply' && turn?.status === 'clarification' &&
    !before.messages.some(({ clarificationId }) => clarificationId === turn.clarificationId)) {
    return { id: `clarificationReply:${turn.clarificationId}`, type: trigger.type, dayId: day.id, messageId: turn.id }
  }
  if (trigger.type !== 'chatReply') return null
  const previous = before.messages.find(({ id }) => id === trigger.messageId)
  if (!turn?.instanceId || turn.dayId !== day.id || !validatedLearningFeedback(turn.question, turn.feedback) ||
    !['pending', 'interrupted'].includes(previous?.status) ||
    before.messages.some(({ id, taskId, question, feedback }) => id !== turn.id && taskId === turn.taskId &&
      feedback &&
      (normalized(feedback.excerpt) === normalized(turn.feedback.excerpt) || normalized(question) === normalized(turn.question)))) return null
  return { id: `taskFeedback:${turn.id}`, type: 'taskFeedback', dayId: turn.dayId, messageId: turn.id }
}

export function saveWithLearningObservation(before, next, trigger, save) {
  const event = learningObservationEvent(before, next, trigger)
  const previous = next.observations ?? []
  const recorded = event && !previous.some(({ id }) => id === event.id)
    ? { ...next, observations: [...previous, event].slice(-EVENT_LIMIT) }
    : next
  const saved = save(recorded)
  return { session: saved ? recorded : next, saved, event: saved && recorded !== next ? event : null }
}

function describeTask(task) {
  return { id: task.id, title: field(task.title, 120), type: task.type, objective: field(task.objective, 180),
    estimatedMinutes: task.estimatedMinutes, prerequisiteTaskIds: task.prerequisiteTaskIds.slice(0, TASK_LIMIT),
    ...(task.practice ? { frequency: { unit: task.practice.frequency.unit, interval: task.practice.frequency.interval } } : {}) }
}

function describeInstance(item, day) {
  const outcome = item.status === 'completed' ? 'completed'
    : item.held && item.startedAt === null ? 'held' : day.endedAt === null ? 'open' : 'unfinished'
  return { evidenceId: `instance:${item.id}`, id: item.id, taskId: item.task.id, title: field(item.task.title, 120),
    type: item.task.type, optional: item.optional, status: item.status, startedAt: item.startedAt,
    completedAt: item.completedAt, outcome, dayNumber: day.dayNumber, ...(item.held ? { held: true } : {}),
    selfChecks: item.feedback.slice(0, 4).map((value) => field(value, 120)) }
}

export function practiceAfterChange(days, change, taskIds = change.taskIds) {
  const firstDay = days.findIndex(({ id }) => change.dayId === id)
  if (firstDay < 0) return []
  return days.slice(firstDay).flatMap((day, index) => day.instances.filter((instance) => {
    if (!taskIds.includes(instance.task.id) || instance.held || instance.startedAt === null) return false
    if (index > 0) return true
    const effect = change.dayEffects?.find(({ instanceId }) => instanceId === instance.id)?.effect
    if (change.dayEffects && !['updated', 'scheduled', 'paused'].includes(effect)) return false
    if (instance.taskVersion !== undefined && change.appliedRevision !== undefined &&
      ['updated', 'scheduled'].includes(effect) && instance.taskVersion !== change.appliedRevision) return false
    return occursAfter(instance.startedRevision, instance.startedAt, change.appliedRevision, change.appliedAt) ||
      Boolean(change.dayEffects) && occursAfter(instance.completedRevision, instance.completedAt, change.appliedRevision, change.appliedAt)
  }).map((instance) => ({ instance, day })))
}

function describeAdjustments(adjustments, days, knownTasks, turns) {
  return adjustments.filter((item) => item?.status === 'applied' && typeof item.id === 'string' &&
    Number.isFinite(item.appliedAt) && days.some(({ id }) => item.dayId === id) &&
    Array.isArray(item.taskIds) && item.taskIds.some((id) => knownTasks.has(id))).slice(-ADJUSTMENT_LIMIT).map((item) => {
    const taskIds = item.taskIds.filter((id) => knownTasks.has(id)).slice(0, TASK_LIMIT)
    const firstDay = days.findIndex(({ id }) => id === item.dayId)
    const practice = practiceAfterChange(days, item, taskIds)
    const followUp = turns.filter((turn) => taskIds.includes(turn.taskId) && (turn.feedback || turn.clarificationId) &&
      occursAfter(turn.createdRevision, turn.createdAt, item.appliedRevision, item.appliedAt))
    return { receiptId: `receipt:${item.id}`, action: field(item.action, 40), appliedAt: item.appliedAt, taskIds,
      dayNumber: days[firstDay].dayNumber,
      ...(item.dayEffects ? { dayEffects: item.dayEffects } : {}),
      subsequentPractice: practice.slice(-3).map(({ instance, day }) => describeInstance(instance, day)),
      waitingForPractice: practice.length === 0,
      subsequentFeedback: followUp.slice(-3).map(({ id, dayId, taskId, feedback, clarificationId, question }) => ({
        evidenceId: `message:${id}`, dayId, taskId, feedback, ...(clarificationId ? { clarificationId, reply: field(question, 320) } : {}),
      })) }
  })
}

export function buildLearningObservation(session, event, { adjustments = [] } = {}) {
  const current = session.days.at(-1)
  event = (session.observations ?? []).find(({ id }) => id === event?.id)
  if (!event || event.dayId !== current.id) return null
  const plan = activeLearningPlan(session)
  const trigger = session.messages.find(({ id }) => id === event.messageId)
  const seed = new Set([trigger?.taskId, ...current.instances.map(({ task }) => task.id)].filter(Boolean))
  const daysById = new Map(session.days.map((day) => [day.id, day]))
  const instances = session.days.flatMap((day) => day.instances.map((instance) => ({ ...instance, day })))
  const knownTasks = new Map(instances.map(({ task }) => [task.id, task]))
  for (const task of plan.tasks) knownTasks.set(task.id, task)
  const relatedIds = new Set(seed)
  for (const task of knownTasks.values()) {
    if (seed.has(task.id)) task.prerequisiteTaskIds.forEach((id) => relatedIds.add(id))
    if (task.prerequisiteTaskIds.some((id) => seed.has(id))) relatedIds.add(task.id)
  }
  const focusedSources = new Set([...seed].flatMap((id) => knownTasks.get(id)?.sourceRefs.map(({ sourceId }) => sourceId) ?? []))
  const turns = session.messages.filter((turn) => turn.projectId === session.projectId)
  const relatedTurns = turns.filter((turn) => relatedIds.has(turn.taskId) ||
    turn.citations?.some(({ sourceId }) => focusedSources.has(sourceId))).slice(-4)
  const projectFeedback = turns.filter((turn) => turn.taskId === null && turn.feedback).slice(-3)
  const selectedTurns = [...new Set([trigger, ...projectFeedback, ...relatedTurns, ...turns.slice(-MESSAGE_LIMIT)].filter(Boolean))]
    .slice(0, MESSAGE_LIMIT).sort((a, b) => turns.indexOf(a) - turns.indexOf(b))
  const originals = new Map(plan.sources.filter(({ status }) => status === 'processed').map((source) => [source.sourceId, source]))
  const selectedTasks = [...new Set([...relatedIds, ...plan.tasks.map(({ id }) => id)])].slice(0, TASK_LIMIT)
  const references = [...selectedTurns.flatMap(({ citations }) => citations ?? []),
    ...selectedTasks.flatMap((id) => {
      const task = knownTasks.get(id)
      return [...(task?.sourceRefs ?? []), ...(task?.steps ?? []).flatMap(({ sourceRefs }) => sourceRefs ?? [])]
    })]
  const sources = new Map()
  for (const { sourceId, excerpt } of references) {
    const source = originals.get(sourceId)
    if (sources.size >= SOURCE_LIMIT) break
    if (!source || !excerpt || !sourceText(source).includes(excerpt)) continue
    const clipped = field(excerpt, 220)
    const key = `${sourceId}:${sourceText(source).indexOf(excerpt)}`
    if (!sources.has(key)) sources.set(key, { evidenceId: `source:${key}`, sourceId, title: field(source.title, 120), excerpt: clipped })
  }
  const recentDays = session.days.slice(-DAY_LIMIT).map((day) => ({
    id: day.id, dayNumber: day.dayNumber, simulatedMinute: simulatedMinute(day.dayNumber), closed: day.endedAt !== null,
    instanceCount: day.instances.filter(({ held }) => !held).length,
    instances: day.instances.slice(0, 8).map((item) => describeInstance(item, day)),
  }))
  const oneTime = getOneTimeProgress(session.days)
  const summaries = selectedTasks.map((id) => {
    const records = instances.filter(({ task }) => task.id === id)
    const previous = records.filter(({ id: instanceId, optional, startedAt, held }) =>
      !held && !instanceId.startsWith(`${current.id}:`) && (!optional || startedAt !== null))
    const missed = previous.findLastIndex(({ status }) => status === 'completed')
    return { taskId: id, completedInstances: records.filter(({ status }) => status === 'completed').length,
      consecutiveUnfinishedOffers: previous.slice(missed + 1).length,
      latestPractice: records.filter(({ task, startedAt }) => task.type === 'recurring' && startedAt !== null).slice(-2)
        .map((item) => describeInstance(item, item.day)) }
  })
  return {
    projectId: session.projectId, dayId: current.id, revision: session.revision, event,
    simulatedMinute: simulatedMinute(current.dayNumber),
    plan: { topic: field(plan.topic, 160), initialTasks: session.plan.tasks.filter(({ id }) => selectedTasks.includes(id)).map(describeTask),
      effectiveTasks: plan.tasks.filter(({ id }) => selectedTasks.includes(id)).map(describeTask),
      oneTime: { completed: plan.tasks.filter(({ id, type }) => type === 'oneTime' && oneTime.has(id)).length,
        planned: plan.tasks.filter(({ type }) => type === 'oneTime').length } },
    recentDays, summaries, sources: [...sources.values()],
    messages: selectedTurns.map(({ id, dayId, instanceId, taskId, question, answer, status, feedback, clarificationId, submittedOnDayId }) => ({
      evidenceId: `message:${id}`, dayId, dayNumber: daysById.get(dayId)?.dayNumber, instanceId, taskId, question: field(question, 320),
      helpProvided: field(answer, 320), status, feedback, ...(clarificationId ? { clarificationId, submittedOnDayId } : {}),
    })),
    adjustments: describeAdjustments(adjustments, session.days, knownTasks, turns),
  }
}

// Local wall-clock stamps are available for legacy record ordering and diagnostics.
// Only simulated day coordinates and observed behavior are sent for teaching.
export function observationForModel(frame) {
  const instance = ({ startedAt, completedAt, ...entry }) => entry
  return { ...frame,
    recentDays: frame.recentDays.map((day) => ({ ...day, instances: day.instances.map(instance) })),
    summaries: frame.summaries.map((summary) => ({ ...summary, latestPractice: summary.latestPractice.map(instance) })),
    adjustments: frame.adjustments.map(({ appliedAt, subsequentPractice, ...entry }) =>
      ({ ...entry, subsequentPractice: subsequentPractice.map(instance) })),
  }
}
