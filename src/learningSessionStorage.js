import { isValidLearningPlan } from './services/validateLearningPlan.js'

export const LEARNING_SESSION_KEY = 'getgo.learningSession'
const SESSION_VERSION = 1

function isStringList(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isValidSession({ plan, currentTaskId, completedTaskIds }) {
  if (plan?.status !== 'ready' || !['mock', 'real'].includes(plan.mode) ||
    !isStringList(plan.coverageGaps) || !isStringList(plan.notices) || !isValidLearningPlan(plan, plan.sources)) {
    return false
  }

  if (!plan.sources.every((source) => (
    typeof source.title === 'string' && ['text', 'image'].includes(source.type) &&
    ['processed', 'failed'].includes(source.status) &&
    [source.text, source.extractedText, source.error].every((value) => value === undefined || typeof value === 'string')
  ))) return false

  const taskIds = new Set(plan.tasks.map(({ id }) => id))
  if (!Array.isArray(completedTaskIds) || new Set(completedTaskIds).size !== completedTaskIds.length ||
    !completedTaskIds.every((id) => taskIds.has(id))) return false

  if (completedTaskIds.length === taskIds.size) return currentTaskId === null
  return taskIds.has(currentTaskId) && !completedTaskIds.includes(currentTaskId)
}

const copyRefs = (refs) => refs?.map(({ sourceId, excerpt }) => ({ sourceId, excerpt }))

function toStoredPlan(plan) {
  const { status, mode, topic, supportedScope, coverageGaps, entryTaskId, notices } = plan

  return {
    status, mode, topic, supportedScope, coverageGaps, entryTaskId, notices,
    sources: plan.sources.map(({ sourceId, title, type, status, text, extractedText, error }) => (
      { sourceId, title, type, status, text, extractedText, error }
    )),
    knowledgePoints: plan.knowledgePoints.map(({ id, title, prerequisiteIds, sourceRefs }) => (
      { id, title, prerequisiteIds, sourceRefs: copyRefs(sourceRefs) }
    )),
    tasks: plan.tasks.map(({ id, title, objective, prerequisiteTaskIds, knowledgePointIds, steps, sourceRefs }) => ({
      id, title, objective, prerequisiteTaskIds, knowledgePointIds,
      steps: steps.map(({ text, sourceRefs }) => ({ text, sourceRefs: copyRefs(sourceRefs) })),
      sourceRefs: copyRefs(sourceRefs),
    })),
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
    const snapshot = JSON.parse(raw)
    if (!snapshot || typeof snapshot !== 'object') return { status: 'invalid', reason: 'data' }
    if (snapshot.version !== SESSION_VERSION) return { status: 'invalid', reason: 'version' }
    if (!isValidSession(snapshot)) return { status: 'invalid', reason: 'data' }

    const { plan, currentTaskId, completedTaskIds } = snapshot
    return { status: 'restored', plan, progress: { currentTaskId, completedTaskIds } }
  } catch {
    return { status: 'invalid', reason: 'data' }
  }
}

export function saveLearningSession(plan, { currentTaskId, completedTaskIds }, storage) {
  try {
    if (!isValidSession({ plan, currentTaskId, completedTaskIds })) return false

    const snapshot = { version: SESSION_VERSION, plan: toStoredPlan(plan), currentTaskId, completedTaskIds }
    const target = storage ?? globalThis.localStorage
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
