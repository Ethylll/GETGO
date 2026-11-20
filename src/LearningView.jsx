import { useEffect, useReducer, useRef, useState } from 'react'
import { adjacentTaskIds, createLearningProgress, updateLearningProgress } from './learningProgress.js'

const panels = [
  { id: 'route', label: '完整学习路线', icon: 'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01' },
  { id: 'sources', label: '学习资料', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z', placeholder: '完整资料浏览尚未接入。你可以从当前任务展开查看引用片段。' },
  { id: 'qa', label: 'AI 答疑', icon: 'M20 11a7 7 0 0 1-7 7H8l-4 3v-5a7 7 0 0 1-2-5V9a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6ZM7 10h.01M11 10h.01M15 10h.01', placeholder: 'AI 答疑尚未接入。' },
]

const taskStatus = {
  current: { label: '当前任务', color: 'bg-[#bd9a55]' },
  completed: { label: '已完成', color: 'bg-[#819677]' },
  pending: { label: '未完成', color: 'bg-[#ba8179]' },
}

const COMPLETE_CLICK_INTERVAL_MS = 500

function References({ references, sources, label }) {
  if (!references?.length) return null

  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="w-fit cursor-pointer rounded-md underline decoration-line-strong underline-offset-2 hover:text-accent">{label}</summary>
      <ul className="mt-2 space-y-2">
        {references.map(({ sourceId, excerpt }, index) => (
          <li key={index} className="rounded-lg border border-line px-3 py-2 wrap-anywhere">
            <p className="text-xs font-semibold">{sources.get(sourceId)?.title}</p>
            <blockquote className="mt-1 leading-relaxed whitespace-pre-wrap">{excerpt}</blockquote>
          </li>
        ))}
      </ul>
    </details>
  )
}

export default function LearningView({ plan }) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : []
  const [progress, dispatch] = useReducer(
    (state, action) => updateLearningProgress(tasks, state, action),
    { tasks, entryTaskId: plan.entryTaskId },
    createLearningProgress,
  )
  const [openPanel, setOpenPanel] = useState(null)
  const heading = useRef(null)
  const routeButton = useRef(null)
  const lastCompleteClick = useRef(-Infinity)
  const { currentTaskId, completedTaskIds, reviewTaskId } = progress
  const displayedTaskId = reviewTaskId ?? currentTaskId
  const task = tasks.find(({ id }) => id === displayedTaskId)
  const { previousTaskId, nextTaskId } = adjacentTaskIds(tasks, progress)
  const isReviewing = reviewTaskId !== null
  const reviewedStatus = completedTaskIds.includes(reviewTaskId) ? taskStatus.completed : taskStatus.pending
  const isComplete = tasks.length > 0 && completedTaskIds.length === tasks.length
  const sources = new Map((plan.sources ?? []).map((source) => [source.sourceId, source]))

  useEffect(() => {
    heading.current?.focus()
  }, [displayedTaskId])

  function completeTask(event, taskId) {
    const now = performance.now()
    if (event.detail > 1 || now - lastCompleteClick.current < COMPLETE_CLICK_INTERVAL_MS) return

    lastCompleteClick.current = now
    dispatch({ type: 'complete', taskId })
  }

  function reviewTask(taskId) {
    dispatch({ type: 'review', taskId })
    setOpenPanel(null)
  }

  return (
    <div className="mt-7 grid items-start gap-4 sm:mt-10 md:grid-cols-[3.5rem_minmax(0,1fr)] md:gap-5">
      <article className="min-w-0 rounded-[1.75rem] border border-line bg-paper px-5 py-8 sm:px-10 sm:py-12" aria-labelledby="current-task-heading">
        <div className="text-center">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-muted">
            <span>{plan.topic}</span>
            <span className="rounded-full bg-oat px-2.5 py-1 text-accent">{plan.mode === 'mock' ? 'Mock 模拟分析' : '资料分析结果'}</span>
          </div>
          {isReviewing && (
            <div className="mb-3 flex flex-wrap items-center justify-center gap-x-3 text-sm text-muted">
              <p>{reviewedStatus === taskStatus.completed ? '回看已完成任务' : '预览任务'}</p>
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-full px-2 pr-3 font-semibold text-accent hover:bg-oat" onClick={() => dispatch({ type: 'returnToCurrent' })}>
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-paper">
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m10 6-6 6 6 6M4 12h16" />
                  </svg>
                </span>
                {isComplete ? '返回完成页' : '返回当前任务'}
              </button>
            </div>
          )}
          <h1 id="current-task-heading" ref={heading} tabIndex={-1} className="text-[clamp(2rem,5.5vw,3.75rem)] leading-tight font-semibold wrap-anywhere">
            {task?.title ?? (isComplete ? '这次资料支持的任务已完成' : '当前没有可用的学习任务')}
          </h1>
          {task && <p className="mx-auto mt-4 max-w-prose leading-relaxed text-muted">{task.objective}</p>}
          {task && <p className="mt-2 text-xs leading-relaxed text-muted">资料支持范围 · {plan.supportedScope}</p>}
          {!task && isComplete && <p className="mt-4 text-sm text-muted">已完成 {completedTaskIds.length} / {tasks.length} 项</p>}
        </div>

        {task && <div key={task.id} className="mx-auto mt-7 max-w-xl sm:mt-9">
          <h2 className="mb-2 text-sm font-semibold">练习步骤</h2>
          <ol className="divide-y divide-line">
            {task.steps.map((step, index) => (
              <li key={index} className="flex gap-3 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-oat text-sm font-semibold text-accent" aria-hidden="true">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed">{step.text}</p>
                  <References references={step.sourceRefs} sources={sources} label="查看这一步的来源" />
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs leading-relaxed text-muted">
            <References references={task.sourceRefs} sources={sources} label="查看本任务的全部来源" />
            {plan.coverageGaps?.length > 0 && (
              <div>
                <p>内容缺口</p>
                <ul className="ml-4 list-disc">
                  {plan.coverageGaps.map((gap) => <li key={gap}>{gap}</li>)}
                </ul>
              </div>
            )}
            {plan.notices?.map((notice) => <p key={notice}>{notice}</p>)}
          </div>
        </div>}

        {task && (
          <div className="mx-auto mt-7 max-w-64 space-y-3 text-center">
            <div className="grid grid-cols-2 gap-3">
              <button type="button" className="secondary-button min-h-11 rounded-full px-3 text-sm font-semibold disabled:opacity-50" disabled={!previousTaskId} onClick={() => reviewTask(previousTaskId)}>
                上一步
              </button>
              <button type="button" className="secondary-button min-h-11 rounded-full px-3 text-sm font-semibold disabled:opacity-50" disabled={!nextTaskId} onClick={() => reviewTask(nextTaskId)}>
                下一步
              </button>
            </div>
            {isReviewing ? (
              <button type="button" disabled className={`min-h-11 rounded-full px-5 text-sm font-semibold text-ink ${reviewedStatus.color}`}>
                {reviewedStatus.label}
              </button>
            ) : (
              <button key={task.id} type="button" className="start-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={(event) => completeTask(event, task.id)} onKeyDown={(event) => {
                if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
              }}>
                完成，进入下一步
              </button>
            )}
          </div>
        )}
        {!task && isComplete && (
          <div className="mt-7 text-center">
            <button type="button" className="secondary-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={() => {
              setOpenPanel('route')
              routeButton.current?.focus()
            }}>
              回看学习路线
            </button>
          </div>
        )}
      </article>

      <aside className="relative z-10 order-first min-w-0" aria-label="学习工具">
        <div className="flex w-fit gap-1 rounded-2xl border border-line bg-paper p-1 md:flex-col">
          {panels.map(({ id, label, icon }) => (
            <button key={id} id={`panel-button-${id}`} ref={id === 'route' ? routeButton : undefined} type="button" aria-label={label} title={label} aria-expanded={openPanel === id} aria-controls={`panel-${id}`} className="grid size-11 place-items-center rounded-xl text-accent hover:bg-oat aria-expanded:bg-oat" onClick={() => setOpenPanel(openPanel === id ? null : id)}>
              <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
            </button>
          ))}
        </div>
        {panels.map(({ id, label, placeholder }) => (
          <div key={id} id={`panel-${id}`} hidden={openPanel !== id} role="region" aria-labelledby={`panel-button-${id}`} className="mt-2 rounded-2xl border border-line bg-paper p-4 text-sm leading-relaxed text-muted md:absolute md:top-0 md:left-full md:mt-0 md:ml-2 md:w-60 md:shadow-sm">
            <h2 className="mb-2 font-semibold text-ink">{label}</h2>
            {id === 'route' ? (
              <>
                <p className="mb-2 text-xs tabular-nums">已完成 {completedTaskIds.length} / {tasks.length} 项</p>
                <ol className="space-y-1">
                  {tasks.map(({ id: taskId, title }, index) => {
                    const isCurrent = taskId === currentTaskId
                    const isDone = completedTaskIds.includes(taskId)
                    const status = isCurrent ? taskStatus.current : isDone ? taskStatus.completed : taskStatus.pending

                    return (
                      <li key={taskId} aria-current={isCurrent ? 'step' : undefined} className="flex items-start gap-2 py-1">
                        <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${status.color}`} />
                        <button type="button" className="rounded text-left text-ink underline decoration-line-strong underline-offset-2 hover:text-accent" onClick={() => reviewTask(taskId)}>
                          {index + 1}. {title}<span className={isCurrent ? 'ml-2 text-xs font-semibold text-accent' : 'sr-only'}>{status.label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ol>
              </>
            ) : <p>{placeholder}</p>}
          </div>
        ))}
      </aside>
    </div>
  )
}
