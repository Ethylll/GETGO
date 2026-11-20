import { useEffect, useRef } from 'react'
import SourceImage from './SourceImage.jsx'
import { sourceText } from './learningSources.js'

export default function SourcesPanel({ sources, files, relatedTasks, selectedId, error, onOpen }) {
  const list = useRef(null)
  const selectedRow = useRef(null)

  useEffect(() => {
    const row = selectedRow.current
    const container = list.current
    if (!row || !container) return
    container.scrollTop += row.getBoundingClientRect().top - container.getBoundingClientRect().top
  }, [selectedId])

  return (
    <>
      {error && <p className="mb-2 text-error" role="alert">{error}</p>}
      {!sources.size && <p>本次没有可浏览的资料。</p>}
      <ul ref={list} className="max-h-[min(55vh,25rem)] space-y-2 overflow-y-auto overscroll-contain">
        {[...sources.values()].map((source) => {
          const isImage = source.type === 'image'
          const isSelected = selectedId === source.sourceId
          const text = sourceText(source)
          const characters = Array.from(text)
          const summary = characters.length > 40 ? `${characters.slice(0, 40).join('')}…` : text
          const tasks = relatedTasks.get(source.sourceId) ?? []

          return (
            <li key={source.sourceId} ref={isSelected ? selectedRow : undefined}>
              <button type="button" aria-haspopup="dialog" aria-current={isSelected ? 'true' : undefined} className={`flex w-full min-w-0 gap-2 rounded-xl border p-2 text-left ${isSelected ? 'border-line-strong bg-oat' : 'border-line hover:bg-oat'}`} onClick={(event) => onOpen({ sourceId: source.sourceId }, event.currentTarget)}>
                {isImage && (
                  <SourceImage file={files?.get(source.sourceId)} alt="" className="size-10 shrink-0 rounded-md bg-oat object-cover" fallback={<span aria-hidden="true" className="size-10 shrink-0 rounded-md bg-oat text-center leading-10">图</span>} />
                )}
                <span className="min-w-0 flex-1 space-y-1 wrap-anywhere">
                  <span className="block font-semibold text-ink">{source.title}</span>
                  <span className="block text-xs">{isImage ? '图片' : '文字'} · {source.status === 'processed' ? '处理成功' : '处理失败'}</span>
                  {summary && <span className="block text-xs">{isImage && '模拟提取内容 · '}{summary}</span>}
                  {source.error && <span className="block text-xs text-error">{source.error}</span>}
                  <span className="block text-xs">{tasks.length ? `关联任务 · ${tasks.map(({ title }) => title).join('、')}` : '无关联任务'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
