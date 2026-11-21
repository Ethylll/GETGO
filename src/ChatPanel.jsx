import { useEffect, useRef, useState } from 'react'
import { chatStatusText, QUESTION_LIMIT } from './chatMessages.js'

export default function ChatPanel({ task, scopeKey = task?.id, dayNumber, canAsk, messages, pendingKey, sources, onSend, onOpenSource, visible }) {
  const [draft, setDraft] = useState('')
  const scrollArea = useRef(null)
  const turns = messages.filter(({ taskId }) => taskId === (task?.id ?? null))
  const lastTurn = turns.at(-1)

  useEffect(() => {
    if (visible && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight
  }, [lastTurn, visible])

  if (!task && !dayNumber) return <p>请从学习路线选择一项任务，查看它的答疑记录。</p>

  return (
    <div className="space-y-3">
      <p className="wrap-anywhere">
        <span className="font-semibold text-ink">{task ? '讨论任务' : '项目答疑'}</span>
        {task && ` · ${task.title}`}{dayNumber && ` · Day ${dayNumber}`}
      </p>
      <p className="text-xs text-accent">DeepSeek · 基于本次学习资料</p>
      {!canAsk && <p className="text-xs">{dayNumber ? '正在回看答疑。返回今日学习后可以提问。' : '正在回看任务。返回当前任务后可以提问。'}</p>}
      <div ref={scrollArea} role="log" aria-label="答疑记录" className="max-h-[min(42dvh,22rem)] space-y-3 overflow-y-auto overscroll-contain">
        {!turns.length && <p className="text-xs">{task ? '这项任务暂无答疑记录。' : '本学习日暂无项目答疑。'}</p>}
        {turns.map(({ id, question, answer, status, citations, message }) => (
          <div key={id} className="space-y-2 wrap-anywhere">
            <p className="rounded-xl bg-oat px-3 py-2 whitespace-pre-wrap text-ink">{question}</p>
            <div className="space-y-1 px-1">
              {status === 'pending' && <p role="status">正在查阅资料…</p>}
              {answer && <p className="whitespace-pre-wrap text-ink">{answer}</p>}
              {(message || chatStatusText[status]) && <p className={status === 'error' ? 'text-error' : 'text-xs'}>{message || chatStatusText[status]}</p>}
              {citations.map((citation, index) => (
                <button key={`${citation.sourceId}-${index}`} type="button" className="block min-h-8 text-left text-xs text-accent underline underline-offset-2" aria-haspopup="dialog" onClick={(event) => onOpenSource(citation, event.currentTarget)}>
                  {sources.get(citation.sourceId)?.title ?? '查看来源'} · {citation.excerpt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {canAsk && (
        <form className="space-y-2 border-t border-line pt-3" onSubmit={(event) => {
          event.preventDefault()
          if (!draft.trim() || pendingKey) return
          onSend(task, draft)
          setDraft('')
        }}>
          <label htmlFor="chat-question" className="block text-xs font-semibold">你的问题</label>
          <textarea id="chat-question" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={QUESTION_LIMIT} rows={2} className="w-full resize-y rounded-xl border border-line bg-sheet px-3 py-2 text-sm text-ink" />
          <p className="text-xs">问题和相关资料片段会发送给 DeepSeek。</p>
          {pendingKey && pendingKey !== scopeKey && <p role="status" className="text-xs">正在回复另一段对话的问题，请稍候。</p>}
          <button type="submit" disabled={!draft.trim() || Boolean(pendingKey)} className="start-button min-h-10 rounded-full px-4 text-sm font-semibold">
            {pendingKey === scopeKey ? '发送中…' : '发送'}
          </button>
        </form>
      )}
    </div>
  )
}
