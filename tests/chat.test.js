import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createChatHandler } from '../api/chat.js'
import { retrieveChunks, splitSources } from '../server/chatRag.js'

const excerpt = '把乐器放稳。'
const text = (sourceId, content, status = 'processed') => ({ sourceId, title: sourceId, type: 'text', status, text: content })
const batch = [text('posture', '吉他入门。把乐器放稳。练习前先放松肩膀。')]
const input = (overrides = {}) => ({
  topic: '吉他入门', task: { id: 'posture', title: '先把吉他拿稳', steps: ['把吉他放稳。'], sourceIds: ['posture'] },
  question: '如何持琴？', sources: batch, history: [], ...overrides,
})
const response = (content, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content } }] })
const citing = (sourceId = 'posture', quote = excerpt) => ({ sourceId, excerpt: quote })
const answer = (status = 'answered', citations = [citing()]) => ({ status, citations, answer: citations.map((ref) => ref.excerpt).join('\n') })
const send = (handler, body) => handler(new Request('http://localhost/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))

function mock(output, verification = { status: output?.status }) {
  const calls = []
  const checks = []
  const handler = createChatHandler({ env: { DEEPSEEK_API_KEY: 'test-only' }, fetchImpl: async (url, options) => {
    const call = { url, options, body: JSON.parse(options.body) }
    const data = JSON.parse(call.body.messages[1].content)
    const result = data.draft ? verification : output
    const requests = data.draft ? checks : calls
    requests.push(call)
    return response(typeof result === 'string' ? result : JSON.stringify(result))
  } })
  return { handler, calls, checks }
}

test('同义问法检索同一资料，固定官方 API 和服务端模型，原文位置准确', async () => {
  const { handler, calls, checks } = mock(answer())
  const prompt = (await readFile(new URL('../server/prompts/tutor.system.md', import.meta.url), 'utf8')).trim()
  const verificationPrompt = (await readFile(new URL('../server/prompts/tutor.verify.md', import.meta.url), 'utf8')).trim()
  for (const question of ['如何持琴？', '吉他该怎么握琴？']) {
    const result = await send(handler, input({ question, model: 'client-model', endpoint: 'http://invalid' }))
    assert.equal(result.status, 200)
    assert.deepEqual(await result.json(), answer())
  }
  for (const call of calls) {
    assert.equal(call.url, 'https://api.deepseek.com/chat/completions')
    assert.equal(call.body.model, 'deepseek-flash')
    assert.deepEqual(call.body.response_format, { type: 'json_object' })
    assert.equal(call.options.headers.Authorization, 'Bearer test-only')
    assert.deepEqual(call.body.messages[0], { role: 'system', content: prompt })
    const [chunk] = JSON.parse(call.body.messages[1].content).evidence
    assert.equal(batch[0].text.slice(chunk.start, chunk.end), chunk.text)
  }
  assert.equal(checks.length, 2)
  assert.equal(checks[0].body.messages[0].content, verificationPrompt)
  const [chunk] = splitSources([{ sourceId: 'image', title: '截图', type: 'image', status: 'processed', extractedText: `\n  ${excerpt}` }])
  assert.deepEqual(chunk, { sourceId: 'image', title: '截图', start: 3, end: 3 + excerpt.length, text: excerpt })
})

test('BC-001 允许自然释义，中文同义问句保留可解释的检索分数和逐字引用', async () => {
  const draft = { ...answer(), answer: '先让琴身稳住。' }
  const { handler, calls, checks } = mock(draft)
  for (const question of ['如何持琴？请用自己的话简单解释。', '弹的时候琴身怎样才不会晃？']) {
    const request = input({ question })
    const [best] = retrieveChunks(request)
    assert.equal(best.sourceId, 'posture')
    assert.ok(best.score >= best.relevance)
    assert.ok(best.matches[0].phrases.includes('持琴'))
    assert.deepEqual(await (await send(handler, request)).json(), draft)
  }
  assert.equal(calls.length, 2)
  assert.equal(checks.length, 2)
})

test('BC-001 问题的不同部分可分别召回并使用多段资料', async () => {
  const tuning = '调音时先用调音器校准音高。'
  const request = input({
    question: '该如何持琴，以及怎么对音准？',
    sources: [text('posture', Array(12).fill('把乐器放稳，练习持琴。').join('\n')), text('pitch', tuning)],
  })
  const draft = { ...answer('answered', [citing('posture', '把乐器放稳，练习持琴。'), citing('pitch', tuning)]),
    answer: '拿琴时先稳住琴身；需要调音时，先用调音器对准音高。' }
  const { handler, checks } = mock(draft)
  const chunks = retrieveChunks(request)
  assert.equal(chunks.length, 8)
  assert.ok(chunks.some((chunk) => chunk.sourceId === 'pitch'))
  assert.deepEqual(await (await send(handler, request)).json(), draft)
  const verification = JSON.parse(checks[0].body.messages[1].content)
  assert.deepEqual(new Set(verification.context.map((chunk) => chunk.sourceId)), new Set(['posture', 'pitch']))
})

test('无关问题、仅失败资料和缺少资料时拒答且不使用模型', async () => {
  const { handler, calls } = mock(answer())
  for (const request of [input({ question: '吉他是在哪一年发明的？' }), input({ sources: [text('posture', excerpt, 'failed')] }), input({ sources: [] })]) {
    assert.equal((await (await send(handler, request)).json()).status, 'insufficient')
  }
  assert.equal(calls.length, 0)
})

test('资料只支持部分问题时只返回有依据的解释', async () => {
  const draft = { ...answer(), answer: '把琴扶稳再开始。' }
  const { handler } = mock(draft, { status: 'partial' })
  const result = await (await send(handler, input({ question: '怎么持琴以及怎么调音？' }))).json()
  assert.equal(result.status, 'partial')
  assert.equal(result.answer, draft.answer)
  assert.match(result.insufficientReason, /一部分/)
})

test('模型输出无效 JSON 时返回干净错误，不暴露原始内容', async () => {
  const { handler } = mock('not-json-private-content')
  const result = await send(handler, input())
  assert.equal(result.status, 502)
  assert.doesNotMatch(await result.text(), /private-content|test-only/)
})

test('拦截不存在的来源、伪造片段、检索外片段、无引用和夹带未验证结论', async () => {
  const distant = text('posture', `把乐器放稳。\n${'无关描述。'.repeat(180)}\n这里讨论了另一项训练。`)
  for (const output of [
    answer('answered', [citing('outside')]), answer('answered', [citing('posture', '虚构的持琴方法。')]),
    answer('answered', [citing('posture', '这里讨论了另一项训练。')]),
    answer('answered', []), { ...answer(), answer: `${excerpt}练习后会加快血液循环。` },
  ]) {
    const { handler, checks } = mock(output, { status: 'unsupported' })
    const result = await (await send(handler, input({ sources: [distant] }))).json()
    assert.equal(result.status, 'insufficient')
    assert.deepEqual(result.citations, [])
    assert.equal(result.answer, '')
    assert.equal(checks.length, Number(output.answer.includes('血液循环')))
  }
})

test('BC-001 合法引用无法为新增数值背书，也不能绕过异常的语义核对', async () => {
  const inventedNumber = mock({ ...answer(), answer: '每天至少持琴8分钟。' })
  assert.equal((await (await send(inventedNumber.handler, input())).json()).status, 'insufficient')
  assert.equal(inventedNumber.checks.length, 0)

  const invalidReview = mock({ ...answer(), answer: '先稳住琴身。' }, { status: 'unknown' })
  assert.equal((await (await send(invalidReview.handler, input())).json()).status, 'insufficient')
  const malformedReview = mock(answer(), 'not-valid-json')
  assert.equal((await send(malformedReview.handler, input())).status, 502)
})

test('资料冲突展示双方原文，不选边或接受缺少另一方证据的冲突结果', async () => {
  const first = '持琴练习时先放松肩膀。'
  const second = '持琴练习时先固定肩膀。'
  const sources = [text('a', first), text('b', second)]
  const { handler } = mock(answer('conflict', [citing('a', first), citing('b', second)]))
  const result = await (await send(handler, input({ sources }))).json()
  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.citations.map(({ sourceId }) => sourceId), ['a', 'b'])
  assert.match(result.insufficientReason, /冲突/)
  const oneSided = mock(answer('conflict', [citing('a', first)]))
  assert.equal((await (await send(oneSided.handler, input({ sources }))).json()).status, 'insufficient')
  const overlooked = mock(answer('answered', [citing('a', first)]), { status: 'unsupported' })
  assert.equal((await (await send(overlooked.handler, input({ sources }))).json()).status, 'insufficient')
  const verification = JSON.parse(overlooked.checks[0].body.messages[1].content)
  assert.ok(verification.context.some((chunk) => chunk.sourceId === 'b'))
})

test('只有本任务的历史进入检索和模型上下文', async () => {
  const { handler, calls } = mock(answer())
  const current = { taskId: 'posture', question: '如何持琴？', answer: excerpt }
  const other = { taskId: 'chord', question: '如何调音？', answer: '其他任务消息' }
  assert.equal((await (await send(handler, input({ question: '那接下来呢？', history: [current, other] }))).json()).status, 'answered')
  assert.deepEqual(JSON.parse(calls[0].body.messages[1].content).history, [{ question: current.question, answer: current.answer }])
  assert.equal((await (await send(handler, input({ question: '那接下来呢？', history: [other] }))).json()).status, 'insufficient')
  assert.equal(calls.length, 1)
})

test('API Key 缺失、上游错误、上游截断及超时返回明确的 HTTP 错误', async () => {
  const missing = createChatHandler({ env: {}, fetchImpl: () => assert.fail('no model call expected') })
  assert.equal((await send(missing, input())).status, 503)

  const env = { DEEPSEEK_API_KEY: 'test-only', DEEPSEEK_MODEL: 'deepseek-v4-pro' }
  const failed = createChatHandler({ env, fetchImpl: async (_url, request) => {
    assert.equal(JSON.parse(request.body).model, 'deepseek-v4-pro')
    return new Response('upstream private response', { status: 401 })
  } })
  const error = await send(failed, input())
  assert.equal(error.status, 502)
  assert.doesNotMatch(await error.text(), /private response/)

  const cutOff = createChatHandler({ env, fetchImpl: async () => response(JSON.stringify(answer()), 'length') })
  assert.equal((await send(cutOff, input())).status, 502)
  const slow = createChatHandler({ env, timeoutMs: 10, fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  }) })
  assert.equal((await send(slow, input())).status, 504)
})

test('路由拒绝错误请求和超长资料，并限制单实例上游请求频率', async () => {
  const { handler, calls } = mock(answer())
  assert.equal((await handler(new Request('http://localhost/api/chat'))).status, 405)
  assert.equal((await handler(new Request('http://localhost/api/chat', { method: 'POST', body: 'test' }))).status, 415)
  assert.equal((await send(handler, input({ question: ' '.repeat(610) }))).status, 400)
  assert.equal((await send(handler, input({ sources: [text('posture', '吉'.repeat(60_001))] }))).status, 413)
  assert.equal((await send(handler, input({ sources: [text('posture', '吉'.repeat(100_000))] }))).status, 413)
  for (let i = 0; i < 30; i++) assert.equal((await send(handler, input())).status, 200)
  assert.equal((await send(handler, input())).status, 429)
  assert.equal(calls.length, 30)
})
