import { DEFAULT_LEARNING_DAY_LIMITS } from './services/validateLearningPlan.js'

const copyRefs = (items) => items?.map(({ sourceId, excerpt }) => ({ sourceId, excerpt }))
const copyTiming = ({ unit, interval, basis, sourceRefs }) => ({
  unit, interval, basis, ...(sourceRefs === undefined ? {} : { sourceRefs: copyRefs(sourceRefs) }),
})

export function snapshotDailyTask(task) {
  const { id, type, status, title, objective, estimatedMinutes, completionCriteria, practice, steps, sourceRefs,
    prerequisiteTaskIds, knowledgePointIds, prerequisiteGates, auxiliary, selfCheck } = task
  return {
    id, type, status, title, objective, estimatedMinutes, completionCriteria, sourceRefs: copyRefs(sourceRefs),
    steps: steps.map(({ text, sourceRefs: refs }) => ({ text, sourceRefs: copyRefs(refs) })),
    prerequisiteTaskIds: [...prerequisiteTaskIds], knowledgePointIds: [...knowledgePointIds],
    prerequisiteGates: prerequisiteGates.map(({ taskId, kind, criterion }) => ({ taskId, kind, criterion })),
    ...(auxiliary ? { auxiliary: true } : {}), ...(selfCheck ? { selfCheck } : {}),
    ...(practice ? { practice: {
      startCondition: practice.startCondition, frequency: copyTiming(practice.frequency), reviewAfter: copyTiming(practice.reviewAfter),
      longTermGoal: practice.longTermGoal, reviewCriteria: {
        stop: practice.reviewCriteria.stop, reduce: practice.reviewCriteria.reduce, adjust: practice.reviewCriteria.adjust,
      },
      ...(practice.difficulty ? { difficulty: { text: practice.difficulty.text, sourceRefs: copyRefs(practice.difficulty.sourceRefs) } } : {}),
    } } : {}),
  }
}

export const activeLearningPlan = ({ plan, effectivePlan }) => effectivePlan ? { ...effectivePlan, sources: plan.sources } : plan
export const simulatedMinute = (dayNumber) => (dayNumber - 1) * 1440

function taskRecords(days) {
  const records = new Map()
  for (const day of days) {
    for (const instance of day.instances) {
      if (instance.held) continue
      const record = { ...records.get(instance.task.id) }
      if (!instance.optional || instance.startedAt !== null) record.offeredDay = day.dayNumber
      if (instance.startedAt !== null) record.lastPracticedMinute = simulatedMinute(day.dayNumber)
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

function isDue(task, record, dayNumber) {
  if (!task.practice) return !record?.completed
  if (!record) return true
  const { unit, interval } = task.practice.frequency
  return unit === 'elapsedMinutes'
    ? record.lastPracticedMinute === undefined || simulatedMinute(dayNumber) - record.lastPracticedMinute >= interval
    : record.offeredDay === undefined || dayNumber - record.offeredDay >= interval
}

function eligibleTasks(plan, records, dayNumber, schedule) {
  return plan.tasks.filter((task) => availableToday(task, records, dayNumber, schedule) && isDue(task, records.get(task.id), dayNumber))
}

function availableToday(task, records, dayNumber, schedule) {
  return task && (schedule.get(task.id)?.notBefore ?? 0) <= dayNumber && prerequisitesMet(task, records)
}

function assignInstances(day, tasks, optional, taskVersion) {
  const scheduled = day.instances.filter((item) => !item.held)
  let count = scheduled.length
  let minutes = scheduled.reduce((sum, item) => sum + item.task.estimatedMinutes, 0)
  const instances = [...day.instances]
  for (const task of tasks) {
    if (count >= day.limits.tasks) break
    const index = instances.findIndex((item) => item.task.id === task.id)
    if (minutes + task.estimatedMinutes > day.limits.minutes || (index >= 0 && !instances[index].held)) continue
    const prior = instances[index]
    const { held, ...original } = prior ?? { id: `${day.id}:${task.id}`, status: 'notStarted',
      startedAt: null, completedAt: null, feedback: [] }
    const instance = { ...original, task: snapshotDailyTask(task), optional: optional || Boolean(task.auxiliary),
      ...(taskVersion === undefined ? {} : { taskVersion }) }
    if (index < 0) instances.push(instance)
    else instances[index] = instance
    count++
    minutes += task.estimatedMinutes
  }
  return count === scheduled.length ? day : { ...day, instances }
}

function openDay(session, startedAt) {
  const dayNumber = session.days.length + 1
  const day = { id: `day-${dayNumber}`, dayNumber, simulatedMinute: simulatedMinute(dayNumber), startedAt, endedAt: null,
    limits: { ...session.limits }, instances: [] }
  const plan = activeLearningPlan(session)
  const records = taskRecords(session.days)
  const schedule = new Map((session.agent?.schedule ?? []).map((item) => [item.taskId, item]))
  const priority = (id) => Number(schedule.get(id)?.priorityDay === dayNumber)
  const tasks = eligibleTasks(plan, records, dayNumber, schedule).sort((left, right) =>
    priority(right.id) - priority(left.id) || Number(Boolean(left.auxiliary)) - Number(Boolean(right.auxiliary)) ||
    (dayNumber === 1 ? Number(right.id === plan.entryTaskId) - Number(left.id === plan.entryTaskId)
      : (records.get(left.id)?.offeredDay ?? 0) - (records.get(right.id)?.offeredDay ?? 0)))
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
  return new Set(days.flatMap(({ instances }) => instances.filter(({ task, status }) => task.type === 'oneTime' && !task.auxiliary && status === 'completed')
    .map(({ task }) => task.id)))
}

export function currentDayInstances(session) {
  const day = session.days.at(-1)
  const tasks = new Map(activeLearningPlan(session).tasks.map((task) => [task.id, task]))
  const records = taskRecords(session.days)
  const schedule = new Map((session.agent?.schedule ?? []).map((item) => [item.taskId, item]))
  return day.instances.filter((item) => {
    if (item.status === 'completed') return true
    return !item.held && availableToday(tasks.get(item.task.id), records, day.dayNumber, schedule)
  })
}

export function reviseOpenLearningDay(session, affectedIds, startedTaskId) {
  const day = session.days.at(-1)
  const history = session.days.slice(0, -1)
  const plan = activeLearningPlan(session)
  const records = taskRecords(session.days)
  const schedule = new Map((session.agent?.schedule ?? []).map((item) => [item.taskId, item]))
  const valid = (task) => availableToday(task, records, day.dayNumber, schedule)
  const hasHistory = (item) => session.messages.some(({ instanceId }) => instanceId === item.id) ||
    session.agent?.notes?.some(({ instanceId }) => instanceId === item.id)
  const version = session.revision + 1
  const replace = day.instances.filter((item) => affectedIds.has(item.task.id) && item.startedAt === null && !hasHistory(item))
  const remaining = day.instances.filter((item) => !replace.includes(item))
  const scheduled = remaining.filter((item) => !item.held)
  let minutes = scheduled.reduce((sum, { task }) => sum + task.estimatedMinutes, 0)
  let count = scheduled.length
  const kept = remaining.map((item) => {
    if (item.status === 'completed' || !affectedIds.has(item.task.id)) return item
    const task = plan.tasks.find(({ id }) => id === item.task.id)
    const previousMinutes = item.held ? 0 : item.task.estimatedMinutes
    if (!valid(task)) {
      if (item.held) return item
      minutes -= previousMinutes
      count--
      return { ...item, held: true }
    }
    if (item.status === 'inProgress' && !item.held && item.task.id !== startedTaskId) return item
    if ((item.held && count >= day.limits.tasks) || minutes - previousMinutes + task.estimatedMinutes > day.limits.minutes) return item
    if (item.held) count++
    minutes += task.estimatedMinutes - previousMinutes
    const { held, ...active } = item
    return { ...active, task: snapshotDailyTask(task), taskVersion: version, optional: Boolean(held || active.optional || task.auxiliary) }
  })
  let next = { ...day, instances: kept }
  for (const item of replace) {
    const task = plan.tasks.find(({ id }) => id === item.task.id)
    if (valid(task)) next = assignInstances(next, [task], item.optional, version)
  }
  next.instances.sort((left, right) => day.instances.findIndex(({ id }) => id === left.id) -
    day.instances.findIndex(({ id }) => id === right.id))
  const candidates = eligibleTasks(plan, records, day.dayNumber, schedule)
    .filter(({ id }) => affectedIds.has(id) && !day.instances.some(({ task }) => task.id === id))
  next = assignInstances(next, candidates, true, version)
  return { ...session, days: [...history, next] }
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
  if (!currentDayInstances(session).includes(item)) return session
  const plan = activeLearningPlan(session)
  const criteria = [...feedbackCriteria(plan, item.task.id), item.task.selfCheck].filter(Boolean)
  const revision = session.revision + 1
  const updated = action.type === 'start' ? { ...item, status: 'inProgress', startedAt: now, startedRevision: revision } : {
    ...item, status: 'completed', completedAt: now, completedRevision: revision,
    feedback: [...new Set(criteria)].filter((criterion) => action.feedback?.includes(criterion)),
  }
  let day = { ...current, instances: current.instances.map((row) => row.id === item.id ? updated : row) }
  const past = session.days.slice(0, -1)
  if (action.type === 'complete') {
    const before = taskRecords(session.days)
    const after = taskRecords([...past, day])
    const schedule = new Map((session.agent?.schedule ?? []).map((item) => [item.taskId, item]))
    const newlyUnlocked = eligibleTasks(plan, after, day.dayNumber, schedule).filter((task) => !prerequisitesMet(task, before))
    day = assignInstances(day, newlyUnlocked, true)
  }
  return { ...session, days: [...past, day], revision: session.revision + 1 }
}
