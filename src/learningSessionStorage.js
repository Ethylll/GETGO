import { hasValidSourceRefs, indexSourceEvidence, isValidLearningPlan, isValidPracticeTiming, isValidV2Task } from './services/validateLearningPlan.js'
import { ANSWER_LIMIT, CITATION_LIMIT, isEvidenceAnswer, QUESTION_LIMIT, validatedLearningFeedback } from './chatMessages.js'
import { sourceText } from './learningSources.js'
import { activeLearningPlan, simulatedMinute, snapshotDailyTask } from './learningDays.js'
import { storedObservations } from './learningObservation.js'
import { restoredAgentState } from './learningAgent.js'
import { clarificationContext } from './teachingInteractions.js'

export const LEARNING_SESSION_KEY = 'getgo.learningSession'
const SESSION_VERSION = 1

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isValidStoredPlan(plan, historicalTiming = false) {
  if (plan?.status !== 'ready' || !['mock', 'real'].includes(plan.mode) ||
    !isStringList(plan.coverageGaps) || !isStringList(plan.notices) || !isValidLearningPlan(plan, plan.sources, historicalTiming)) {
    return false
  }

  return plan.sources.every((source) => (
    typeof source.title === 'string' && ['text', 'image'].includes(source.type) &&
    ['processed', 'failed'].includes(source.status) &&
    [source.text, source.extractedText, source.error].every((value) => value === undefined || typeof value === 'string')
  ))
}

function isValidSession({ plan, currentTaskId, completedTaskIds }) {
  if (plan?.planVersion === 2 || !isValidStoredPlan(plan)) return false

  const taskIds = new Set(plan.tasks.map(({ id }) => id))
  if (!Array.isArray(completedTaskIds) || new Set(completedTaskIds).size !== completedTaskIds.length ||
    !completedTaskIds.every((id) => taskIds.has(id))) return false

  if (completedTaskIds.length === taskIds.size) return currentTaskId === null
  return taskIds.has(currentTaskId) && !completedTaskIds.includes(currentTaskId)
}

const copyRefs = (refs) => refs?.map(({ sourceId, excerpt }) => ({ sourceId, excerpt }))

function storedMessages(messages, plan, session) {
  if (!Array.isArray(messages)) return []
  const taskIds = new Set(plan.tasks.map(({ id }) => id))
  const evidence = new Map(plan.sources.filter((source) => source.status === 'processed').map((source) => [source.sourceId, sourceText(source)]))
  const ids = new Set()
  const clarificationIds = new Set()
  const result = []
  const days = session && new Map(session.days.map((day) => [day.id, day]))
  const notes = new Map((session?.agent?.notes ?? []).map((note) => [note.id, note]))

  for (const turn of messages) {
    if (!turn || typeof turn.id !== 'string' || !turn.id || ids.has(turn.id) ||
      typeof turn.question !== 'string' || !turn.question.trim() || turn.question.length > QUESTION_LIMIT ||
      !Number.isFinite(turn.createdAt)) continue
    if (session && turn.status === 'clarification') {
      const note = notes.get(turn.clarificationId)
      const context = clarificationContext(session, note)
      if (!context || clarificationIds.has(note.id) || turn.createdAt < note.createdAt ||
        Object.keys(context).some((key) => context[key] !== turn[key])) continue
      ids.add(turn.id)
      clarificationIds.add(note.id)
      result.push({ id: turn.id, ...context, clarificationId: note.id, question: turn.question,
        createdAt: turn.createdAt, status: 'clarification', answer: '', citations: [],
        ...(days.has(turn.submittedOnDayId) ? { submittedOnDayId: turn.submittedOnDayId } : {}),
        ...(Number.isSafeInteger(turn.createdRevision) ? { createdRevision: turn.createdRevision } : {}) })
      continue
    }
    const day = days?.get(turn.dayId)
    if (session) {
      if (turn.projectId !== session.projectId || !day) continue
      const projectQuestion = turn.taskId === null && (turn.instanceId ?? null) === null
      if (!projectQuestion && !day.instances.some(({ id, task }) => id === turn.instanceId && task.id === turn.taskId)) continue
    } else if (!taskIds.has(turn.taskId)) continue

    const status = turn.status === 'pending' ? 'interrupted' : turn.status
    let answer = ''
    let citations = []
    if (isEvidenceAnswer(status)) {
      if (typeof turn.answer !== 'string' || !turn.answer.trim() || turn.answer.length > ANSWER_LIMIT ||
        !Array.isArray(turn.citations) || !turn.citations.length || turn.citations.length > CITATION_LIMIT ||
        !turn.citations.every((ref) => typeof ref?.excerpt === 'string' && ref.excerpt.trim().length >= 2 && evidence.get(ref.sourceId)?.includes(ref.excerpt))) continue
      citations = copyRefs(turn.citations)
      answer = turn.answer
    } else if (!['insufficient', 'interrupted', 'error'].includes(status)) continue

    ids.add(turn.id)
    const { id, taskId, question, createdAt } = turn
    const feedback = session && validatedLearningFeedback(question, turn.feedback)
    result.push({ id, taskId, question, createdAt, status, answer, citations,
      ...(session ? { projectId: turn.projectId, dayId: turn.dayId, instanceId: turn.instanceId ?? null,
        ...(Number.isSafeInteger(turn.createdRevision) ? { createdRevision: turn.createdRevision } : {}) } : {}),
      ...(feedback ? { feedback } : {}) })
  }
  return result
}

function toStoredPlan(plan) {
  const { status, mode, topic, supportedScope, coverageGaps, entryTaskId, notices } = plan

  return {
    status, mode, topic, supportedScope, coverageGaps, entryTaskId, notices,
    ...(plan.planVersion === 2 ? { planVersion: 2 } : {}),
    sources: plan.sources.map(({ sourceId, title, type, status, text, extractedText, error }) => (
      { sourceId, title, type, status, text, extractedText, error }
    )),
    knowledgePoints: plan.knowledgePoints.map(({ id, title, prerequisiteIds, sourceRefs }) => (
      { id, title, prerequisiteIds, sourceRefs: copyRefs(sourceRefs) }
    )),
    tasks: plan.planVersion === 2 ? plan.tasks.map(snapshotDailyTask) : plan.tasks.map(({ id, title, objective, prerequisiteTaskIds, knowledgePointIds, steps, sourceRefs }) => ({
      id, title, objective, prerequisiteTaskIds, knowledgePointIds,
      steps: steps.map(({ text, sourceRefs }) => ({ text, sourceRefs: copyRefs(sourceRefs) })),
      sourceRefs: copyRefs(sourceRefs),
    })),
  }
}

function validLimits(limits) {
  return Number.isSafeInteger(limits?.minutes) && limits.minutes > 0 && Number.isSafeInteger(limits.tasks) && limits.tasks > 0
}

function validInstance(item, day, evidence, historicalTiming) {
  const task = item?.task
  if (typeof task?.id !== 'string' || !task.id || item.id !== `${day.id}:${task.id}` ||
    typeof task.title !== 'string' || !task.title.trim() || typeof task.objective !== 'string' || !task.objective.trim() ||
    !isStringList(task.prerequisiteTaskIds) || !isStringList(task.knowledgePointIds) || !task.knowledgePointIds.length ||
    !Array.isArray(task.steps) || task.steps.length < 2 || task.steps.length > 5 || !hasValidSourceRefs(task.sourceRefs, evidence) ||
    !task.steps.every((step) => typeof step?.text === 'string' && step.text.trim() && hasValidSourceRefs(step.sourceRefs, evidence)) ||
    !isValidV2Task(task, task.prerequisiteTaskIds.filter((id) => task.prerequisiteGates?.some((gate) => gate?.taskId === id)), evidence, historicalTiming) ||
    typeof item.optional !== 'boolean' || !isStringList(item.feedback) ||
    (item.held !== undefined && (item.held !== true || item.status === 'completed')) ||
    [item.taskVersion, item.startedRevision, item.completedRevision].some((revision) =>
      revision !== undefined && (!Number.isSafeInteger(revision) || revision < 1))) return false
  const withinDay = (time) => Number.isFinite(time) && time >= day.startedAt && (day.endedAt === null || time <= day.endedAt)
  if (item.status === 'notStarted') return item.startedAt === null && item.completedAt === null && !item.feedback.length
  if (!withinDay(item.startedAt)) return false
  if (item.status === 'inProgress') return item.completedAt === null && !item.feedback.length
  return item.status === 'completed' && withinDay(item.completedAt) && item.completedAt >= item.startedAt
}

function validDailySession(session, historicalTiming = false) {
  const { plan, effectivePlan, projectId, revision, limits, days } = session
  if (plan?.planVersion !== 2 || !isValidStoredPlan(plan, historicalTiming) || typeof projectId !== 'string' || !projectId ||
    !Number.isSafeInteger(revision) || revision < 0 || !validLimits(limits) || !Array.isArray(days) || !days.length) return false
  if (effectivePlan !== null && (effectivePlan?.planVersion !== 2 ||
    !isValidStoredPlan({ ...effectivePlan, sources: plan.sources }, historicalTiming))) return false
  const evidence = indexSourceEvidence(plan.sources)
  return days.every((day, index) => {
    if (day?.id !== `day-${index + 1}` || day.dayNumber !== index + 1 || !Number.isFinite(day.startedAt) || day.startedAt < 0 ||
      (day.simulatedMinute !== undefined && day.simulatedMinute !== simulatedMinute(day.dayNumber)) ||
      (index > 0 && day.startedAt !== days[index - 1].endedAt) ||
      (index === days.length - 1 ? day.endedAt !== null : !Number.isFinite(day.endedAt) || day.endedAt < day.startedAt) ||
      !validLimits(day.limits) || !Array.isArray(day.instances) ||
      !day.instances.every((item) => validInstance(item, day, evidence, historicalTiming || day.endedAt !== null ||
        item.status === 'completed' || item.held))) return false
    const scheduled = day.instances.filter((item) => !item.held)
    return new Set(day.instances.map(({ id }) => id)).size === day.instances.length &&
      scheduled.length <= day.limits.tasks &&
      scheduled.reduce((sum, { task }) => sum + task.estimatedMinutes, 0) <= day.limits.minutes
  })
}

function restoreLegacyTiming(snapshot) {
  if (!validDailySession(snapshot, true)) return null
  const evidence = indexSourceEvidence(snapshot.plan.sources)
  const normalize = (task) => {
    if (!task.practice) return task
    const keepOrRecommend = (key, interval) => isValidPracticeTiming(task.practice[key], evidence, key)
      ? task.practice[key] : { unit: 'learningDay', interval, basis: 'recommendation' }
    return { ...task, practice: { ...task.practice, frequency: keepOrRecommend('frequency', 1),
      reviewAfter: keepOrRecommend('reviewAfter', 3) } }
  }
  const effective = snapshot.effectivePlan
  const open = snapshot.days.at(-1)
  return { ...snapshot, plan: { ...snapshot.plan, tasks: snapshot.plan.tasks.map(normalize) },
    effectivePlan: effective && { ...effective, tasks: effective.tasks.map(normalize) },
    days: [...snapshot.days.slice(0, -1), { ...open, instances: open.instances.map((item) =>
      item.status === 'completed' || item.held ? item : { ...item, task: normalize(item.task) }) }] }
}

export function saveDailyLearningSession(session, storage) {
  try {
    if (!validDailySession(session)) return false
    const plan = toStoredPlan(session.plan)
    const effective = session.effectivePlan && toStoredPlan({ ...session.effectivePlan, sources: plan.sources })
    const { projectId, revision, limits, days } = session
    const agent = session.agent ? restoredAgentState(session.agent, session) : undefined
    const messages = storedMessages(session.messages, plan, { ...session, agent })
    const snapshot = { version: 2, projectId, revision, limits, plan, effectivePlan: effective && { ...effective, sources: undefined },
      days: days.map(({ id, dayNumber, startedAt, endedAt, limits: dayLimits, instances }) => ({
        id, dayNumber, simulatedMinute: simulatedMinute(dayNumber), startedAt, endedAt, limits: dayLimits,
        instances: instances.map(({ id: instanceId, task, status, startedAt: start, completedAt, optional, feedback, held,
          taskVersion, startedRevision, completedRevision }) => ({
          id: instanceId, task: snapshotDailyTask(task), status, startedAt: start, completedAt, optional, feedback,
          taskVersion, startedRevision, completedRevision,
          ...(held ? { held: true } : {}),
        })),
      })),
      messages, observations: storedObservations(session.observations, new Set(days.map(({ id }) => id)), messages),
      ...(agent ? { agent } : {}),
    }
    const target = storage ?? globalThis.localStorage
    target.setItem(LEARNING_SESSION_KEY, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

export function loadLearningSession(storage) {
  let raw
  try {
    raw = (storage ?? globalThis.localStorage).getItem(LEARNING_SESSION_KEY)
  } catch {
    return { status: 'unavailable' }
  }

  if (raw === null) return { status: 'empty' }

  try {
    let snapshot = JSON.parse(raw)
    if (!snapshot || typeof snapshot !== 'object') return { status: 'invalid', reason: 'data' }
    if (snapshot.version === 2) {
      if (!validDailySession(snapshot)) snapshot = restoreLegacyTiming(snapshot)
      if (!snapshot) return { status: 'invalid', reason: 'data' }
      const agent = snapshot.agent ? restoredAgentState(snapshot.agent, snapshot) : undefined
      const messages = storedMessages(snapshot.messages, snapshot.plan, { ...snapshot, agent })
      const days = snapshot.days.map((day) => ({ ...day, simulatedMinute: simulatedMinute(day.dayNumber) }))
      const session = { ...snapshot, days, ...(agent ? { agent } : {}), messages,
        observations: storedObservations(snapshot.observations, new Set(snapshot.days.map(({ id }) => id)), messages) }
      return { status: 'restored', plan: activeLearningPlan(session), session }
    }
    if (snapshot.version !== SESSION_VERSION) return { status: 'invalid', reason: 'version' }
    if (!isValidSession(snapshot)) return { status: 'invalid', reason: 'data' }

    const { plan, currentTaskId, completedTaskIds } = snapshot
    const messages = storedMessages(snapshot.messages, plan)
    return { status: 'restored', plan, progress: { currentTaskId, completedTaskIds }, ...(messages.length ? { messages } : {}) }
  } catch {
    return { status: 'invalid', reason: 'data' }
  }
}

export function saveLearningSession(plan, { currentTaskId, completedTaskIds, messages }, storage) {
  try {
    if (!isValidSession({ plan, currentTaskId, completedTaskIds })) return false

    const snapshot = { version: SESSION_VERSION, plan: toStoredPlan(plan), currentTaskId, completedTaskIds }
    const history = storedMessages(messages, plan)
    if (history.length) snapshot.messages = history
    const target = storage ?? globalThis.localStorage
    const existing = target.getItem?.(LEARNING_SESSION_KEY)
    if (existing && JSON.parse(existing)?.version === 2) return false
    target.setItem(LEARNING_SESSION_KEY, JSON.stringify(snapshot))
    return true
  } catch {
    return false
  }
}

export function clearLearningSession(storage) {
  try {
    const target = storage ?? globalThis.localStorage
    target.removeItem(LEARNING_SESSION_KEY)
    return true
  } catch {
    return false
  }
}
