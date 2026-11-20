import { useLayoutEffect, useRef } from 'react'
import SourceImage from './SourceImage.jsx'
import { sourceText } from './learningSources.js'

export default function SourceDialog({ selection, file, onDismiss, imageUnavailableMessage = '原图当前不可用。' }) {
  const dialog = useRef(null)
  const content = useRef(null)
  const highlight = useRef(null)
  const { source, range, status } = selection
  const isImage = source.type === 'image'
  const text = sourceText(source)

  function scrollToExcerpt() {
    const mark = highlight.current
    const container = content.current
    if (!mark || !container) return
    container.scrollTop += mark.getBoundingClientRect().top - container.getBoundingClientRect().top - 16
  }

  useLayoutEffect(() => {
    if (!dialog.current.open) dialog.current.showModal()
    scrollToExcerpt()
  }, [selection])

  return (
    <dialog ref={dialog} aria-labelledby="source-dialog-title" className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-2xl border border-line bg-paper p-0 text-ink backdrop:bg-ink/30" onCancel={(event) => {
      event.preventDefault()
      onDismiss()
    }}>
      <div className="flex max-h-[85dvh] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <div className="min-w-0 wrap-anywhere">
            <h2 id="source-dialog-title" className="text-lg font-semibold">{source.title}</h2>
            <p className="text-sm text-muted">{isImage ? '图片' : '文字'} · {source.status === 'processed' ? '处理成功' : '处理失败'}</p>
          </div>
          <button type="button" className="secondary-button min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold" onClick={onDismiss}>关闭</button>
        </header>

        <div ref={content} tabIndex={0} aria-label="资料内容" className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {source.error && <p className="text-sm leading-relaxed text-error">{source.error}</p>}
          {status === 'excerptMissing' && <p role="status" className="rounded-lg bg-oat px-3 py-2 text-sm text-accent">未能定位到引用片段。</p>}
          {isImage && (
            <SourceImage file={file} alt={source.title} className="mx-auto max-h-[55dvh] max-w-full rounded-lg object-contain" onLoad={scrollToExcerpt} fallback={<p className="text-sm text-muted">{imageUnavailableMessage}</p>} />
          )}
          {text ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold">{isImage ? '模拟提取内容' : '原文'}</h3>
              <p className="leading-relaxed whitespace-pre-wrap wrap-anywhere">
                {range ? (
                  <>
                    {text.slice(0, range.start)}
                    <mark ref={highlight} className="rounded-sm bg-[#ebd499] text-ink">{text.slice(range.start, range.end)}</mark>
                    {text.slice(range.end)}
                  </>
                ) : text}
              </p>
            </section>
          ) : <p className="text-sm text-muted">{isImage ? '暂无提取内容。' : '暂无可查看的原文。'}</p>}
        </div>
      </div>
    </dialog>
  )
}
