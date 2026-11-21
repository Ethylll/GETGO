import { DEFAULT_LEARNING_DAY_LIMITS } from './services/validateLearningPlan.js'

const copyRefs = (items) => items?.map(({ sourceId, excerpt }) => ({ sourceId, excerpt }))
const copyTiming = ({ unit, interval, basis, sourceRefs }) => ({
  unit, interval, basis, ...(sourceRefs === undefined ? {} : { sourceRefs: copyRefs(sourceRefs) }),
})

export function snapshotDailyTask(task) {
  const { id, type, status, title, objective, estimatedMinutes, completionCriteria, practice, steps, sourceRefs,
    prerequisiteTaskIds, knowledgePointIds, prerequisiteGates } = task
  return {
    id, type, status, title, objective, estimatedMinutes, completionCriteria, sourceRefs: copyRefs(sourceRefs),
    steps: steps.map(({ text, sourceRefs: refs }) => ({ text, sourceRefs: copyRefs(refs) })),
    prerequisiteTaskIds: [...prerequisiteTaskIds], knowledgePointIds: [...knowledgePointIds],
    prerequisiteGates: prerequisiteGates.map(({ taskId, kind, criterion }) => ({ taskId, kind, criterion })),
    ...(practice ? { practice: {
      startCondition: practice.startCondition, frequency: copyTiming(practice.frequency), reviewAfter: copyTiming(practice.reviewAfter),
      longTermGoal: practice.longTermGoal, reviewCriteria: {
        stop: practice.reviewCriteria.stop, reduce: practice.reviewCriteria.reduce, adjust: practice.reviewCriteria.adjust,
      },
    } } : {}),
  }
}

export const activeLearningPlan = ({ plan, effectivePlan }) => effectivePlan ? { ...effectivePlan, sources: plan.sources } : plan

function taskRecords(days) {
  const records = new Map()
  for (const day of days) {
    for (const instance of day.instances) {
      const record = { ...records.get(instance.task.id) }
      if (!instance.optional || instance.startedAt !== null) record.offeredDay = day.dayNumber
      if (instance.startedAt !== null) record.lastPracticedAt = instance.completedAt ?? instance.startedAt
      if (instance.status === 'completed') {
        record.completed = true
        record.feedback = new Set([...(record.feedback ?? []), ...instance.feedback])
      }
      records.set(instance.task.id, record)
    }
  }
  return records
}

function prerequisitesMet(task, records) {
  return task.prerequisiteTaskIds.every((id) => {
    const record = records.get(id)
    const gate = task.prerequisiteGates.find((item) => item.taskId === id)
    return record?.completed && (gate?.kind !== 'selfCheckFeedback' || record.feedback.has(gate.criterion))
  })
}

function isDue(task, record, dayNumber, now) {
  if (!task.practice) return !record?.completed
  if (!record) return true
  const { unit, interval } = task.practice.frequency
  return unit === 'elapsedMinutes'
    ? record.lastPracticedAt === undefined || now - record.lastPracticedAt >= interval * 60_000
    : record.offeredDay === undefined || dayNumber - record.offeredDay >= interval
}

function eligibleTasks(plan, records, dayNumber, now) {
  return plan.tasks.filter((task) => prerequisitesMet(task, records) && isDue(task, records.get(task.id), dayNumber, now))
}

function assignInstances(day, tasks, optional) {
  let minutes = day.instances.reduce((sum, item) => sum + item.task.estimatedMinutes, 0)
  const instances = [...day.instances]
  for (const task of tasks) {
    if (instances.length >= day.limits.tasks) break
    if (minutes + task.estimatedMinutes > day.limits.minutes || instances.some((item) => item.task.id === task.id)) continue
    instances.push({ id: `${day.id}:${task.id}`, task: snapshotDailyTask(task), optional,
      status: 'notStarted', startedAt: null, completedAt: null, feedback: [] })
    minutes += task.estimatedMinutes
  }
  return instances.length === day.instances.length ? day : { ...day, instances }
}

function openDay(session, startedAt) {
  const dayNumber = session.days.length + 1
  const day = { id: `day-${dayNumber}`, dayNumber, startedAt, endedAt: null, limits: { ...session.limits }, instances: [] }
  const plan = activeLearningPlan(session)
  const records = taskRecords(session.days)
  const tasks = eligibleTasks(plan, records, dayNumber, startedAt).sort((left, right) => dayNumber === 1
    ? Number(right.id === plan.entryTaskId) - Number(left.id === plan.entryTaskId)
    : (records.get(left.id)?.offeredDay ?? 0) - (records.get(right.id)?.offeredDay ?? 0))
  return assignInstances(day, tasks, false)
}

export function createDailySession(plan, projectId, now, limits = DEFAULT_LEARNING_DAY_LIMITS) {
  const session = { version: 2, projectId, revision: 0, plan, effectivePlan: null, limits: { ...limits }, days: [], messages: [] }
  return { ...session, days: [openDay(session, now)] }
}

export function feedbackCriteria(plan, taskId) {
  return [...new Set(plan.tasks.flatMap(({ prerequisiteGates }) => prerequisiteGates
    .filter((gate) => gate.taskId === taskId && gate.kind === 'selfCheckFeedback').map(({ criterion }) => criterion)))]
}

export function getOneTimeProgress(days) {
  return new Set(days.flatMap(({ instances }) => instances.filter(({ task, status }) => task.type === 'oneTime' && status === 'completed')
    .map(({ task }) => task.id)))
}

export function updateLearningDay(session, action) {
  const current = session.days.at(-1)
  if (action.dayId !== current.id || !Number.isFinite(action.now)) return session
  const now = Math.max(action.now, current.startedAt, ...current.instances.flatMap(({ startedAt, completedAt }) =>
    [startedAt ?? 0, completedAt ?? 0]))

  if (action.type === 'advance') {
    const days = [...session.days.slice(0, -1), { ...current, endedAt: now }]
    const next = { ...session, days, revision: session.revision + 1 }
    return { ...next, days: [...days, openDay(next, now)] }
  }

  const item = current.instances.find(({ id }) => id === action.instanceId)
  if (!item || (action.type === 'start' ? item.status !== 'notStarted' : action.type !== 'complete' || item.status !== 'inProgress')) return session
  const plan = activeLearningPlan(session)
  const updated = action.type === 'start' ? { ...item, status: 'inProgress', startedAt: now } : {
    ...item, status: 'completed', completedAt: now,
    feedback: feedbackCriteria(plan, item.task.id).filter((criterion) => action.feedback?.includes(criterion)),
  }
  let day = { ...current, instances: current.instances.map((row) => row.id === item.id ? updated : row) }
  const past = session.days.slice(0, -1)
  if (action.type === 'complete') {
    const before = taskRecords(session.days)
    const after = taskRecords([...past, day])
    const newlyUnlocked = eligibleTasks(plan, after, day.dayNumber, now).filter((task) => !prerequisitesMet(task, before))
    day = assignInstances(day, newlyUnlocked, true)
  }
  return { ...session, days: [...past, day], revision: session.revision + 1 }
}
