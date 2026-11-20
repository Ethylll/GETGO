import { useEffect, useState } from 'react'
import { MAX_MATERIALS } from './materials.js'

const COLLAPSED_LIMIT = 4
const SUMMARY_LENGTH = 40

function summarize(text) {
  const characters = Array.from(text)
  if (characters.length <= SUMMARY_LENGTH) return text
  return `${characters.slice(0, SUMMARY_LENGTH).join('')}…`
}

function Thumbnail({ file }) {
  const [url, setUrl] = useState('')

  useEffect(() => {
    const preview = URL.createObjectURL(file)
    setUrl(preview)
    return () => URL.revokeObjectURL(preview)
  }, [file])

  return (
    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-oat text-muted">
      {url && <img src={url} alt="" className="size-full object-cover" />}
    </span>
  )
}

export default function MaterialList({ materials, onRemove, disabled }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hiddenCount = materials.length - COLLAPSED_LIMIT
  const visibleMaterials = isExpanded ? materials : materials.slice(0, COLLAPSED_LIMIT)
  let textNumber = 0

  function removeMaterial(id) {
    if (materials.length === COLLAPSED_LIMIT + 1) setIsExpanded(false)
    onRemove(id)
  }

  return (
    <section className="border-t border-line px-5 py-5 sm:px-8" aria-labelledby="materials-heading">
      <div className="mb-1 flex items-center gap-3">
        <p className="rounded-full bg-oat px-3 py-1 text-sm font-medium text-muted tabular-nums" role="status" aria-label={`已添加 ${materials.length} 份，最多 ${MAX_MATERIALS} 份`}>
          {materials.length}/{MAX_MATERIALS}
        </p>
        <h3 id="materials-heading" className="text-sm font-semibold">已添加资料</h3>
      </div>
      <ul id="material-items" className="divide-y divide-line">
        {visibleMaterials.map((material) => {
          const isText = material.type === 'text'
          const name = isText ? `文字资料 ${++textNumber}` : material.name || '图片资料'

          return (
            <li key={material.id} className="flex min-w-0 items-center gap-3 py-3 last:pb-0">
              {isText ? (
                <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-oat text-lg font-semibold text-muted" aria-hidden="true">文</span>
              ) : <Thumbnail file={material.file} />}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" title={name}>{name}</p>
                {isText && <p className="text-sm wrap-anywhere text-muted">{summarize(material.text)}</p>}
                <p className="mt-0.5 text-xs text-muted">{isText ? '文字' : '图片'} · 已添加</p>
              </div>
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-muted hover:bg-oat hover:text-ink disabled:opacity-60"
                aria-label={`删除 ${name}`}
                disabled={disabled}
                onClick={() => removeMaterial(material.id)}
              >
                删除
              </button>
            </li>
          )
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="mt-3 min-h-11 rounded-lg px-3 text-sm font-semibold text-accent hover:bg-oat"
          aria-expanded={isExpanded}
          aria-controls="material-items"
          onClick={() => setIsExpanded((expanded) => !expanded)}
        >
          {isExpanded ? '收起资料列表 ↑' : `展开其余 ${hiddenCount}份资料 ↓`}
        </button>
      )}
    </section>
  )
}
