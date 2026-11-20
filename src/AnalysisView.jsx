import { useEffect, useRef, useState } from 'react'

const stages = [
  ['reading', '正在读取学习资料'],
  ['identifying', '正在识别学习主题'],
  ['organizing', '正在整理知识点与学习顺序'],
  ['generating', '正在生成第一项学习任务'],
]

const titles = {
  processing: '正在分析学习资料',
  confirmation: '仅使用已读取的资料继续吗？',
  clarification: '需要确认一下学习主题',
  unavailable: '暂时无法生成学习路线',
}

function SourceStatuses({ sources }) {
  const processed = sources.filter((source) => source.status === 'processed')
  const failed = sources.filter((source) => source.status === 'failed')
  if (!failed.length) return null

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[
        { title: '读取成功', items: processed },
        { title: '读取失败', items: failed },
      ].map(({ title, items }) => (
        <section key={title} className="min-w-0 rounded-2xl bg-oat px-4 py-4">
          <h2 className="text-sm font-semibold">{title} · {items.length} 份</h2>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed wrap-anywhere text-muted">
            {items.map((source) => (
              <li key={source.sourceId}>
                {source.title}
                {source.error && <p className="text-error">{source.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function AnalysisView({ analysis, onConfirm, onClarify, onBack }) {
  const { phase, stage, result } = analysis
  const [answer, setAnswer] = useState('')
  const heading = useRef(null)

  useEffect(() => {
    heading.current.focus()
  }, [phase])

  const activeStage = stages.findIndex(([id]) => id === stage)

  return (
    <section className="mx-auto mt-8 max-w-2xl rounded-[1.75rem] border border-line bg-paper px-5 py-6 sm:mt-14 sm:p-9" aria-labelledby="analysis-heading">
      <p className="mb-3 text-sm font-medium text-accent">Mock 模拟分析</p>
      <h1 id="analysis-heading" ref={heading} tabIndex={-1} className="mb-5 text-2xl leading-tight font-semibold sm:text-3xl">
        {titles[phase]}
      </h1>

      {phase === 'processing' && (
        <>
          <p role="status" className="sr-only">{stages[activeStage]?.[1]}</p>
          <ol aria-label="分析阶段" className="space-y-2">
            {stages.map(([id, label], index) => (
              <li key={id} aria-current={index === activeStage ? 'step' : undefined} className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${index === activeStage ? 'bg-oat font-semibold text-ink' : 'text-muted'}`}>
                <span>{label}</span>
                <span className="shrink-0 text-xs">{index < activeStage ? '已完成' : index === activeStage ? '进行中' : '待处理'}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {(phase === 'confirmation' || phase === 'unavailable') && (
        <div className="space-y-4">
          {phase === 'unavailable' && <p role="alert" className="leading-relaxed text-error">{result.message}</p>}
          {result.notices?.map((notice) => <p key={notice} className="text-sm leading-relaxed text-muted">{notice}</p>)}
          <SourceStatuses sources={result.sources ?? []} />
          <div className="flex flex-wrap gap-3">
            {phase === 'confirmation' && (
              <button type="button" className="start-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={onConfirm}>
                仅使用成功资料继续
              </button>
            )}
            <button type="button" className="secondary-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={onBack}>
              返回资料导入
            </button>
          </div>
        </div>
      )}

      {phase === 'clarification' && (
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault()
          if (answer.trim()) onClarify(answer.trim())
        }}>
          <label htmlFor="analysis-answer" className="block leading-relaxed">{result.question}</label>
          <input id="analysis-answer" type="text" className="w-full rounded-xl border border-line bg-sheet px-4 py-3 text-base" value={answer} onChange={(event) => setAnswer(event.target.value)} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" className="start-button min-h-11 rounded-full px-5 text-sm font-semibold" disabled={!answer.trim()}>
              提交回答
            </button>
            <button type="button" className="secondary-button min-h-11 rounded-full px-5 text-sm font-semibold" onClick={onBack}>
              返回资料导入
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
