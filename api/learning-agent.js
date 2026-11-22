import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { normalizeAgentDecision } from '../src/agentActions.js'

const ENDPOINT = 'https://api.deepseek.com/chat/completions'
const MAX_BODY = 92_000
const knownMethods = ['decide', 'review']
const reply = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) return { large: true }
  const reader = request.body?.getReader()
  if (!reader) return {}
  let received = 0
  const chunks = []
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return { data: JSON.parse(Buffer.concat(chunks, received).toString('utf8')) }
      received += value.byteLength
      if (received > MAX_BODY) {
        void reader.cancel().catch(() => {})
        return { large: true }
      }
      chunks.push(value)
    }
  } catch {
    return {}
  } finally {
    reader.releaseLock()
  }
}

function normalizeRequest(body) {
  if (!knownMethods.includes(body?.operation)) return null
  if (body.operation === 'review') {
    const { action, topic, material, sources } = body
    if (!['GUIDE', 'DECOMPOSE_TASK', 'ADJUST_PRACTICE', 'CHECK_MASTERY'].includes(action) || typeof topic !== 'string' ||
      !material || !Array.isArray(sources) || sources.length > 20) return null
    return { operation: 'review', action, topic, material, sources }
  }
  const { frame, receipts, remainingTools } = body
  if (!frame || !Array.isArray(frame.recentDays) || frame.recentDays.length > 5 || !Array.isArray(frame.messages) ||
    frame.messages.length > 10 || !Array.isArray(frame.sources) || frame.sources.length > 8 ||
    !Array.isArray(receipts) || receipts.length > 3 || ![0, 1, 2, 3].includes(remainingTools)) return null
  return { operation: 'decide', frame, receipts, remainingTools }
}

export function createLearningAgentHandler({ fetchImpl = globalThis.fetch, env = process.env, timeoutMs = 12_000 } = {}) {
  let window = -1
  let count = 0
  return async function learningAgent(request) {
    if (request.method !== 'POST') return reply({ error: 'method' }, 405, { Allow: 'POST' })
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return reply({ error: 'content_type' }, 415)
    const payload = await readBody(request)
    if (payload.large) return reply({ error: 'size' }, 413)
    const input = normalizeRequest(payload.data)
    if (!input) return reply({ error: 'invalid' }, 400)
    const key = env.DEEPSEEK_API_KEY?.trim()
    if (!key) return reply({ error: 'configuration' }, 503)
    const minute = Math.floor(Date.now() / 60_000)
    if (minute !== window) {
      window = minute
      count = 0
    }
    if (++count > 60) return reply({ error: 'limit' }, 429, { 'Retry-After': '60' })
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
    try {
      const prompt = await readFile(join(process.cwd(), 'server', 'prompts', 'learning-agent.system.md'), 'utf8')
      const result = await fetchImpl(ENDPOINT, {
        method: 'POST', redirect: 'error', signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash', thinking: { type: 'disabled' },
          response_format: { type: 'json_object' }, max_tokens: input.operation === 'review' ? 120 : 1800, stream: false,
          messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify(input) }],
        }),
      })
      if (!result.ok) return reply({ error: 'upstream' }, 502)
      const envelope = await result.json().catch(() => null)
      const choice = envelope?.choices?.[0]
      if (choice?.finish_reason !== 'stop') return reply({ error: 'output' }, 502)
      let output
      try {
        output = JSON.parse(choice.message.content)
      } catch {
        return reply({ error: 'output' }, 502)
      }
      if (input.operation === 'review') {
        return typeof output?.supported === 'boolean' ? reply({ supported: output.supported }) : reply({ error: 'output' }, 502)
      }
      const decision = normalizeAgentDecision(output)
      return decision ? reply({ decision }) : reply({ error: 'output' }, 502)
    } catch {
      return signal.aborted ? reply({ error: 'timeout' }, 504) : reply({ error: 'upstream' }, 502)
    }
  }
}

export default { fetch: createLearningAgentHandler() }
