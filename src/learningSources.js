export function sourceText(source) {
  const text = source.type === 'image' ? source.extractedText : source.text
  return typeof text === 'string' && text.trim() ? text : ''
}

export function relatedTasksBySource(tasks) {
  const index = new Map()

  for (const task of tasks) {
    const references = [...(task.sourceRefs ?? []), ...(task.steps ?? []).flatMap((step) => step.sourceRefs ?? [])]
    const sourceIds = new Set(references.map(({ sourceId }) => sourceId))

    for (const sourceId of sourceIds) {
      if (!index.has(sourceId)) index.set(sourceId, [])
      index.get(sourceId).push({ id: task.id, title: task.title })
    }
  }

  return index
}

export function locateSourceReference(sources, { sourceId, excerpt }) {
  const source = sources.get(sourceId)
  if (!source) return { status: 'sourceMissing' }
  if (!excerpt) return { status: 'sourceOnly', source }

  const start = sourceText(source).indexOf(excerpt)
  return start === -1
    ? { status: 'excerptMissing', source }
    : { status: 'located', source, range: { start, end: start + excerpt.length } }
}
