import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createChatHandler } from '../api/chat.js'
import { fuseRetrieval, prepareRetrieval, splitSources } from '../server/chatRag.js'

const fixtures = JSON.parse(await readFile(new URL('./fixtures/chat-evaluation.json', import.meta.url), 'utf8'))
const text = (sourceId, content, status = 'processed') => ({ sourceId, title: sourceId, type: 'text', status, text: content })
const task = { id: 'posture', title: '持琴入门', steps: ['把乐器放稳。'], sourceIds: ['hold'] }
const input = (overrides = {}) => ({
  topic: '吉他入门', task, question: '如何持琴？', sources: [text('hold', fixtures.sources.hold)], history: [], ...overrides,
})
const response = (content, finish_reason = 'stop') => Response.json({ choices: [{ finish_reason, message: { content } }] })
const send = (handler, body) => handler(new Request('http://localhost/api/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}))
const noReport = () => {}
const env = { DEEPSEEK_API_KEY: 'test-only' }
const select = (candidates) => ({ matches: candidates.map(({ chunkId }) => ({ chunkId, relevance: 3 })) })
const paraphrase = '把吉他靠近身子，右前臂轻轻扶住琴身。'
const claim = (chunk, statement = paraphrase, excerpt = chunk.text) => ({
  kind: 'instruction', text: statement, citations: [{ chunkId: chunk.chunkId, sourceId: chunk.sourceId, excerpt }],
})
const drafted = (claims, coverage = 'complete') => ({ coverage, claims })
const reviewAll = (claims) => ({ coverage: 'complete',
  verdicts: claims.map(({ id, kind }) => ({ id, verdict: kind === 'conflict' ? 'conflict' : 'supported' })),
})

function mock({ rerank, tutor, verify } = {}) {
  const calls = []
  const diagnostic = []
  const handler = createChatHandler({ env, report: (event) => diagnostic.push(event), fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body)
    const data = JSON.parse(body.messages[1].content)
    const stage = data.candidates ? 'retrieval' : data.evidence ? 'generation' : 'verification'
    calls.push({ url, body, data, stage })
    const output = stage === 'retrieval' ? (rerank ?? select)(data.candidates, data)
      : stage === 'generation' ? (tutor ?? ((evidence) => drafted([claim(evidence[0])])))(data.evidence)
        : (verify ?? reviewAll)(data.claims, data)
    return response(typeof output === 'string' ? output : JSON.stringify(output))
  } })
  return { handler, calls, diagnostic }
}

test('自然语言正文通过完整三阶段，精确引用和安全诊断字段被保留', async () => {
  const { handler, calls, diagnostic } = mock()
  const reply = await (await send(handler, input({ model: 'invalid', endpoint: 'http://invalid' }))).json()
  assert.equal(reply.status, 'answered')
  assert.equal(reply.answer, paraphrase)
  assert.equal(reply.citations[0].excerpt, fixtures.sources.hold)
  assert.deepEqual(calls.map(({ stage }) => stage), ['retrieval', 'generation', 'verification'])
  for (const call of calls) {
    assert.equal(call.url, 'https://api.deepseek.com/chat/completions')
    assert.equal(call.body.model, 'deepseek-flash')
    assert.deepEqual(call.body.response_format, { type: 'json_object' })
  }
  assert.equal(diagnostic[0].reason, 'retrieval')
  assert.ok(diagnostic[0].evidence[0].fusedScore > 0)
  assert.doesNotMatch(JSON.stringify(diagnostic), /吉他|右前臂|test-only/)
})

test('人工标注证据进入候选，语义选段与许可 ID 融合并排除负例', async () => {
  for (const item of fixtures.cases) {
    const request = input({
      question: item.question,
      sources: item.sources.map((id) => text(id, fixtures.sources[id])),
      history: (item.history ?? []).map((turn) => ({ taskId: task.id, ...turn })),
    })
    const chunks = splitSources(request.sources)
    const position = (chunk) => `${chunk.sourceId}:${chunks.filter((part) => part.sourceId === chunk.sourceId).findIndex((part) => part.chunkId === chunk.chunkId)}`
    const { candidates } = prepareRetrieval(request)
    for (const expected of item.expected) assert.ok(candidates.some((chunk) => position(chunk) === expected), item.id)
    const { handler, calls } = mock({
      rerank: (options) => ({ matches: [...select(options.filter((chunk) => item.expected.includes(position(chunk)))).matches,
        { chunkId: 'other-session', relevance: 3 }] }),
    })
    await send(handler, request)
    const evidence = calls.find(({ stage }) => stage === 'generation')?.data.evidence ?? []
    assert.deepEqual(evidence.map(position).sort(), [...item.expected].sort(), item.id)
  }
})

test('候选有上限，图像提取及重叠片段保留稳定 ID 和原文偏移', () => {
  const raw = ` \r\n  ${'早期学习内容。'.repeat(120)}\n${'补充说明。\n'.repeat(30)}`
  const image = { type: 'image', title: '图', sourceId: 'img', status: 'processed', extractedText: raw }
  const chunks = splitSources([image])
  assert.ok(chunks[1].start < chunks[0].end)
  assert.deepEqual(chunks, splitSources([image]))
  for (const chunk of chunks) assert.equal(raw.slice(chunk.start, chunk.end), chunk.text)
  assert.equal(prepareRetrieval(input({ sources: [image] })).candidates.length, 14)
})

test('语义阈值过滤主题噪音，词法得分参与共识排序，最终证据有上限', () => {
  const candidates = Array.from({ length: 12 }, (_, index) => ({ chunkId: String(index), relevance: index }))
  const selections = candidates.map(({ chunkId }) => ({ chunkId, relevance: chunkId === '11' ? 1 : 2 }))
  const evidence = fuseRetrieval(candidates, selections)
  assert.equal(evidence.length, 8)
  assert.ok(!evidence.some(({ chunkId }) => chunkId === '11'))
  assert.ok(evidence[0].fusedScore > evidence.at(-1).fusedScore)
})

test('真正不相关时停止于检索，没有可检索资料时不调用模型', async () => {
  const { handler, calls, diagnostic } = mock({ rerank: () => ({ matches: [] }) })
  for (const request of [input({ sources: [] }), input({ sources: [text('hold', '不能用', 'failed')] })]) {
    assert.equal((await (await send(handler, request)).json()).status, 'insufficient')
  }
  assert.equal(calls.length, 0)
  const reply = await (await send(handler, input({ question: '吉他是哪一年发明的？' }))).json()
  assert.equal(reply.status, 'insufficient')
  assert.deepEqual(calls.map(({ stage }) => stage), ['retrieval'])
  assert.equal(diagnostic.at(-1).reason, 'no_relevant_evidence')
})

test('伪造 sourceId、excerpt 或检索范围外引用只淘汰该项', async () => {
  const { handler, calls } = mock({
    rerank: (options) => select(options.filter(({ sourceId }) => sourceId === 'hold')),
    tutor: ([chunk]) => drafted([claim(chunk),
      { ...claim(chunk, '伪造来源'), citations: [{ ...claim(chunk).citations[0], sourceId: 'other' }] },
      claim(chunk, '伪造引文', '杜撰的一段文字'),
      claim(chunk, '检索范围外', fixtures.sources.noise),
    ]),
  })
  const reply = await (await send(handler, input({ sources: [text('hold', fixtures.sources.hold), text('noise', fixtures.sources.noise)] }))).json()
  assert.equal(reply.status, 'partial')
  assert.equal(reply.answer, paraphrase)
  assert.deepEqual(calls.at(-1).data.claims.map(({ id }) => id), [1])
})

test('语义核验逐项淘汰资料外事实并保留其余教学内容', async () => {
  const { handler } = mock({
    tutor: ([chunk]) => drafted([claim(chunk), claim(chunk, '此动作有助于改善视力。')]),
    verify: () => ({ coverage: 'partial', verdicts: [{ id: 1, verdict: 'supported' }, { id: 2, verdict: 'unsupported' }] }),
  })
  const reply = await (await send(handler, input())).json()
  assert.equal(reply.status, 'partial')
  assert.equal(reply.answer, paraphrase)
})

test('允许中文和阿拉伯数字、等价时长，拦截错单位和数值对象条件', async () => {
  const { handler, calls } = mock({
    tutor: (evidence) => {
      const ordinary = evidence.find(({ text }) => text.includes('十分钟'))
      const tired = evidence.find(({ text }) => text.includes('五分钟'))
      return drafted([claim(ordinary, '普通练习每天10分钟。'), claim(ordinary, '普通练习每天600秒。'),
        claim(tired, '疲劳时要练5小时。'),
        { ...claim(tired, '疲劳时要练10分钟。'), citations: [...claim(tired).citations, ...claim(ordinary).citations] }])
    },
    verify: (claims) => ({ coverage: 'partial', verdicts: claims.map(({ id }) => ({ id, verdict: id === 4 ? 'unsupported' : 'supported' })) }),
  })
  const data = input({ question: '普通和疲劳时各练多久？', sources: [text('practice', fixtures.sources.practice)] })
  const reply = await (await send(handler, data)).json()
  assert.equal(reply.status, 'partial')
  assert.match(reply.answer, /10分钟.*600秒/s)
  assert.doesNotMatch(reply.answer, /疲劳/)
  assert.deepEqual(calls.at(-1).data.claims.map(({ id }) => id), [1, 2, 4])
})

test('冲突项保留双方依据，同一来源的不同片段也可以构成冲突', async () => {
  const { handler } = mock({
    tutor: (evidence) => drafted([{
      kind: 'conflict', text: '一段要求靠近身体，另一段要求留出距离，资料说法不同。',
      citations: evidence.flatMap((chunk) => claim(chunk).citations),
    }]),
  })
  const data = input({ sources: [text('hold', `${fixtures.sources.hold}\n${fixtures.sources.contrast}`)] })
  const reply = await (await send(handler, data)).json()
  assert.equal(reply.status, 'conflict')
  assert.equal(reply.citations.length, 2)
})

test('同任务多轮历史仅用于语境，其他任务和其他会话证据不能进入回答', async () => {
  const { handler, calls } = mock()
  const history = ['怎么拿', '这样有什么用'].map((question) => ({ taskId: task.id, question, answer: paraphrase }))
  history.push({ taskId: 'foreign', question: '其他任务内容', answer: '别的答案' })
  await send(handler, input({ question: '那只胳膊呢？', history }))
  assert.equal(calls[0].data.history.length, 2)
  assert.doesNotMatch(JSON.stringify(calls), /其他任务内容/)
  const isolated = mock({ rerank: () => ({ matches: select(calls[0].data.candidates).matches }) })
  const result = await (await send(isolated.handler, input({ sources: [text('hold', '另一批次里只有清洁步骤。')] }))).json()
  assert.equal(result.status, 'insufficient')
  assert.equal(isolated.calls.length, 1)
})

test('JSON、协议、上游故障和超时是错误，模型自拒和核对拒绝有独立诊断', async () => {
  for (const options of [{ rerank: () => 'bad-json' }, { tutor: () => ({ status: 'old-format' }) },
    { verify: () => ({ coverage: 'complete', verdicts: [{ id: 9, verdict: 'supported' }] }) }]) {
    const { handler, diagnostic } = mock(options)
    assert.equal((await send(handler, input())).status, 502)
    assert.equal(diagnostic.at(-1).reason, 'upstream_or_protocol_error')
  }
  const refusal = mock({ tutor: () => drafted([], 'insufficient') })
  assert.equal((await (await send(refusal.handler, input())).json()).status, 'insufficient')
  assert.equal(refusal.diagnostic.at(-1).reason, 'generator_abstained')
  const veto = mock({ verify: () => ({ coverage: 'partial', verdicts: [{ id: 1, verdict: 'unsupported' }] }) })
  assert.equal((await (await send(veto.handler, input())).json()).status, 'insufficient')
  assert.equal(veto.diagnostic.at(-1).reason, 'no_semantically_supported_claims')
  const missing = createChatHandler({ env: {}, report: noReport, fetchImpl: () => assert.fail('unexpected model call') })
  assert.equal((await send(missing, input())).status, 503)
  const bad = createChatHandler({ env: { ...env, DEEPSEEK_MODEL: 'deepseek-v4-pro' }, report: noReport,
    fetchImpl: async (_url, { body }) => {
      assert.equal(JSON.parse(body).model, 'deepseek-v4-pro')
      return new Response('private', { status: 502 })
    } })
  const fault = await send(bad, input())
  assert.equal(fault.status, 502)
  assert.doesNotMatch(await fault.text(), /private/)
  const truncated = createChatHandler({ env, report: noReport, fetchImpl: async () => response('{}', 'length') })
  assert.equal((await send(truncated, input())).status, 502)
  const slow = createChatHandler({ env, report: noReport, timeoutMs: 10, fetchImpl: (_url, { signal }) =>
    new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) })
  assert.equal((await send(slow, input())).status, 504)
})

test('路由继续检查请求方法、长度与限流', async () => {
  const { handler } = mock({ rerank: () => ({ matches: [] }) })
  assert.equal((await handler(new Request('http://localhost/api/chat'))).status, 405)
  assert.equal((await handler(new Request('http://localhost/api/chat', { method: 'POST', body: 'test' }))).status, 415)
  assert.equal((await send(handler, input({ question: ' '.repeat(610) }))).status, 400)
  assert.equal((await send(handler, input({ sources: [text('hold', '吉'.repeat(60_001))] }))).status, 413)
  assert.equal((await send(handler, input({ sources: [text('hold', '吉'.repeat(100_000))] }))).status, 413)
  for (let i = 0; i < 30; i++) assert.equal((await send(handler, input())).status, 200)
  assert.equal((await send(handler, input())).status, 429)
})
