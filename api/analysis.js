import {
  analysisResult, boundedText, cleanSources, createAnalysisModel, extractImage, generateLearningPlan, identifyLearning,
  MAX_ANALYSIS_IMAGE,
} from '../server/learningAnalysis.js'

function json(result, status = 200) {
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}

function fail(message, status) {
  return json(analysisResult('unavailable', [], { message }), status)
}

async function readBounded(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) return null
  if (!request.body) throw new Error('Empty body')
  const body = request.body.getReader()
  const buffers = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await body.read()
      if (done) return Buffer.concat(buffers, total)
      total += value.length
      if (total > limit) {
        void body.cancel().catch(() => {})
        return null
      }
      buffers.push(value)
    }
  } finally {
    body.releaseLock()
  }
}

export function createAnalysisHandler({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 40_000 } = {}) {
  let lastMinute = -1
  let requests = 0
  return async function analysis(request) {
    if (request.method !== 'POST') return fail('仅支持 POST 请求。', 405)
    const type = request.headers.get('content-type') ?? ''
    const imageRequest = /^multipart\/form-data;/i.test(type)
    if (!imageRequest && !/^application\/json(?:\s*;|$)/i.test(type)) return fail('不支持的分析请求格式。', 415)
    const key = env.DEEPSEEK_API_KEY?.trim()
    let input
    try {
      const data = await readBounded(request, imageRequest ? MAX_ANALYSIS_IMAGE + 20_000 : 420_000)
      if (!data) return fail('分析资料超过单次请求的长度限制。', 413)
      input = imageRequest ? await new Response(data, { headers: { 'Content-Type': type } }).formData()
        : JSON.parse(data.toString('utf8'))
    } catch {
      return fail('分析请求无法读取。', 400)
    }

    let image
    let source
    let sources
    if (imageRequest) {
      image = input.get('image')
      const sourceId = input.get('sourceId')
      const title = input.get('title')
      if (!boundedText(sourceId, 100) || !boundedText(title, 255) || !(image instanceof File) ||
        !['image/png', 'image/jpeg', 'image/webp'].includes(image.type) || !image.size) return fail('图片参数或格式无效。', 400)
      if (image.size > MAX_ANALYSIS_IMAGE) return fail('识别用图片超过 4 MiB，请缩小后重试。', 413)
      source = { sourceId, title, type: 'image' }
    } else {
      sources = cleanSources(input?.sources)
      if (sources?.tooLarge) return fail('资料文字合计超过 60,000 字符，请缩减资料后重试。', 413)
      if (!sources || !['identify', 'plan'].includes(input.action) ||
        (input.clarification !== undefined && !boundedText(input.clarification, 600)) ||
        (input.action === 'plan' && !boundedText(input.topic, 160))) return fail('资料或分析参数未通过校验。', 400)
      if (!sources.some(({ status }) => status === 'processed')) {
        return json(analysisResult('unavailable', sources, { message: '没有可用于规划学习路线的资料。' }))
      }
      if (sources.some(({ status }) => status === 'failed') && input.confirmPartial !== true) {
        return json(analysisResult('unavailable', sources, {
          requiresConfirmation: true, message: '部分资料未能读取，请确认仅使用成功资料继续。',
        }))
      }
    }

    if (!key) return fail('服务端尚未配置 DeepSeek API 密钥。', 503)
    const minute = Math.floor(Date.now() / 60_000)
    if (lastMinute !== minute) {
      lastMinute = minute
      requests = 0
    }
    if (++requests > 45) return fail('分析请求过于频繁，请稍后重试。', 429)
    const signal = AbortSignal.timeout(timeoutMs)
    const model = createAnalysisModel({ key, model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash', fetchImpl, signal })
    try {
      if (image) return json({ ...source, ...await extractImage(model, image) })
      return json(input.action === 'identify'
        ? await identifyLearning(model, sources, input.clarification)
        : await generateLearningPlan(model, sources, input.topic))
    } catch (error) {
      if (signal.aborted) return fail('DeepSeek 分析超时，请稍后重试。', 504)
      if (error.status === 429) return fail('DeepSeek 暂时繁忙，请稍后重试。', 429)
      if (error.status === 401 || error.status === 403) return fail('DeepSeek 服务端凭据或模型权限不可用。', 502)
      return fail(image ? 'DeepSeek 未能读取图片内容，请检查清晰度或稍后重试。'
        : 'DeepSeek 暂未返回可用的分析结果，请稍后重试。', 502)
    }
  }
}

export default { fetch: createAnalysisHandler() }
