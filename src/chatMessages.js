export const QUESTION_LIMIT = 600
export const ANSWER_LIMIT = 1200
export const CITATION_LIMIT = 12

export const chatStatusText = {
  insufficient: '在你提供的资料中没有找到足够依据，因此无法可靠回答这个问题。',
  partial: '资料只能支持问题的一部分，其余内容缺少可靠依据。',
  conflict: '这些资料的说法存在冲突，无法据此给出统一结论。',
  interrupted: '这次回复未完成，可以重新发送问题。',
  error: '答疑暂时不可用，请稍后重试。',
}

export const isEvidenceAnswer = (status) => ['answered', 'partial', 'conflict'].includes(status)

export function validatedLearningFeedback(question, feedback) {
  const excerpt = feedback?.excerpt
  if (!['difficulty', 'time', 'direction', 'selfAssessment'].includes(feedback?.kind) ||
    typeof excerpt !== 'string' || excerpt.length < 2 || excerpt.length > 180 ||
    excerpt.trim() !== excerpt || !question.includes(excerpt)) return null
  return { kind: feedback.kind, excerpt }
}

export function chatScopeKey(taskId, context) {
  return context ? context.instanceId ?? context.dayId : taskId
}

export function scopedChatTurns(messages, taskId, context) {
  return messages.filter((message) => message.taskId === taskId && (!context ||
    message.projectId === context.projectId && message.dayId === context.dayId &&
    (message.instanceId ?? null) === (context.instanceId ?? null)))
}

export function updateScopedChatMessages(session, context, update) {
  if (session.projectId !== context.projectId || !session.days.some(({ id, instances }) => id === context.dayId &&
    (context.instanceId === null || instances.some((item) => item.id === context.instanceId)))) return session
  const messages = update(session.messages)
  if (messages === session.messages) return session
  const ids = new Set(session.messages.map(({ id }) => id))
  const revision = session.revision + 1
  return { ...session, revision, messages: messages.map((turn) => ids.has(turn.id) ? turn : { ...turn, createdRevision: revision }) }
}

export function taskChatHistory(messages, taskId) {
  return messages.filter((message) => message.taskId === taskId && isEvidenceAnswer(message.status)).slice(-4)
    .map(({ taskId, question, answer }) => ({ taskId, question, answer: answer.slice(0, 600) }))
}
