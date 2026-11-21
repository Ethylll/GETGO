import { useRef, useState } from 'react'
import { chatScopeKey, chatStatusText, isEvidenceAnswer, QUESTION_LIMIT, scopedChatTurns, taskChatHistory, validatedLearningFeedback } from './chatMessages.js'

export function useLearningChat(plan, initialMessages, shared) {
  const [localMessages, setLocalMessages] = useState(initialMessages ?? [])
  const messages = shared?.messages ?? localMessages
  const setMessages = shared?.updateMessages ?? setLocalMessages
  const [pendingKey, setPendingKey] = useState(null)
  const sending = useRef(false)

  async function sendQuestion(task, draft, context) {
    const question = draft.trim()
    if (sending.current || (!task && !context) || !question || question.length > QUESTION_LIMIT) return

    const taskId = task?.id ?? null
    const id = crypto.randomUUID()
    const sourceIds = task && [...new Set([
      ...(task.sourceRefs ?? []), ...task.steps.flatMap((step) => step.sourceRefs ?? []),
    ].map((ref) => ref.sourceId))]
    const history = taskChatHistory(scopedChatTurns(messages, taskId, context), taskId)
    const priorFeedback = context && messages.filter((turn) => turn.projectId === context.projectId &&
      turn.taskId === taskId && turn.feedback).slice(-4).map(({ taskId: owner, question, feedback }) => ({
        taskId: owner, question, ...feedback,
      }))
    sending.current = true
    setPendingKey(chatScopeKey(taskId, context))
    const createdAt = Date.now()
    const pending = { id, taskId, question, createdAt, status: 'pending', answer: '', citations: [], ...context }

    let result = { status: 'error', answer: '', citations: [] }
    try {
      const submitted = await setMessages((previous) => [...previous, pending], context)
      if (shared && !submitted?.messages.some((message) => message.id === id)) return
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question, topic: plan.topic, history,
          task: task ? { id: taskId, title: task.title, steps: task.steps.map(({ text }) => text), sourceIds } : null,
          ...(context ? { scope: task ? 'task' : 'project', observeLearning: true, priorFeedback } : {}),
          sources: plan.sources.map(({ sourceId, title, type, status, text, extractedText }) => ({ sourceId, title, type, status, text, extractedText })),
        }),
      })
      const reply = await response.json()
      if (response.ok && (isEvidenceAnswer(reply?.status) || reply?.status === 'insufficient') &&
        typeof reply.answer === 'string' && Array.isArray(reply.citations)) {
        result = { status: reply.status, answer: reply.answer, citations: reply.citations }
      } else if (!response.ok && reply?.status === 'error' && typeof reply.message === 'string') {
        result = { ...result, message: reply.message }
      }
      const feedback = context && validatedLearningFeedback(question, reply?.feedback)
      if (feedback) result.feedback = feedback
    } catch {
      result = { ...result, message: chatStatusText.error }
    } finally {
      await setMessages((previous) => previous.some((message) => message.id === id && ['pending', 'interrupted'].includes(message.status))
        ? previous.map((message) => message.id === id ? { ...message, ...result } : message) : previous, context, id)
      setPendingKey(null)
      sending.current = false
    }
  }

  return { messages, pendingKey, sendQuestion }
}
