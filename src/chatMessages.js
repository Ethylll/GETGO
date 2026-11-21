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

export function taskChatHistory(messages, taskId) {
  return messages.filter((message) => message.taskId === taskId && isEvidenceAnswer(message.status)).slice(-4)
    .map(({ taskId, question, answer }) => ({ taskId, question, answer: answer.slice(0, 600) }))
}
