import assert from 'node:assert/strict'
import test from 'node:test'
import { locateSourceReference, relatedTasksBySource, sourceText } from '../src/learningSources.js'

const text = { sourceId: 'src_2', type: 'text', status: 'processed', text: '前言。练习片段。正文。练习片段。结尾。' }
const image = { sourceId: 'src_7', type: 'image', status: 'processed', extractedText: '起点。模拟提取。' }
const failed = { sourceId: 'src_8', type: 'image', status: 'failed', error: '无法识别图片' }
const sources = new Map([text, image, failed].map((source) => [source.sourceId, source]))

test('保存原文或提取内容的完整字符串，保留失败来源', () => {
  assert.equal(sourceText(text), text.text)
  assert.equal(sourceText(image), image.extractedText)
  assert.equal(sourceText(failed), '')
  assert.deepEqual(locateSourceReference(sources, { sourceId: failed.sourceId }), { status: 'sourceOnly', source: failed })
})

test('引用从指定资料定位首个精确匹配，图片引用使用提取文字', () => {
  assert.deepEqual(locateSourceReference(sources, { sourceId: text.sourceId, excerpt: '练习片段' }), {
    status: 'located', source: text, range: { start: 3, end: 7 },
  })
  assert.deepEqual(locateSourceReference(sources, { sourceId: image.sourceId, excerpt: '模拟提取' }), {
    status: 'located', source: image, range: { start: 3, end: 7 },
  })
})

test('区分找不到片段与来源不存在，保持正确资料', () => {
  assert.deepEqual(locateSourceReference(sources, { sourceId: text.sourceId, excerpt: image.extractedText }), {
    status: 'excerptMissing', source: text,
  })
  assert.deepEqual(locateSourceReference(sources, { sourceId: failed.sourceId, excerpt: '不存在的内容' }), {
    status: 'excerptMissing', source: failed,
  })
  assert.deepEqual(locateSourceReference(sources, { sourceId: 'src_99', excerpt: '练习片段' }), { status: 'sourceMissing' })
})

test('从任务级及步骤级引用推导关联，去重并保留路线顺序', () => {
  const ref = (source) => ({ sourceId: source.sourceId, excerpt: '片段' })
  const route = [
    { id: 'task-b', title: '第一项', sourceRefs: [ref(text), ref(text)], steps: [{ sourceRefs: [ref(text), ref(image)] }] },
    { id: 'task-a', title: '第二项', sourceRefs: [ref(text)], steps: [{ sourceRefs: [ref(image)] }, {}] },
    { id: 'task-c', title: '第三项', steps: [{ sourceRefs: [ref(image)] }] },
  ]

  const related = relatedTasksBySource(route)
  assert.deepEqual(related.get(text.sourceId), [{ id: 'task-b', title: '第一项' }, { id: 'task-a', title: '第二项' }])
  assert.deepEqual(related.get(image.sourceId)?.map(({ id }) => id), ['task-b', 'task-a', 'task-c'])
  assert.equal(related.has(failed.sourceId), false)
})
