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

const chineseTime = String.raw`(\d+)\s*(分钟|小时|自然日|天)`
const nextSession = String.raw`(?:进行|开始|做)?\s*下一次[^，,:：。]{0,12}(?:练习|训练)`
const nextPractice = String.raw`(?:(?:再|再次)\s*(?:进行|开始|做)?\s*[^，,:：。]{0,12}(?:练习|训练|练)|${nextSession})`
const practiceIntervals = [
  new RegExp(String.raw`(?:两次[^，,:：。]{0,12}(?:练习|训练)(?:之间)?\s*(?:至少)?\s*(?:相隔|间隔)|(?:练习|训练)间隔(?:为|是)?)\s*(?:至少\s*)?${chineseTime}`, 'gu'),
  new RegExp(String.raw`(?:相隔|间隔)\s*(?:至少\s*)?${chineseTime}\s*[，,]?\s*${nextPractice}`, 'gu'),
  new RegExp(String.raw`(?:^|[，,:：])\s*(?:至少\s*)?${chineseTime}\s*(?:之后|后)?\s*[，,]?\s*${nextPractice}`, 'gu'),
  new RegExp(String.raw`(?:休息|等待)\s*(?:至少\s*)?${chineseTime}\s*(?:之后|后)?\s*[，,]?\s*(?:再\s*)?${nextSession}`, 'gu'),
  new RegExp(String.raw`每(?:隔)?\s*${chineseTime}\s*[，,]?\s*(?:练习|训练)`, 'gu'),
  new RegExp(String.raw`^\s*每(?:隔)?\s*${chineseTime}\s*[，,]?\s*重复一次\s*$`, 'gu'),
  /\b(?:every\s+|(?:rest|wait)\s+(?:for\s+)?(?:at least\s+)?)(\d+)\s*(minutes?|hours?|days?)\s+(?:before\s+(?:the\s+)?next\s+(?:practice|session)|repeat|practice|train)\b/giu,
  /\b(?:practice sessions?|practice attempts?)\s+(?:are\s+)?(?:at least\s+)?(\d+)\s*(minutes?|hours?|days?)\s+apart\b/giu,
  /\b(?:after\s+)(\d+)\s*(minutes?|hours?|days?)\s*,?\s*(?:practice|train|repeat)\s+again\b/giu,
]
const reviewIntervals = [
  new RegExp(String.raw`(?:^|[，,:：]|(?:完成|结束)后)\s*${chineseTime}\s*(?:之后|后)\s*[，,]?\s*(?:复核|复查|复盘|回顾|评估)`, 'gu'),
  new RegExp(String.raw`(?:复核|复查|复盘|回顾|评估)间隔(?:为|是)?\s*${chineseTime}`, 'gu'),
  new RegExp(String.raw`每(?:隔)?\s*${chineseTime}\s*(?:复核|复查|复盘|回顾|评估)`, 'gu'),
  /\b(?:after|every)\s+(\d+)\s*(minutes?|hours?|days?)\s*,?\s*(?:review|recheck|reassess)\b/giu,
  /\b(?:review|recheck|reassess)\s+(?:after|every)\s+(\d+)\s*(minutes?|hours?|days?)\b/giu,
]

export function explicitElapsedMinutes(refs, purpose = 'frequency') {
  const patterns = purpose === 'reviewAfter' ? reviewIntervals : practiceIntervals
  const withinPractice = /(?:单次|本次|每次|一次)[^，,]{0,12}(?:练习|训练)(?:中|内|期间)|\b(?:during|within)\s+(?:each|a|the same)\s+(?:practice|training|session)\b/iu
  return refs.flatMap(({ excerpt }) => excerpt.normalize('NFKC').split(/[。；！？;!?\r\n]|\.(?!\d)/u)
    .filter((sentence) => !withinPractice.test(sentence))
    .flatMap((sentence) => patterns.flatMap((pattern) => [...sentence.matchAll(pattern)].map(([, amount, unit]) => {
      const factor = /小时|^hour/iu.test(unit) ? 60 : /自然日|天|^day/iu.test(unit) ? 1440 : 1
      return Number(amount) * factor
    }))))
}

export function isValidPracticeTiming(timing, evidenceById, purpose, historical = false) {
  const maxInterval = timing?.unit === 'learningDay' ? 365 : timing?.unit === 'elapsedMinutes' ? 525_600 : 0
  if (!Number.isInteger(timing?.interval) || timing.interval < 1 || timing.interval > maxInterval) return false
  if (timing.basis === 'source') {
    if (!hasValidSourceRefs(timing.sourceRefs, evidenceById)) return false
    if (historical) return true
    return timing.unit === 'elapsedMinutes' && timing.sourceRefs.every((ref) => {
      const intervals = explicitElapsedMinutes([ref], purpose)
      return intervals.length > 0 && intervals.every((minutes) => timing.interval === minutes)
    })
  }
  return timing.basis === 'recommendation' && timing.unit === 'learningDay' && timing.sourceRefs === undefined
}

export function isValidV2Task(task, recurringPrerequisiteIds, evidenceById, historicalTiming = false) {
  if (!['oneTime', 'recurring'].includes(task.type) || task.status !== 'notStarted' ||
    !Number.isInteger(task.estimatedMinutes) || task.estimatedMinutes < 1 ||
    task.estimatedMinutes > DEFAULT_LEARNING_DAY_LIMITS.minutes || !isNonEmptyText(task.completionCriteria) ||
    (task.auxiliary !== undefined && task.auxiliary !== true) ||
    (task.selfCheck !== undefined && (task.type !== 'oneTime' || !task.auxiliary || !isNonEmptyText(task.selfCheck))) ||
    !Array.isArray(task.prerequisiteGates) || task.prerequisiteGates.length !== recurringPrerequisiteIds.length) return false

  const remaining = new Set(recurringPrerequisiteIds)
  if (!task.prerequisiteGates.every((gate) => remaining.delete(gate?.taskId) &&
    (gate.kind === 'practiceCompletion' || (gate.kind === 'selfCheckFeedback' && isNonEmptyText(gate.criterion))))) return false
  if (task.type === 'oneTime') return task.practice === undefined

  const practice = task.practice
  return practice?.startCondition === (task.prerequisiteTaskIds.length ? 'afterPrerequisites' : 'immediate') &&
    isValidPracticeTiming(practice.frequency, evidenceById, 'frequency', historicalTiming) &&
    isValidPracticeTiming(practice.reviewAfter, evidenceById, 'reviewAfter', historicalTiming) &&
    isNonEmptyText(practice.longTermGoal) &&
    (practice.difficulty === undefined || (isNonEmptyText(practice.difficulty?.text) &&
      hasValidSourceRefs(practice.difficulty.sourceRefs, evidenceById))) &&
    ['stop', 'reduce', 'adjust'].every((key) => isNonEmptyText(practice.reviewCriteria?.[key]))
}

export function isValidLearningPlan(plan, sources, historicalTiming = false) {
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
      plan.tasks[taskPositions.get(id)].type === 'recurring'), evidenceById, historicalTiming))
  ))
}
