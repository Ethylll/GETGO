import { useRef, useState } from 'react'
import ChatPanel from './ChatPanel.jsx'
import SourceDialog from './SourceDialog.jsx'
import SourcesPanel from './SourcesPanel.jsx'
import { locateSourceReference, relatedTasksBySource } from './learningSources.js'

const panels = [
  { id: 'route', label: '完整学习路线', icon: 'M9 5h11M9 12h11M9 19h11M4 5h.01M4 12h.01M4 19h.01' },
  { id: 'sources', label: '学习资料', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z' },
  { id: 'qa', label: 'AI 答疑', icon: 'M20 11a7 7 0 0 1-7 7H8l-4 3v-5a7 7 0 0 1-2-5V9a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6ZM7 10h.01M11 10h.01M15 10h.01' },
]

export function References({ references, sources, label, onOpen }) {
  if (!references?.length) return null

  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="w-fit cursor-pointer rounded-md underline decoration-line-strong underline-offset-2 hover:text-accent">{label}</summary>
      <ul className="mt-2 space-y-2">
        {references.map((reference, index) => (
          <li key={index}>
            <button type="button" aria-haspopup="dialog" className="block w-full rounded-lg border border-line px-3 py-2 text-left wrap-anywhere hover:bg-oat" onClick={(event) => onOpen(reference, event.currentTarget)}>
              <span className="block font-semibold text-accent underline underline-offset-2">{sources.get(reference.sourceId)?.title ?? '查看引用来源'}</span>
              <span className="mt-1 block leading-relaxed whitespace-pre-wrap">{reference.excerpt}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}

export function LearningSteps({ task, sources, onOpen }) {
  return (
    <ol className="divide-y divide-line">
      {task.steps.map((step, index) => (
        <li key={index} className="flex gap-3 py-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-oat text-sm font-semibold text-accent" aria-hidden="true">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="leading-relaxed">{step.text}</p>
            <References references={step.sourceRefs} sources={sources} label="查看这一步的来源" onOpen={onOpen} />
          </div>
        </li>
      ))}
    </ol>
  )
}

export function useLearningTools(plan) {
  const [openPanel, setOpenPanel] = useState(null)
  const [selectedSourceId, setSelectedSourceId] = useState(null)
  const [sourcePreview, setSourcePreview] = useState(null)
  const [sourceError, setSourceError] = useState('')
  const routeButton = useRef(null)
  const sourcesButton = useRef(null)
  const sourceTrigger = useRef(null)
  const sources = new Map((plan.sources ?? []).map((source) => [source.sourceId, source]))

  function openSource(reference, trigger) {
    const selection = locateSourceReference(sources, reference)
    setOpenPanel('sources')

    if (selection.status === 'sourceMissing') {
      setSelectedSourceId(null)
      setSourceError('找不到对应资料。')
      return
    }

    sourceTrigger.current = trigger
    setSelectedSourceId(selection.source.sourceId)
    setSourceError('')
    setSourcePreview(selection)
  }

  function dismissSource() {
    setSourcePreview(null)
    const trigger = sourceTrigger.current
    requestAnimationFrame(() => {
      const target = trigger?.isConnected && trigger.getClientRects().length ? trigger : sourcesButton.current
      target?.focus({ preventScroll: true })
    })
  }

  return { openPanel, setOpenPanel, selectedSourceId, sourcePreview, sourceError, routeButton, sourcesButton, sources, openSource, dismissSource }
}

export default function LearningTools({ tools, plan, sourceFiles, isRestored, route, chat }) {
  const { openPanel, setOpenPanel, selectedSourceId, sourcePreview, sourceError, routeButton, sourcesButton, sources, openSource, dismissSource } = tools
  const relatedTasks = relatedTasksBySource(plan.tasks)
  const imageUnavailableMessage = isRestored ? '原图暂时无法恢复。' : '原图当前不可用。'
  return (
    <>
      <aside className="relative z-10 order-first min-w-0" aria-label="学习工具">
        <div className="flex w-fit gap-1 rounded-2xl border border-line bg-paper p-1 md:flex-col">
          {panels.map(({ id, label, icon }) => (
            <button key={id} id={`panel-button-${id}`} ref={id === 'route' ? routeButton : id === 'sources' ? sourcesButton : undefined} type="button" aria-label={label} title={label} aria-expanded={openPanel === id} aria-controls={`panel-${id}`} className="grid size-11 place-items-center rounded-xl text-accent hover:bg-oat aria-expanded:bg-oat" onClick={() => setOpenPanel(openPanel === id ? null : id)}>
              <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d={icon} />
              </svg>
            </button>
          ))}
        </div>
        {panels.map(({ id, label }) => (
          <div key={id} id={`panel-${id}`} hidden={openPanel !== id} role="region" aria-labelledby={`panel-button-${id}`} className={`mt-2 rounded-2xl border border-line bg-paper p-4 text-sm leading-relaxed text-muted md:absolute md:top-0 md:left-full md:mt-0 md:ml-2 md:shadow-sm ${id !== 'route' ? 'md:w-80' : plan.planVersion === 2 ? 'md:w-72' : 'md:w-60'}`}>
            <h2 className="mb-2 font-semibold text-ink">{label}</h2>
            {id === 'route' ? route : id === 'sources' ? (
              openPanel === id && <SourcesPanel sources={sources} files={sourceFiles} relatedTasks={relatedTasks} selectedId={selectedSourceId} error={sourceError} onOpen={openSource} mock={plan.mode === 'mock'} imageUnavailableMessage={imageUnavailableMessage} />
            ) : <ChatPanel key={chat.scopeKey ?? chat.task?.id ?? 'no-task'} {...chat} sources={sources} onOpenSource={openSource} visible={openPanel === id} />}
          </div>
        ))}
      </aside>
      {sourcePreview && <SourceDialog selection={sourcePreview} file={sourceFiles?.get(sourcePreview.source.sourceId)} onDismiss={dismissSource} mock={plan.mode === 'mock'} imageUnavailableMessage={imageUnavailableMessage} />}
    </>
  )
}
