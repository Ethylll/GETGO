import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { groundedAnswer, insufficient, retrieveChunks, validateDraft } from '../server/chatRag.js'
import { QUESTION_LIMIT } from '../src/chatMessages.js'

const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const DEFAULT_MODEL = 'deepseek-flash'
const MAX_BODY_BYTES = 256 * 1024
const MAX_SOURCE_CHARS = 60_000

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

function error(message, status, headers) {
  return json({ status: 'error', answer: '', citations: [], message }, status, headers)
}

function within(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) return { tooLarge: true }
  if (!request.body) return {}

  const reader = request.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let bytes = 0
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { body: JSON.parse(text + decoder.decode()) }
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {})
        return { tooLarge: true }
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return {}
  } finally {
    reader.releaseLock()
  }
}

function normalizeInput(body) {
  const { topic, task, question, sources, history = [] } = body ?? {}
  if (!within(topic, 160) || !within(question, QUESTION_LIMIT) || !within(task?.id, 100) || !within(task.title, 240) ||
    !Array.isArray(task.steps) || task.steps.length > 5 || !task.steps.every((step) => within(step, 350)) ||
    !Array.isArray(task.sourceIds) || task.sourceIds.length > 10 || !task.sourceIds.every((id) => within(id, 100)) ||
    !Array.isArray(sources) || sources.length > 10 || !Array.isArray(history) || history.length > 4) return null

  let length = 0
  const byId = new Map()
  for (const source of sources) {
    if (!within(source?.sourceId, 100) || !within(source.title, 255) || byId.has(source.sourceId) ||
      !['text', 'image'].includes(source.type) || !['processed', 'failed'].includes(source.status)) return null
    const text = (source.type === 'text' ? source.text : source.extractedText) ?? ''
    if (typeof text !== 'string') return null
    length += text.length
    if (length > MAX_SOURCE_CHARS) return { tooLarge: true }
    const { sourceId, title, type, status } = source
    byId.set(sourceId, { sourceId, title, type, status, [type === 'text' ? 'text' : 'extractedText']: text })
  }

  const taskHistory = history.filter((turn) => turn?.taskId === task.id && within(turn.question, QUESTION_LIMIT) && within(turn.answer, 600))
    .map(({ question, answer }) => ({ question, answer }))
  return {
    topic, question: question.trim(), sources: [...byId.values()], history: taskHistory,
    task: { id: task.id, title: task.title, steps: task.steps, sourceIds: task.sourceIds.filter((id) => byId.has(id)) },
  }
}

export function createChatHandler({ fetchImpl = globalThis.fetch, env = process.env, timeoutMs = 22_000 } = {}) {
  let windowStarted = 0
  let requests = 0

  return async function chat(request) {
    if (request.method !== 'POST') return error('仅支持 POST 请求。', 405, { Allow: 'POST' })
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return error('请求必须使用 JSON。', 415)

    const payload = await readBody(request)
    const input = !payload.tooLarge && normalizeInput(payload.body)
    if (payload.tooLarge || input?.tooLarge) return error('资料内容超过本次答疑的长度限制。', 413)
    if (!input) return error('答疑请求无效，请检查问题长度和学习资料。', 400)

    const { question, topic, task, sources, history } = input
    const evidence = retrieveChunks(input).map(({ sourceId, title, text, start, end }) =>
      ({ sourceId, title, text, start, end }))
    if (!evidence.length) return json(insufficient())
    const key = env.DEEPSEEK_API_KEY?.trim()
    if (!key) return error('服务端尚未配置 DeepSeek API 密钥。', 503)

    let prompts
    try {
      prompts = (await Promise.all([
        readFile(join(process.cwd(), 'server', 'prompts', 'tutor.system.md'), 'utf8'),
        readFile(join(process.cwd(), 'server', 'prompts', 'tutor.verify.md'), 'utf8'),
      ])).map((prompt) => prompt.trim())
      if (prompts.some((prompt) => !prompt)) return error('服务端答疑规则未配置，请稍后重试。', 500)
    } catch {
      return error('服务端无法加载答疑规则，请稍后重试。', 500)
    }
    const [tutorPrompt, verifyPrompt] = prompts

    const now = Date.now()
    if (now - windowStarted >= 60_000) {
      windowStarted = now
      requests = 0
    }
    if (requests >= 30) return error('答疑请求过于频繁，请稍后重试。', 429, { 'Retry-After': '60' })
    requests++

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    async function complete(prompt, data, maxTokens) {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL,
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' }, max_tokens: maxTokens, stream: false,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: JSON.stringify(data) },
          ],
        }),
      })
      if (!response.ok) return { failure: error('DeepSeek 暂时无法提供答疑，请稍后重试。', 502) }

      const choice = (await response.json()).choices?.[0]
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
        return { failure: error('DeepSeek 返回了不完整的答疑结果，请重试。', 502) }
      }
      return { output: JSON.parse(choice.message.content) }
    }

    try {
      const draft = await complete(tutorPrompt, { topic, task, question, history, evidence }, 1500)
      if (draft.failure) return draft.failure
      const answer = validateDraft(draft.output, sources, evidence, { question, history })
      if (answer.status === 'insufficient') return json(answer)

      const previousQuestion = history.at(-1)?.question
      const verified = await complete(verifyPrompt, { question, previousQuestion, draft: answer, context: evidence }, 120)
      if (verified.failure) return verified.failure
      const verdict = verified.output?.status
      if (answer.status === 'conflict') return json(verdict === 'conflict' ? answer : insufficient())
      if (!['answered', 'partial'].includes(verdict)) return json(insufficient())
      return json(verdict === 'partial' ? groundedAnswer('partial', answer.answer, answer.citations) : answer)
    } catch {
      return controller.signal.aborted
        ? error('DeepSeek 答疑超时，请重试。', 504)
        : error('DeepSeek 响应异常或格式无效，请重试。', 502)
    } finally {
      clearTimeout(timer)
    }
  }
}

export default { fetch: createChatHandler() }
