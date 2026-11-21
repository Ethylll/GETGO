function isNonEmptyText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

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

export function isValidLearningPlan(plan, sources) {
  if (!isNonEmptyText(plan?.topic) || !isNonEmptyText(plan.supportedScope) || !indexIds(sources, 'sourceId')) return false

  const taskPositions = indexIds(plan.tasks)
  const pointPositions = indexIds(plan.knowledgePoints)
  if (!taskPositions?.has(plan.entryTaskId) || !pointPositions) return false

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
    task.steps.every((step) => isNonEmptyText(step?.text) && (step.sourceRefs === undefined || hasValidRefs(step.sourceRefs)))
  ))
}
