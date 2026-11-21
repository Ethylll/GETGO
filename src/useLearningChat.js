import { useRef, useState } from 'react'
import { chatStatusText, isEvidenceAnswer, QUESTION_LIMIT, taskChatHistory } from './chatMessages.js'

export function useLearningChat(plan, initialMessages, shared) {
  const [localMessages, setLocalMessages] = useState(initialMessages ?? [])
  const messages = shared?.messages ?? localMessages
  const setMessages = shared?.updateMessages ?? setLocalMessages
  const [pendingTaskId, setPendingTaskId] = useState(null)
  const sending = useRef(false)

  async function sendQuestion(task, draft, context) {
    const question = draft.trim()
    if (sending.current || !task || !question || question.length > QUESTION_LIMIT) return

    const taskId = task.id
    const id = crypto.randomUUID()
    const sourceIds = [...new Set([
      ...(task.sourceRefs ?? []), ...task.steps.flatMap((step) => step.sourceRefs ?? []),
    ].map((ref) => ref.sourceId))]
    const history = taskChatHistory(messages, taskId)
    sending.current = true
    setPendingTaskId(taskId)
    const createdAt = Date.now()
    setMessages((previous) => [...previous, { id, taskId, question, createdAt, status: 'pending', answer: '', citations: [], ...context }])

    let result = { status: 'error', answer: '', citations: [] }
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question, topic: plan.topic, history,
          task: { id: taskId, title: task.title, steps: task.steps.map(({ text }) => text), sourceIds },
          sources: plan.sources.map(({ sourceId, title, type, status, text, extractedText }) => ({ sourceId, title, type, status, text, extractedText })),
        }),
      })
      const reply = await response.json()
      if (response.ok && (isEvidenceAnswer(reply.status) || reply.status === 'insufficient') &&
        typeof reply.answer === 'string' && Array.isArray(reply.citations)) {
        result = { status: reply.status, answer: reply.answer, citations: reply.citations }
      } else if (!response.ok && reply?.status === 'error' && typeof reply.message === 'string') {
        result = { ...result, message: reply.message }
      }
    } catch {
      result = { ...result, message: chatStatusText.error }
    } finally {
      setMessages((previous) => previous.map((message) => message.id === id ? { ...message, ...result } : message))
      setPendingTaskId(null)
      sending.current = false
    }
  }

  return { messages, pendingTaskId, sendQuestion }
}
