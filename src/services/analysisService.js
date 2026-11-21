import { isValidLearningPlan } from './validateLearningPlan.js'

const imageLimit = 4 * 1024 * 1024
const textLimit = 60_000
const unavailable = (sources, message, details = {}) => ({
  status: 'unavailable', mode: 'real', sources, notices: [], message, ...details,
})

async function imageForUpload(file, title) {
  const mime = file.type || ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' })[title.split('.').at(-1).toLowerCase()]
  if (file.size <= imageLimit) return file.type ? file : file.slice(0, file.size, mime)

  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { alpha: false })
    for (const maxSide of [2800, 2000, 1400]) {
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
      if (blob?.size && blob.size <= imageLimit) return blob
    }
    throw new Error('图片无法压缩到服务允许的大小。')
  } finally {
    bitmap.close()
  }
}

export function createAnalysisService({ fetchImpl = (...args) => fetch(...args) } = {}) {
  async function send(data) {
    const multipart = data instanceof FormData
    const reply = await fetchImpl('/api/analysis', {
      method: 'POST',
      ...(multipart ? { body: data } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    })
    return reply.json()
  }

  async function readSource({ sourceId, title, type, text, file }) {
    const source = { sourceId, title, type }
    if (type === 'text') return typeof text === 'string' && text.trim()
      ? { ...source, status: 'processed', text }
      : { ...source, status: 'failed', text, error: '这份文字资料没有可用内容。' }

    let image
    try {
      image = await imageForUpload(file, title)
    } catch {
      return { ...source, status: 'failed', error: '无法准备识别用图片，请检查文件是否损坏或过大。' }
    }
    const data = new FormData()
    data.set('sourceId', sourceId)
    data.set('title', title)
    data.set('image', image, title)
    try {
      const result = await send(data)
      if (result.sourceId === sourceId && result.status === 'processed' &&
        typeof result.extractedText === 'string' && result.extractedText.trim()) {
        return { ...source, status: 'processed', extractedText: result.extractedText }
      }
      return { ...source, status: 'failed', error: result.error || result.message || '未得到可用的图片识别结果。' }
    } catch {
      return { ...source, status: 'failed', error: '图片识别请求未完成，请检查网络后重试。' }
    }
  }

  async function readSources({ sources = [] } = {}) {
    const ids = sources.map(({ sourceId }) => sourceId)
    if (sources.length > 10 || ids.some((id) => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
      return unavailable([], '资料数量或资料 ID 无效，无法读取本批资料。')
    }
    const result = []
    for (let index = 0; index < sources.length; index += 3) {
      result.push(...await Promise.all(sources.slice(index, index + 3).map(readSource)))
    }
    const count = result.filter(({ status }) => status === 'processed').length
    if (!count) return unavailable(result, '现有资料不足，无法生成可靠的学习计划。')
    return { status: 'ready', mode: 'real', sources: result, notices: [], requiresConfirmation: count < result.length }
  }

  async function planLearning({ sources = [], confirmPartial, clarification, onStage, planVersion = 1 } = {}) {
    const usable = sources.filter(({ status }) => status === 'processed')
    if (!usable.length) return unavailable(sources, '现有资料不足，无法生成可靠的学习计划。')
    if (usable.length !== sources.length && confirmPartial !== true) {
      return unavailable(sources, '部分资料未能读取，请确认仅使用成功资料继续。', { requiresConfirmation: true })
    }
    if (sources.reduce((total, source) => total + (source.text?.length ?? 0) + (source.extractedText?.length ?? 0), 0) > textLimit) {
      return unavailable(sources, '资料文字合计超过 60,000 字符，请缩减资料后重试。')
    }

    try {
      await onStage?.('identifying')
      const topic = await send({ action: 'identify', sources, confirmPartial, clarification })
      if (topic.status !== 'ready') return { ...topic, sources }

      await onStage?.('organizing')
      const proposed = await send({ action: 'plan', sources, confirmPartial, topic: topic.topic,
        ...(planVersion === 2 ? { planVersion } : {}) })
      if (proposed.status !== 'ready') return { ...proposed, sources }

      await onStage?.('generating')
      // Check against the actual imported batch, never against the provider's copy of evidence.
      if (proposed.mode === 'real' && (proposed.planVersion ?? 1) === planVersion &&
        isValidLearningPlan(proposed, sources) && Array.isArray(proposed.coverageGaps) &&
        Array.isArray(proposed.notices)) return { ...proposed, sources }
      return unavailable(sources, '学习计划的任务或来源引用未通过校验，无法生成可靠的学习计划。')
    } catch {
      return unavailable(sources, '分析请求未完成，请检查网络或重启 Vercel 本地开发服务后重试。')
    }
  }

  return { readSources, planLearning }
}

export const { readSources, planLearning } = createAnalysisService()
