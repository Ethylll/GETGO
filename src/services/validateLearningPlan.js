function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

export const DEFAULT_LEARNING_DAY_LIMITS = Object.freeze({ minutes: 30, tasks: 5 })

function indexIds(items, field = 'id') {
  if (!Array.isArray(items) || !items.length) return null

  const ids = new Map()
  for (const [index, item] of items.entries()) {
    const id = item?.[field]
    if (!isNonEmptyText(id) || ids.has(id)) return null
    ids.set(id, index)
  }
  return ids
}

function hasEarlierPrerequisites(ids, positions, index) {
  return Array.isArray(ids) && ids.every((id) => positions.has(id) && positions.get(id) < index)
}

export function indexSourceEvidence(sources) {
  const evidenceById = new Map()
  for (const source of sources) {
    if (source.status !== 'processed') continue
    const evidence = source.type === 'text' ? source.text : source.extractedText
    if (isNonEmptyText(evidence)) evidenceById.set(source.sourceId, evidence)
  }
  return evidenceById
}

export function hasValidSourceRefs(refs, evidenceById) {
  return Array.isArray(refs) && refs.length > 0 && refs.every((ref) => (
    isNonEmptyText(ref?.excerpt) && evidenceById.get(ref.sourceId)?.includes(ref.excerpt)
  ))
}

export function explicitElapsedMinutes(refs) {
  const factors = { 分钟: 1, 小时: 60, 自然日: 1440 }
  return refs.flatMap(({ excerpt }) => [...excerpt.normalize('NFKC')
    .matchAll(/(?:每隔|间隔|相隔)\s*(?:至少\s*)?(\d+)\s*(分钟|小时|自然日)/gu)]
    .map(([, amount, unit]) => Number(amount) * factors[unit]))
}

function isValidPracticeTiming(timing, evidenceById) {
  const maxInterval = timing?.unit === 'learningDay' ? 365 : timing?.unit === 'elapsedMinutes' ? 525_600 : 0
  if (!Number.isInteger(timing?.interval) || timing.interval < 1 || timing.interval > maxInterval) return false
  if (timing.basis === 'source') {
    if (!hasValidSourceRefs(timing.sourceRefs, evidenceById)) return false
    // Catch explicit elapsed intervals that would otherwise be mistaken for learning days.
    return explicitElapsedMinutes(timing.sourceRefs).every((minutes) =>
      timing.unit === 'elapsedMinutes' && timing.interval === minutes)
  }
  return timing.basis === 'recommendation' && timing.unit === 'learningDay' && timing.sourceRefs === undefined
}

export function isValidV2Task(task, recurringPrerequisiteIds, evidenceById) {
  if (!['oneTime', 'recurring'].includes(task.type) || task.status !== 'notStarted' ||
    !Number.isInteger(task.estimatedMinutes) || task.estimatedMinutes < 1 ||
    task.estimatedMinutes > DEFAULT_LEARNING_DAY_LIMITS.minutes || !isNonEmptyText(task.completionCriteria) ||
    !Array.isArray(task.prerequisiteGates) || task.prerequisiteGates.length !== recurringPrerequisiteIds.length) return false

  const remaining = new Set(recurringPrerequisiteIds)
  if (!task.prerequisiteGates.every((gate) => remaining.delete(gate?.taskId) &&
    (gate.kind === 'practiceCompletion' || (gate.kind === 'selfCheckFeedback' && isNonEmptyText(gate.criterion))))) return false
  if (task.type === 'oneTime') return task.practice === undefined

  const practice = task.practice
  return practice?.startCondition === (task.prerequisiteTaskIds.length ? 'afterPrerequisites' : 'immediate') &&
    isValidPracticeTiming(practice.frequency, evidenceById) && isValidPracticeTiming(practice.reviewAfter, evidenceById) &&
    isNonEmptyText(practice.longTermGoal) &&
    ['stop', 'reduce', 'adjust'].every((key) => isNonEmptyText(practice.reviewCriteria?.[key]))
}

export function isValidLearningPlan(plan, sources) {
  if (!isNonEmptyText(plan?.topic) || !isNonEmptyText(plan.supportedScope) || !indexIds(sources, 'sourceId')) return false
  if (plan.planVersion !== undefined && ![1, 2].includes(plan.planVersion)) return false

  const taskPositions = indexIds(plan.tasks)
  const pointPositions = indexIds(plan.knowledgePoints)
  if (!taskPositions?.has(plan.entryTaskId) || !pointPositions) return false

  const v2 = plan.planVersion === 2
  if (v2 && plan.tasks[taskPositions.get(plan.entryTaskId)].prerequisiteTaskIds?.length !== 0) return false
  const evidenceById = indexSourceEvidence(sources)
  const hasValidRefs = (refs) => hasValidSourceRefs(refs, evidenceById)

  return plan.knowledgePoints.every((point, index) => (
    isNonEmptyText(point.title) && hasEarlierPrerequisites(point.prerequisiteIds, pointPositions, index) && hasValidRefs(point.sourceRefs)
  )) && plan.tasks.every((task, index) => (
    isNonEmptyText(task.title) && isNonEmptyText(task.objective) &&
    hasEarlierPrerequisites(task.prerequisiteTaskIds, taskPositions, index) &&
    Array.isArray(task.knowledgePointIds) && task.knowledgePointIds.length > 0 &&
    task.knowledgePointIds.every((id) => pointPositions.has(id)) &&
    hasValidRefs(task.sourceRefs) && Array.isArray(task.steps) && task.steps.length >= 2 && task.steps.length <= 5 &&
    task.steps.every((step) => isNonEmptyText(step?.text) &&
      ((!v2 && step.sourceRefs === undefined) || hasValidRefs(step.sourceRefs))) &&
    (!v2 || isValidV2Task(task, task.prerequisiteTaskIds.filter((id) =>
      plan.tasks[taskPositions.get(id)].type === 'recurring'), evidenceById))
  ))
}
