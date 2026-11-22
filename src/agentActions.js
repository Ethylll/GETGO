import { activeLearningPlan } from './learningDays.js'
import { appliedDayEffects, applyPlanDelta, canReversePlanDelta, equalAgentData, groundedStep, onlyKeys, planChangeFor, reversePlanDelta, shortText } from './agentPlanChanges.js'
import { sourceText } from './learningSources.js'
import { indexSourceEvidence } from './services/validateLearningPlan.js'

export const AGENT_ACTIONS = ['KEEP_PLAN', 'GUIDE', 'CLARIFY', 'DECOMPOSE_TASK', 'ADJUST_PRACTICE', 'RESCHEDULE', 'CHECK_MASTERY', 'SEARCH_SOURCES']
export const EMPTY_AGENT_STATE = { rounds: [], notes: [], changes: [], schedule: [] }
const planActions = new Set(['DECOMPOSE_TASK', 'ADJUST_PRACTICE', 'RESCHEDULE', 'CHECK_MASTERY'])
const normalization = (text) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}]/gu, '')
const tokenizer = new Intl.Segmenter('zh', { granularity: 'word' })

export function normalizeAgentDecision(value) {
  if (value && ['finish', 'wait'].includes(value.type)) {
    value = { ...value, reason: value.reason ?? (value.type === 'wait' ? '等待学习反馈。' : '结束本轮观察。'),
      evidenceIds: value.evidenceIds ?? [] }
  }
  if (!onlyKeys(value, ['type', 'reason', 'issue', 'evidenceIds', 'action', 'exception']) ||
    !['act', 'finish', 'wait'].includes(value.type) || !shortText(value.reason, 220) ||
    (value.issue !== undefined && !shortText(value.issue, 180)) ||
    !Array.isArray(value.evidenceIds) || value.evidenceIds.length > 6 || !value.evidenceIds.every((id) => shortText(id, 180)) ||
    (value.exception !== undefined && !['newSevereDifficulty', 'adjustmentProblem'].includes(value.exception))) return null
  if (value.type === 'act') {
    const action = value.action
    if (!onlyKeys(action, ['type', 'taskId', 'params']) || !shortText(action.type, 48) ||
      (action.taskId !== undefined && !shortText(action.taskId, 120)) ||
      !action.params || typeof action.params !== 'object' || Array.isArray(action.params) ||
      JSON.stringify(action.params).length > 8000) return null
  } else if (value.action !== undefined || value.exception !== undefined) return null
  return { type: value.type, reason: value.reason.trim(), ...(value.issue ? { issue: value.issue.trim() } : {}),
    evidenceIds: [...new Set(value.evidenceIds)], ...(value.action ? { action: value.action } : {}),
    ...(value.exception ? { exception: value.exception } : {}) }
}

function searchSources(plan, query) {
  const terms = [...new Set([...tokenizer.segment(query.normalize('NFKC').toLowerCase())]
    .filter(({ isWordLike, segment }) => isWordLike && segment.length >= 2).map(({ segment }) => segment))].slice(0, 12)
  const matches = []
  for (const source of plan.sources) {
    if (source.status !== 'processed') continue
    const text = sourceText(source)
    for (const sentence of text.matchAll(/[^。！？\r\n]+[。！？]?/gu)) {
      const normalized = sentence[0].normalize('NFKC').toLowerCase()
      const hits = terms.filter((term) => normalized.includes(term))
      if (!hits.length) continue
      const focus = Math.max(0, sentence[0].toLowerCase().indexOf(hits[0]))
      const start = sentence.index + Math.max(0, focus - 30)
      const excerpt = text.slice(start, Math.min(sentence.index + sentence[0].length, start + 180)).trim()
      if (excerpt) matches.push({ evidenceId: `source:${source.sourceId}:${text.indexOf(excerpt, start)}`,
        sourceId: source.sourceId, excerpt, score: hits.length })
    }
  }
  return [...new Map(matches.sort((a, b) => b.score - a.score)
    .map(({ score, ...result }) => [result.evidenceId, result])).values()].slice(0, 4)
}

export function availableAgentEvidence(frame, receipts = []) {
  return new Set([
    ...frame.recentDays.flatMap(({ instances }) => instances.map(({ evidenceId }) => evidenceId)),
    ...frame.summaries.flatMap(({ latestPractice }) => latestPractice.map(({ evidenceId }) => evidenceId)),
    ...frame.messages.map(({ evidenceId }) => evidenceId), ...frame.sources.map(({ evidenceId }) => evidenceId),
    ...frame.adjustments.flatMap(({ receiptId, subsequentPractice, subsequentFeedback }) =>
      [receiptId, ...[...subsequentPractice, ...subsequentFeedback].map(({ evidenceId }) => evidenceId)]),
    ...frame.priorNotes.map(({ evidenceId }) => evidenceId),
    ...receipts.flatMap(({ sources }) => (sources ?? []).map(({ evidenceId }) => evidenceId)),
  ])
}

function hasNewFeedback(frame, decision, taskId, after, kinds) {
  return frame.messages.some((item) => decision.evidenceIds.includes(item.evidenceId) &&
    (item.clarificationId || item.feedback && (!kinds || kinds.includes(item.feedback.kind))) &&
    (item.taskId === taskId || item.taskId === null) && item.createdAt > after)
}

export function prepareAgentAction(session, frame, receipts, decision, actionId, now) {
  const evidence = availableAgentEvidence(frame, receipts)
  if (!decision.evidenceIds.every((id) => evidence.has(id))) return { code: 'unknown_evidence' }
  if (decision.type !== 'act') return { stop: decision.type }
  const action = decision.action
  const { type, params, taskId } = action
  if (!AGENT_ACTIONS.includes(type)) return { code: 'unknown_action' }
  if (type === 'KEEP_PLAN') return taskId === undefined && onlyKeys(params, []) ? { stop: 'finish', status: 'kept' } : { code: 'invalid_keep' }
  const plan = activeLearningPlan(session)
  if (type === 'SEARCH_SOURCES') {
    if (taskId !== undefined || !onlyKeys(params, ['query']) || !shortText(params.query, 120)) return { code: 'invalid_search' }
    return { status: 'searched', sources: searchSources(plan, params.query) }
  }
  if (!decision.evidenceIds.length) return { code: 'missing_evidence' }
  const target = plan.tasks.find(({ id }) => id === taskId)
  if (!target && (type !== 'CLARIFY' || taskId !== undefined)) return { code: 'unknown_task' }
  if (type === 'GUIDE' || type === 'CLARIFY') {
    const clarity = type === 'CLARIFY'
    const content = clarity
      ? onlyKeys(params, ['question']) && shortText(params.question, 140) && { text: params.question.trim() }
      : groundedStep(params, indexSourceEvidence(plan.sources))
    if (!content) return { code: 'invalid_note' }
    const prior = session.agent.notes.findLast((note) => note.taskId === (taskId ?? null) && note.type === type)
    const newPractice = frame.recentDays.some(({ instances }) => instances.some((item) =>
      item.taskId === taskId && (item.startedAt > prior?.createdAt || item.completedAt > prior?.createdAt)))
    const priorIsRelevant = prior && (normalization(prior.text) === normalization(content.text) ||
      !newPractice && !hasNewFeedback(frame, decision, taskId ?? null, prior.createdAt))
    const alreadySaid = clarity && session.messages.some(({ question }) => normalization(question) === normalization(content.text))
    if (priorIsRelevant || alreadySaid || receipts.some((receipt) => receipt.taskId === (taskId ?? null) &&
      receipt.status === (clarity ? 'asked' : 'published'))) return { code: 'already_provided' }
    const instanceId = session.days.at(-1).instances.find(({ task }) => task.id === taskId)?.id ?? null
    return { status: clarity ? 'asked' : 'published', waiting: clarity, note: { id: actionId, type,
      dayId: frame.dayId, taskId: taskId ?? null, instanceId, ...(target ? { taskTitle: target.title } : {}), ...content, createdAt: now },
    ...(clarity ? {} : { review: { ...content, target: { title: target.title, objective: target.objective } } }) }
  }

  if (planActions.has(type)) {
    const rejected = session.agent.changes.findLast((change) => change.status === 'rejected' &&
      equalAgentData(change.action, action))
    if (rejected && !hasNewFeedback(frame, decision, taskId, rejected.resolvedAt)) return { code: 'user_already_declined' }
    const alreadyPending = session.agent.changes.some((change) => change.status === 'pending' && change.dayId === frame.dayId &&
      equalAgentData(change.action, action))
    if (alreadyPending) return { code: 'already_pending' }
    const adjustment = frame.adjustments.findLast(({ taskIds, waitingForPractice }) => taskIds.includes(taskId) && waitingForPractice)
    if (adjustment && !(decision.exception && hasNewFeedback(frame, decision, taskId, adjustment.appliedAt, ['difficulty', 'time', 'direction']))) {
      return { code: 'awaiting_practice' }
    }
    const prepared = planChangeFor(session, action, actionId)
    if (prepared.code) return prepared
    const next = applyPlanDelta(session, prepared.delta)
    if (!next) return { code: 'invalid_dependencies' }
    const changes = prepared.delta.tasks
    const review = ['CHECK_MASTERY', 'DECOMPOSE_TASK', 'ADJUST_PRACTICE'].includes(type)
      ? { target: { title: target.title, objective: target.objective, completionCriteria: target.completionCriteria,
        steps: target.steps, estimatedMinutes: target.estimatedMinutes, sourceRefs: target.sourceRefs },
      updates: changes.map(({ after }) => ({ title: after.title, objective: after.objective, steps: after.steps,
        completionCriteria: after.completionCriteria, estimatedMinutes: after.estimatedMinutes, difficulty: after.practice?.difficulty,
        frequency: after.practice?.frequency, reviewAfter: after.practice?.reviewAfter })) }
      : null
    return { status: prepared.confirmation ? 'pendingConfirmation' : 'applied', waiting: prepared.confirmation,
      ...(review ? { review } : {}), change: { id: actionId, action, reason: decision.reason,
        taskIds: [...new Set([taskId, ...changes.map((change) => change.taskId)])], dayId: frame.dayId,
        status: prepared.confirmation ? 'pending' : 'applied', needsConfirmation: prepared.confirmation,
        proposedAt: now, appliedAt: prepared.confirmation ? null : now, delta: prepared.delta,
        ...(prepared.confirmation ? {} : { appliedRevision: session.revision + 1,
          dayEffects: appliedDayEffects(session, next, prepared.delta) }) }, next }
  }
  return { code: 'unknown_action' }
}

function pendingChangeIsCurrent(session, change) {
  if (session.days.at(-1).id !== change.dayId) return false
  const fresh = planChangeFor(session, change.action, change.id)
  return Boolean(fresh.delta && equalAgentData(fresh.delta, change.delta))
}

function changeHasLearningRecord(session, change) {
  return session.days.some(({ instances }) => instances.some(({ task, startedAt, completedAt }) =>
    change.taskIds.includes(task.id) && (startedAt !== null && startedAt >= change.appliedAt ||
      completedAt !== null && completedAt >= change.appliedAt))) ||
    session.messages.some(({ taskId, createdAt }) => change.taskIds.includes(taskId) && createdAt >= change.appliedAt)
}

export function agentChangeControls(session, change) {
  if (change.status === 'pending') {
    return pendingChangeIsCurrent(session, change)
      ? { status: 'pending', commands: ['accept', 'reject'] }
      : { status: 'expired', commands: [] }
  }
  if (change.status !== 'applied') return { status: change.status, commands: [] }
  if (change.restores || change.revertedBy) return { status: 'restored', commands: [] }
  if (!canReversePlanDelta(session, change.delta)) return { status: 'superseded', commands: [] }
  return { status: 'applied', commands: [changeHasLearningRecord(session, change) ? 'restore' : 'undo'] }
}

export function resolveAgentChange(session, id, command, now) {
  const change = session.agent?.changes.find((item) => item.id === id)
  if (!change || !Number.isFinite(now)) return session
  const day = session.days.at(-1)
  const replace = (patch, base = session, extra) => ({
    ...base, revision: session.revision + 1, agent: { ...base.agent,
      changes: [...session.agent.changes.map((item) => item === change ? { ...item, ...patch } : item), ...(extra ? [extra] : [])] },
  })
  if (change.status === 'pending') {
    if (command === 'reject') return replace({ status: 'rejected', resolvedAt: now })
    if (command !== 'accept' || !pendingChangeIsCurrent(session, change)) return session
    const activePractice = change.action.type === 'ADJUST_PRACTICE' ? change.action.taskId : undefined
    const next = applyPlanDelta(session, change.delta, activePractice)
    return next ? replace({ status: 'applied', resolvedAt: now, appliedAt: now, appliedRevision: session.revision + 1,
      dayEffects: appliedDayEffects(session, next, change.delta) }, next) : session
  }
  if (change.status !== 'applied' || change.revertedBy || change.restores || !['undo', 'restore'].includes(command)) return session
  const linked = changeHasLearningRecord(session, change)
  if (linked !== (command === 'restore')) return session
  const delta = reversePlanDelta(change.delta)
  const activePractice = change.action.type === 'ADJUST_PRACTICE' ? change.action.taskId : undefined
  const next = applyPlanDelta(session, delta, activePractice)
  if (!next) return session
  if (!linked) return replace({ status: 'undone', resolvedAt: now }, next)
  const reversal = { ...change, id: `restore:${change.id}`, action: { type: 'RESTORE', taskId: change.action.taskId, params: {} },
    reason: '恢复先前安排并保留学习记录', needsConfirmation: false, dayId: day.id, proposedAt: now, resolvedAt: now,
    appliedAt: now, appliedRevision: session.revision + 1, dayEffects: appliedDayEffects(session, next, delta),
    delta, restores: change.id }
  return replace({ revertedBy: reversal.id }, next, reversal)
}
