import { isValidLearningPlan } from './services/validateLearningPlan.js'
import { isEvidenceAnswer, QUESTION_LIMIT } from './chatMessages.js'
import { sourceText } from './learningSources.js'

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

function storedMessages(messages, plan) {
  if (!Array.isArray(messages)) return []
  const taskIds = new Set(plan.tasks.map(({ id }) => id))
  const evidence = new Map(plan.sources.filter((source) => source.status === 'processed').map((source) => [source.sourceId, sourceText(source)]))
  const ids = new Set()
  const result = []

  for (const turn of messages) {
    if (!turn || typeof turn.id !== 'string' || !turn.id || ids.has(turn.id) || !taskIds.has(turn.taskId) ||
      typeof turn.question !== 'string' || !turn.question.trim() || turn.question.length > QUESTION_LIMIT ||
      !Number.isFinite(turn.createdAt)) continue

    const status = turn.status === 'pending' ? 'interrupted' : turn.status
    let answer = ''
    let citations = []
    if (isEvidenceAnswer(status)) {
      if (!Array.isArray(turn.citations) || !turn.citations.length || turn.citations.length > 4 ||
        !turn.citations.every((ref) => typeof ref?.excerpt === 'string' && ref.excerpt.trim().length >= 4 && evidence.get(ref.sourceId)?.includes(ref.excerpt))) continue
      citations = copyRefs(turn.citations)
      answer = citations.map((ref) => ref.excerpt).join('\n')
      if (turn.answer !== answer || (status === 'conflict' && new Set(citations.map((ref) => ref.sourceId)).size < 2)) continue
    } else if (!['insufficient', 'interrupted', 'error'].includes(status)) continue

    ids.add(turn.id)
    const { id, taskId, question, createdAt } = turn
    result.push({ id, taskId, question, createdAt, status, answer, citations })
  }
  return result
}

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
