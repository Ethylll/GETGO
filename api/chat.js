import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fuseRetrieval, insufficient, prepareRetrieval } from '../server/chatRag.js'
import { composeAnswer, validateClaims } from '../server/chatClaims.js'
import { QUESTION_LIMIT, validatedLearningFeedback } from '../src/chatMessages.js'

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
  const { topic, task, question, sources, history = [], scope = 'task', observeLearning = false, priorFeedback = [] } = body ?? {}
  if (!within(topic, 160) || !within(question, QUESTION_LIMIT) || !['task', 'project'].includes(scope) ||
    typeof observeLearning !== 'boolean' || !Array.isArray(sources) || sources.length > 10 ||
    !Array.isArray(history) || history.length > 4 || !Array.isArray(priorFeedback) || priorFeedback.length > 4) return null
  if (scope === 'project' ? task !== null : (!within(task?.id, 100) || !within(task.title, 240) ||
    !Array.isArray(task.steps) || task.steps.length > 5 || !task.steps.every((step) => within(step, 350)) ||
    !Array.isArray(task.sourceIds) || task.sourceIds.length > 10 || !task.sourceIds.every((id) => within(id, 100)))) return null

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

  const taskId = task?.id ?? null
  const taskHistory = history.filter((turn) => turn?.taskId === taskId && within(turn.question, QUESTION_LIMIT) && within(turn.answer, 600))
    .map(({ question, answer }) => ({ question, answer }))
  const feedbackHistory = priorFeedback.flatMap((item) => {
    if (item?.taskId !== taskId || !within(item.question, QUESTION_LIMIT)) return []
    const feedback = validatedLearningFeedback(item.question, item)
    return feedback ? [{ ...feedback, question: item.question }] : []
  })
  return {
    topic, question: question.trim(), sources: [...byId.values()], history: taskHistory, observeLearning, feedbackHistory,
    task: task && { id: task.id, title: task.title, steps: task.steps, sourceIds: task.sourceIds.filter((id) => byId.has(id)) },
  }
}

function modelChunk({ chunkId, sourceId, title, text, start, end }) {
  return { chunkId, sourceId, title, text, start, end }
}

function logDiagnostic(event) {
  console.info(JSON.stringify({ event: 'getgo.chat', ...event }))
}

export function createChatHandler({ fetchImpl = globalThis.fetch, env = process.env, timeoutMs = 27_000, report = logDiagnostic } = {}) {
  let windowStarted = 0
  let requests = 0

  return async function chat(request) {
    if (request.method !== 'POST') return error('仅支持 POST 请求。', 405, { Allow: 'POST' })
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return error('请求必须使用 JSON。', 415)

    const payload = await readBody(request)
    const input = !payload.tooLarge && normalizeInput(payload.body)
    if (payload.tooLarge || input?.tooLarge) return error('资料内容超过本次答疑的长度限制。', 413)
    if (!input) return error('答疑请求无效，请检查问题长度和学习资料。', 400)

    const { question, topic, task, sources, history, observeLearning, feedbackHistory } = input
    const { candidates, lexical } = prepareRetrieval(input)
    const requestId = randomUUID()
    const record = (reason, details = {}) => report({ requestId, reason, ...details })
    let feedback = null
    const withFeedback = (response) => feedback ? { ...response, feedback } : response
    const decline = (reason) => {
      record(reason)
      return json(withFeedback(insufficient()))
    }
    if (!candidates.length) return decline('no_searchable_sources')
    const key = env.DEEPSEEK_API_KEY?.trim()
    if (!key) return error('服务端尚未配置 DeepSeek API 密钥。', 503)

    let prompts
    try {
      prompts = (await Promise.all([
        readFile(join(process.cwd(), 'server', 'prompts', 'tutor.retrieve.md'), 'utf8'),
        readFile(join(process.cwd(), 'server', 'prompts', 'tutor.system.md'), 'utf8'),
        readFile(join(process.cwd(), 'server', 'prompts', 'tutor.verify.md'), 'utf8'),
      ])).map((prompt) => prompt.trim())
      if (prompts.some((prompt) => !prompt)) return error('服务端答疑规则未配置，请稍后重试。', 500)
    } catch {
      return error('服务端无法加载答疑规则，请稍后重试。', 500)
    }
    const [retrievalPrompt, tutorPrompt, verifyPrompt] = prompts

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
      if (!response.ok) return { failure: modelFailure('DeepSeek 暂时无法提供答疑，请稍后重试。', 502) }

      const choice = (await response.json()).choices?.[0]
      if (choice?.finish_reason !== 'stop' || typeof choice.message?.content !== 'string') {
        return { failure: modelFailure('DeepSeek 返回了不完整的答疑结果，请重试。', 502) }
      }
      return { output: JSON.parse(choice.message.content) }
    }

    function modelFailure(message, status) {
      return json(withFeedback({ status: 'error', answer: '', citations: [], message }), status)
    }

    let stage = 'retrieval'
    try {
      const frame = { topic, question, task: task?.title ?? null, history }
      const ranked = await complete(retrievalPrompt, { ...frame, observeLearning,
        ...(observeLearning ? { priorFeedback: feedbackHistory } : {}), candidates: candidates.map(modelChunk) }, 800)
      if (ranked.failure) {
        record('upstream_error', { stage })
        return ranked.failure
      }
      if (!Array.isArray(ranked.output?.matches) || ranked.output.matches.length > candidates.length ||
        !ranked.output.matches.every((match) => typeof match?.chunkId === 'string' && [0, 1, 2, 3].includes(match.relevance))) {
        throw new Error('invalid ranking')
      }
      const priorIndex = ranked.output.feedback?.sameAsPrior
      const isRepeated = Number.isInteger(priorIndex) && priorIndex >= 0 && priorIndex < feedbackHistory.length
      if (observeLearning && !isRepeated) feedback = validatedLearningFeedback(question, ranked.output.feedback)
      const retrieval = fuseRetrieval(candidates, ranked.output.matches)
      record('retrieval', {
        candidates: candidates.length,
        lexical: lexical.map(({ chunkId, relevance }) => ({ chunkId, relevance })),
        evidence: retrieval.map(({ chunkId, semanticScore, fusedScore }) => ({ chunkId, semanticScore, fusedScore })),
      })
      if (!retrieval.length) return decline('no_relevant_evidence')

      const evidence = retrieval.map(modelChunk)
      stage = 'generation'
      const draft = await complete(tutorPrompt, { ...frame, evidence }, 2000)
      if (draft.failure) {
        record('upstream_error', { stage })
        return draft.failure
      }
      const proposal = draft.output
      if (!['complete', 'partial', 'insufficient'].includes(proposal?.coverage) ||
        !Array.isArray(proposal.claims) || proposal.claims.length > 4) throw new Error('invalid draft')
      if (proposal.coverage === 'insufficient' || !proposal.claims.length) return decline('generator_abstained')
      const claims = validateClaims(proposal, sources, evidence)
      if (claims.length !== proposal.claims.length) record('claim_validation_rejected', { count: proposal.claims.length - claims.length })
      if (!claims.length) return decline('no_valid_claim_citations')

      stage = 'verification'
      const verified = await complete(verifyPrompt, { question, history, claims, context: evidence }, 550)
      if (verified.failure) {
        record('upstream_error', { stage })
        return verified.failure
      }
      const review = verified.output
      const expected = new Set(claims.map(({ id }) => id))
      if (!['complete', 'partial'].includes(review?.coverage) || !Array.isArray(review.verdicts) ||
        review.verdicts.length !== claims.length || !review.verdicts.every((item) =>
          expected.delete(item?.id) && ['supported', 'unsupported', 'conflict'].includes(item.verdict))) {
        throw new Error('invalid verification')
      }
      const answer = composeAnswer(proposal, claims, review)
      if (answer.status === 'insufficient') return decline('no_semantically_supported_claims')
      record('answer', { status: answer.status, reviewed: claims.length, citationCount: answer.citations.length,
        unsupported: review.verdicts.filter(({ verdict }) => verdict === 'unsupported').length })
      return json(withFeedback(answer))
    } catch {
      record(controller.signal.aborted ? 'timeout' : 'upstream_or_protocol_error', { stage })
      return controller.signal.aborted
        ? modelFailure('DeepSeek 答疑超时，请重试。', 504)
        : modelFailure('DeepSeek 响应异常或格式无效，请重试。', 502)
    } finally {
      clearTimeout(timer)
    }
  }
}

export default { fetch: createChatHandler() }
