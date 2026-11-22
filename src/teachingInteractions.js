import { QUESTION_LIMIT } from './chatMessages.js'

export function clarificationContext(session, note) {
  const day = session.days.find(({ id }) => id === note?.dayId)
  if (!day || note.type !== 'CLARIFY') return null
  const instance = day.instances.find(({ task }) => task.id === note.taskId)
  const instanceId = note.instanceId === undefined ? instance?.id ?? null : note.instanceId
  return { projectId: session.projectId, dayId: day.id, taskId: note.taskId ?? null, instanceId }
}

export function respondToClarification(session, { noteId, messageId, projectId, text, now }) {
  if (session.projectId !== projectId || !Number.isFinite(now)) return session
  const note = session.agent?.notes.find(({ id }) => id === noteId)
  const context = clarificationContext(session, note)
  if (!context || session.messages.some(({ clarificationId }) => clarificationId === noteId)) return session

  if (text === undefined) {
    if (note.ignoredAt !== undefined) return session
    const notes = session.agent.notes.map((item) => item === note ? { ...note, ignoredAt: now } : item)
    return { ...session, revision: session.revision + 1, agent: { ...session.agent, notes } }
  }

  const question = typeof text === 'string' && text.trim()
  if (!question || question.length > QUESTION_LIMIT || typeof messageId !== 'string' || !messageId ||
    session.messages.some(({ id }) => id === messageId)) return session
  const reply = { id: messageId, ...context, clarificationId: noteId, question, createdAt: Math.max(now, note.createdAt),
    createdRevision: session.revision + 1, submittedOnDayId: session.days.at(-1).id,
    status: 'clarification', answer: '', citations: [] }
  const notes = session.agent.notes.map((item) => item === note ? { ...note, instanceId: context.instanceId } : item)
  return { ...session, revision: session.revision + 1, messages: [...session.messages, reply], agent: { ...session.agent, notes } }
}

export function clarificationCards(session, currentDayId, chatDayId, chatTaskId, reviewing) {
  const replies = new Map(session.messages.filter(({ status }) => status === 'clarification')
    .map((message) => [message.clarificationId, message]))
  return (session.agent?.notes ?? []).filter((note) => note.type === 'CLARIFY' &&
    (!reviewing || note.dayId === chatDayId && note.taskId === chatTaskId))
    .map((note) => ({ ...note, reply: replies.get(note.id), deferred: note.ignoredAt !== undefined || note.dayId !== currentDayId }))
}
