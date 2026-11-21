import { useEffect, useRef, useState } from 'react'
import { chatStatusText, QUESTION_LIMIT } from './chatMessages.js'

function LearningQuestion({ note, onReply, onIgnore, busy }) {
  return (
    <div className="space-y-1.5 border-l-2 border-line-strong pl-3 wrap-anywhere">
      <p className="text-xs font-semibold text-accent">AI 老师的提问 · {note.taskTitle} · Day {note.dayNumber}</p>
      <p className="text-ink">{note.text}</p>
      {note.reply ? <p className="text-xs whitespace-pre-wrap">你的回复 · {note.reply.question}</p> : (
        <div className="flex flex-wrap items-center gap-x-3 text-xs">
          <button type="button" disabled={busy} className="min-h-10 font-semibold text-accent underline underline-offset-2"
            onClick={() => onReply(note.id)}>回答这个问题</button>
          {!note.deferred && <button type="button" disabled={busy} className="min-h-10 text-muted underline underline-offset-2"
            onClick={() => onIgnore(note.id)}>稍后再说</button>}
        </div>
      )}
    </div>
  )
}

export default function ChatPanel({ task, scopeKey = task?.id, dayNumber, canAsk, messages, pendingKey, sources,
  onSend, onOpenSource, visible, clarifications = [], onClarification }) {
  const [draft, setDraft] = useState('')
  const [replyDraft, setReplyDraft] = useState('')
  const [replyId, setReplyId] = useState(null)
  const [notice, setNotice] = useState('')
  const [savingReply, setSavingReply] = useState(false)
  const replyLock = useRef(false)
  const replyInput = useRef(null)
  const scrollArea = useRef(null)
  const turns = messages.filter(({ taskId, status }) => taskId === (task?.id ?? null) && status !== 'clarification')
  const replying = clarifications.find((note) => note.id === replyId && !note.reply)
  const activeQuestions = clarifications.filter(({ deferred }) => !deferred)
  const deferredQuestions = clarifications.filter(({ deferred }) => deferred)
  const lastTurn = turns.at(-1)

  useEffect(() => {
    if (visible && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight
  }, [lastTurn, visible])

  useEffect(() => {
    if (visible && replying) replyInput.current?.focus()
  }, [replying?.id, visible])

  function chooseReply(id) {
    if (id !== replyId) setReplyDraft('')
    setReplyId(id)
    setNotice('')
  }

  async function saveReply(id, text) {
    if (replyLock.current) return
    replyLock.current = true
    setSavingReply(true)
    const saved = await onClarification(id, text)
    if (saved && (id === replyId || text !== undefined)) {
      setReplyId(null)
      setReplyDraft('')
    }
    setNotice(saved ? text === undefined ? '已暂存，可稍后回答。' : '回复已保存。' : '操作未保存，请确认问题状态后再试。')
    replyLock.current = false
    setSavingReply(false)
  }

  if (!task && !dayNumber) return <p>请从学习路线选择一项任务，查看它的答疑记录。</p>

  return (
    <div className="space-y-3">
      <p className="wrap-anywhere">
        <span className="font-semibold text-ink">{task ? '讨论任务' : '项目答疑'}</span>
        {task && ` · ${task.title}`}{dayNumber && ` · Day ${dayNumber}`}
      </p>
      <p className="text-xs text-accent">DeepSeek · 基于本次学习资料</p>
      {!canAsk && <p className="text-xs">{dayNumber ? '正在回看答疑。返回今日学习后可以提问。' : '正在回看任务。返回当前任务后可以提问。'}</p>}
      {activeQuestions.map((note) => (
        <LearningQuestion key={note.id} note={note} busy={savingReply} onReply={chooseReply} onIgnore={saveReply} />
      ))}
      {deferredQuestions.length > 0 && <details>
        <summary className="w-fit cursor-pointer text-xs underline underline-offset-2">之前的学习问题</summary>
        <div className="mt-2 max-h-48 space-y-3 overflow-y-auto">
          {deferredQuestions.map((note) => <LearningQuestion key={note.id} note={note} busy={savingReply} onReply={chooseReply} onIgnore={saveReply} />)}
        </div>
      </details>}
      {notice && <p role="status" className="text-xs">{notice}</p>}
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
      {replying ? (
        <form className="space-y-2 border-t border-line pt-3" onSubmit={(event) => {
          event.preventDefault()
          if (replyDraft.trim() && !savingReply) void saveReply(replying.id, replyDraft)
        }}>
          <label htmlFor="clarification-reply" className="block text-xs font-semibold">你的回复</label>
          <p id="clarification-context" className="text-xs wrap-anywhere">{replying.text}</p>
          <textarea ref={replyInput} id="clarification-reply" aria-describedby="clarification-context" value={replyDraft}
            onChange={(event) => setReplyDraft(event.target.value)} maxLength={QUESTION_LIMIT} rows={2}
            className="w-full resize-y rounded-xl border border-line bg-sheet px-3 py-2 text-sm text-ink" />
          <p className="text-xs">回复将保存，并发送给 DeepSeek 用于了解你的学习情况。</p>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={!replyDraft.trim() || savingReply} className="start-button min-h-10 rounded-full px-4 text-sm font-semibold">
              {savingReply ? '保存中…' : '提交回复'}
            </button>
            <button type="button" onClick={() => setReplyId(null)} disabled={savingReply} className="secondary-button min-h-10 rounded-full px-4 text-sm">取消</button>
          </div>
        </form>
      ) : canAsk && (
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
