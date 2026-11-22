import { activeLearningPlan, reviseOpenLearningDay, snapshotDailyTask } from './learningDays.js'
import { hasValidSourceRefs, indexSourceEvidence, isValidLearningPlan, isValidV2Task } from './services/validateLearningPlan.js'

function orderedAgentData(value) {
  if (Array.isArray(value)) return value.map(orderedAgentData)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, orderedAgentData(value[key])]))
}

export const equalAgentData = (left, right) => JSON.stringify(orderedAgentData(left)) === JSON.stringify(orderedAgentData(right))
export const shortText = (value, length) => typeof value === 'string' && value.trim().length > 0 && value.length <= length
export const onlyKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).every((key) => keys.includes(key))
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

function sourceRefs(value, evidence) {
  if (!Array.isArray(value) || value.length > 3 || !value.every((ref) => onlyKeys(ref, ['sourceId', 'excerpt']) &&
    shortText(ref.sourceId, 100) && shortText(ref.excerpt, 240)) || !hasValidSourceRefs(value, evidence)) return null
  return value.map(({ sourceId, excerpt }) => ({ sourceId, excerpt }))
}

function groundedStep(value, evidence) {
  if (!onlyKeys(value, ['text', 'sourceRefs']) || !shortText(value.text, 240)) return null
  const refs = sourceRefs(value.sourceRefs, evidence)
  return refs && { text: value.text.trim(), sourceRefs: refs }
}

function steps(value, evidence) {
  if (!Array.isArray(value) || value.length < 2 || value.length > 5) return null
  const checked = value.map((step) => groundedStep(step, evidence))
  return checked.every(Boolean) ? checked : null
}

export { groundedStep }

const changeTask = (before, after, anchor = null) => ({
  taskId: (before ?? after).id, before: snapshot(before), after: snapshot(after), anchor,
})
const changePlacement = (taskId, before, after) => ({ taskId, before, after })
const snapshot = (task) => task ? snapshotDailyTask(task) : null

function exercise(target, id, params, evidence, assessment = false) {
  if (!onlyKeys(params, ['title', 'minutes', 'steps', 'criterion']) ||
    !shortText(params.title, 96) || !integer(params.minutes, 1, assessment ? Math.min(10, target.estimatedMinutes) : target.estimatedMinutes) ||
    !shortText(params.criterion, 120)) return null
  const instructions = steps(params.steps, evidence)
  if (!instructions) return null
  return {
    id, type: 'oneTime', status: 'notStarted', title: params.title.trim(), objective: target.objective,
    estimatedMinutes: params.minutes, completionCriteria: params.criterion.trim(),
    knowledgePointIds: target.knowledgePointIds, prerequisiteTaskIds: target.prerequisiteTaskIds,
    prerequisiteGates: target.prerequisiteGates, sourceRefs: instructions[0].sourceRefs, steps: instructions,
    ...(assessment ? { auxiliary: true, selfCheck: params.criterion.trim() } : {}),
  }
}

export function planChangeFor(session, action, actionId) {
  const plan = activeLearningPlan(session)
  const target = plan.tasks.find(({ id }) => id === action.taskId)
  if (!target) return { code: 'unknown_task' }
  const params = action.params
  const day = session.days.at(-1)
  const current = day.instances.find(({ task }) => task.id === target.id)
  const started = current?.status === 'inProgress'
  const evidence = indexSourceEvidence(plan.sources)
  const before = snapshot(target)
  const placement = session.agent?.schedule.find(({ taskId }) => taskId === target.id) ?? null
  const delta = { tasks: [], schedule: [] }
  let confirmation = false

  switch (action.type) {
    case 'CHECK_MASTERY': {
      const check = exercise(target, actionId, params, evidence, true)
      if (!check) return { code: 'invalid_check' }
      delta.tasks = [changeTask(null, check)]
      delta.schedule = [changePlacement(check.id, null, { taskId: check.id, priorityDay: day.dayNumber + 1 })]
      break
    }
    case 'ADJUST_PRACTICE': {
      if (!target.practice || !onlyKeys(params, ['minutes', 'frequency', 'reviewAfter', 'difficulty', 'steps']) ||
        !Object.keys(params).length) return { code: 'invalid_practice' }
      const after = { ...before, practice: { ...before.practice } }
      if (params.minutes !== undefined) {
        if (!integer(params.minutes, 1, Math.min(30, session.limits.minutes))) return { code: 'invalid_duration' }
        after.estimatedMinutes = params.minutes
      }
      for (const key of ['frequency', 'reviewAfter']) {
        if (params[key] === undefined) continue
        if (before.practice[key].basis === 'source' || !integer(params[key], 1, 365)) return { code: 'source_timing' }
        after.practice[key] = { ...after.practice[key], interval: params[key] }
      }
      if (params.difficulty !== undefined) {
        after.practice.difficulty = groundedStep(params.difficulty, evidence)
        if (!after.practice.difficulty) return { code: 'invalid_difficulty' }
      }
      if (params.steps !== undefined) {
        after.steps = steps(params.steps, evidence)
        if (!after.steps) return { code: 'invalid_steps' }
      }
      if (equalAgentData(before, after)) return { code: 'no_change' }
      confirmation = started || Math.abs(after.estimatedMinutes - before.estimatedMinutes) > 5 ||
        ['frequency', 'reviewAfter'].some((key) => Math.abs(after.practice[key].interval - before.practice[key].interval) > 1)
      delta.tasks = [changeTask(before, after)]
      break
    }
    case 'DECOMPOSE_TASK': {
      if (!onlyKeys(params, ['parts']) || target.auxiliary || !Array.isArray(params.parts) ||
        !integer(params.parts.length, 2, 3) || session.days.some(({ instances }) => instances.some(
          ({ task, status }) => task.id === target.id && task.type === 'oneTime' && status === 'completed'))) {
        return { code: 'invalid_decomposition' }
      }
      for (const [index, part] of params.parts.entries()) {
        const child = exercise(target, `${actionId}-${index + 1}`, part, evidence)
        if (!child) return { code: 'invalid_part' }
        if (index) child.prerequisiteTaskIds = [...child.prerequisiteTaskIds, delta.tasks.at(-1).taskId]
        delta.tasks.push(changeTask(null, child, target.id))
      }
      const after = { ...before, prerequisiteTaskIds: [...before.prerequisiteTaskIds, delta.tasks.at(-1).taskId] }
      if (after.practice) after.practice = { ...after.practice, startCondition: 'afterPrerequisites' }
      delta.tasks.push(changeTask(before, after))
      if (target.id === plan.entryTaskId) delta.entry = { before: target.id, after: delta.tasks[0].taskId }
      confirmation = true
      break
    }
    case 'RESCHEDULE': {
      if (!onlyKeys(params, ['operation', 'days'])) return { code: 'invalid_schedule' }
      if (params.operation === 'defer' && integer(params.days, 1, 7)) {
        const taskIds = new Set(plan.tasks.filter((task) => task.prerequisiteTaskIds.includes(target.id)).map(({ id }) => id))
        confirmation = started || taskIds.size > 0 || target.id === plan.entryTaskId
        const after = { taskId: target.id, notBefore: day.dayNumber + params.days }
        if (equalAgentData(placement, after)) return { code: 'no_change' }
        delta.schedule = [changePlacement(target.id, placement, after)]
      } else if (params.operation === 'advance' && params.days === undefined) {
        confirmation = (placement?.notBefore ?? 0) > day.dayNumber
        const after = { taskId: target.id, priorityDay: day.dayNumber + 1 }
        if (equalAgentData(placement, after)) return { code: 'no_change' }
        delta.schedule = [changePlacement(target.id, placement, after)]
      } else if (params.operation === 'reinforce' && params.days === undefined && !target.auxiliary && target.type === 'oneTime' &&
        session.days.some(({ instances }) => instances.some(({ task, status }) => task.id === target.id && status === 'completed'))) {
        const after = { ...before, id: actionId, title: `巩固 · ${target.title}`, auxiliary: true }
        delta.tasks = [changeTask(null, after)]
        delta.schedule = [changePlacement(after.id, null, { taskId: after.id, notBefore: day.dayNumber + 1 })]
      } else return { code: 'invalid_schedule' }
      break
    }
    default:
      return { code: 'unknown_action' }
  }
  return { delta, confirmation }
}

export function applyPlanDelta(session, delta, startedTaskId) {
  const plan = activeLearningPlan(session)
  const tasks = [...plan.tasks]
  const schedule = new Map((session.agent?.schedule ?? []).map((item) => [item.taskId, item]))
  if (!Array.isArray(delta?.tasks) || delta.tasks.length > 4 || !Array.isArray(delta.schedule) || delta.schedule.length > 1 ||
    !delta.tasks.length && !delta.schedule.length) return null
  for (const { taskId, before, after, anchor } of delta.tasks) {
    const index = tasks.findIndex(({ id }) => id === taskId)
    if (!equalAgentData(snapshot(tasks[index]), before) || (after && after.id !== taskId)) return null
    if (index >= 0) tasks.splice(index, 1, ...(after ? [after] : []))
    else if (after) {
      const position = tasks.findIndex(({ id }) => id === anchor)
      tasks.splice(position < 0 ? tasks.length : position, 0, after)
    }
  }
  for (const { taskId, before, after } of delta.schedule) {
    if (!equalAgentData(schedule.get(taskId) ?? null, before) || (after && after.taskId !== taskId)) return null
    if (after) schedule.set(taskId, after)
    else schedule.delete(taskId)
  }
  if (delta.entry && delta.entry.before !== plan.entryTaskId) return null
  const entryTaskId = delta.entry?.after ?? plan.entryTaskId
  const effectivePlan = { ...plan, entryTaskId, tasks }
  if (tasks.length > 32 || !isValidLearningPlan(effectivePlan, plan.sources)) return null
  const affected = new Set([...delta.tasks, ...delta.schedule].map(({ taskId }) => taskId))
  return reviseOpenLearningDay({ ...session, effectivePlan, agent: { ...session.agent, schedule: [...schedule.values()] } }, affected, startedTaskId)
}

export function appliedDayEffects(session, next, delta) {
  const day = session.days.at(-1)
  const updated = next.days.at(-1)
  const ids = new Set([...delta.tasks, ...delta.schedule].map(({ taskId }) => taskId))
  return [...ids].map((taskId) => {
    const instanceId = `${day.id}:${taskId}`
    const before = day.instances.find(({ id }) => id === instanceId)
    const after = updated.instances.find(({ id }) => id === instanceId)
    if (after?.held && !before?.held) return { taskId, instanceId, effect: 'paused' }
    if (before && !after) return { taskId, instanceId, effect: 'removed' }
    if (after && !after.held && (!before || before.held || !equalAgentData(before.task, after.task))) {
      return { taskId, instanceId, effect: before && !before.held ? 'updated' : 'scheduled',
        estimatedMinutes: after.task.estimatedMinutes }
    }
    return { taskId, effect: 'future', ...(after ? { instanceId, estimatedMinutes: after.task.estimatedMinutes } : {}) }
  })
}

export function reversePlanDelta(delta) {
  const reverse = ({ before, after, ...rest }) => ({ ...rest, before: after, after: before })
  return { tasks: [...delta.tasks].reverse().map(reverse), schedule: delta.schedule.map(reverse),
    ...(delta.entry ? { entry: reverse(delta.entry) } : {}) }
}

export function canReversePlanDelta(session, delta) {
  const plan = activeLearningPlan(session)
  return (!delta.entry || delta.entry.after === plan.entryTaskId) &&
    delta.tasks.every(({ taskId, after }) => equalAgentData(snapshot(plan.tasks.find(({ id }) => id === taskId)), after)) &&
    delta.schedule.every(({ taskId, after }) =>
      equalAgentData(session.agent.schedule.find((item) => item.taskId === taskId) ?? null, after))
}

export function validStoredPlanDelta(delta, evidence) {
  if (!Array.isArray(delta?.tasks) || delta.tasks.length > 4 || !Array.isArray(delta.schedule) || delta.schedule.length > 1 ||
    (!delta.tasks.length && !delta.schedule.length)) return false
  const validTask = (task, id) => task === null || (task?.id === id && shortText(task.title, 300) && shortText(task.objective, 600) &&
    Array.isArray(task.prerequisiteTaskIds) && task.prerequisiteTaskIds.every((item) => typeof item === 'string') &&
    Array.isArray(task.knowledgePointIds) && Array.isArray(task.steps) && task.steps.length >= 2 && task.steps.length <= 5 &&
    task.steps.every((step) => shortText(step?.text, 600) && hasValidSourceRefs(step.sourceRefs, evidence)) &&
    hasValidSourceRefs(task.sourceRefs, evidence) && Array.isArray(task.prerequisiteGates) &&
    isValidV2Task(task, task.prerequisiteTaskIds.filter((key) => task.prerequisiteGates.some((gate) => gate?.taskId === key)), evidence, true))
  const validPlacement = (item, id) => item === null || (item?.taskId === id &&
    [item.notBefore, item.priorityDay].every((day) => day === undefined || integer(day, 1, Number.MAX_SAFE_INTEGER)))
  return delta.tasks.every((item) => shortText(item?.taskId, 180) && (item.before !== null || item.after !== null) &&
    validTask(item.before, item.taskId) && validTask(item.after, item.taskId)) &&
    delta.schedule.every((item) => shortText(item?.taskId, 180) && (item.before !== null || item.after !== null) &&
      validPlacement(item.before, item.taskId) && validPlacement(item.after, item.taskId)) &&
    (delta.entry === undefined || (shortText(delta.entry?.before, 180) && shortText(delta.entry.after, 180)))
}
