import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createAnalysisHandler } from '../api/analysis.js'
import { continueAnalysis, createAnalysisBatch, startAnalysis } from '../src/analysisFlow.js'
import { createAnalysisService } from '../src/services/analysisService.js'
import { isValidLearningPlan } from '../src/services/validateLearningPlan.js'

const note = '纸张练习。对齐两个角。按平折痕。'
const source = { sourceId: 'src_1', title: '纸张笔记', type: 'text', status: 'processed', text: note }
const refs = (excerpt = note) => [{ sourceId: source.sourceId, excerpt }]
const knowledgePoints = [{ id: 'kp', title: '纸张对折', prerequisiteIds: [], sourceRefs: refs() }]
const task = { id: 'fold', title: '折出折痕', objective: '得到平整的折痕', prerequisiteTaskIds: [],
  knowledgePointIds: ['kp'], sourceRefs: refs(),
  steps: [{ text: '对齐两个角', sourceRefs: refs('对齐两个角。') }, { text: '按平折痕', sourceRefs: refs('按平折痕。') }],
}
const topic = { status: 'ready', topic: '纸张对折', domains: ['手工'], relationship: '说明了对齐与压折痕' }
const proposal = (tasks = [task]) => ({ status: 'ready', hasConflict: false, knowledgePoints, tasks, entryTaskId: 'fold',
  coverageGaps: ['未提供第二次折叠的方法'],
})
const success = (output, raw = false) => Response.json({ choices: [{ finish_reason: 'stop',
  message: { content: raw ? output : JSON.stringify(output) } }] })

function setup(overrides = {}, env = { DEEPSEEK_API_KEY: 'test-only', DEEPSEEK_MODEL: 'deepseek-v4-pro' }) {
  const calls = []
  const api = createAnalysisHandler({ env, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions')
    const payload = JSON.parse(init.body)
    const stage = payload.messages[0].content.split('\n')[0]
    const data = payload.messages[1].content
    calls.push({ stage, payload, data })
    if (stage.includes('图片识别')) return (overrides.image ?? (() => success({ status: 'readable', transcript: note, visualNotes: '角对齐' })))(data)
    const input = JSON.parse(data)
    if (stage.includes('主题识别')) return (overrides.topic ?? (() => success(topic)))(input)
    if (stage.includes('独立核验')) return (overrides.review ?? (() => success({ verdicts: [{ id: 'fold', verdict: 'supported' }] })))(input)
    return (overrides.plan ?? (() => success(proposal())))(input)
  } })
  const transport = (path, init) => {
    assert.equal(path, '/api/analysis')
    return api(new Request(`http://localhost${path}`, init))
  }
  return { calls, transport, service: createAnalysisService({ fetchImpl: transport }) }
}

test('统一生产入口经实际 HTTP 处理器识别任意主题，结构检查后才进入学习页', async () => {
  const { service, calls } = setup()
  const stages = []
  const result = await startAnalysis(createAnalysisBatch([{ id: 1, type: 'text', text: note }]), (stage) => stages.push(stage), service)
  assert.equal(result.phase, 'learning')
  assert.equal(result.result.mode, 'real')
  assert.equal(result.result.topic, topic.topic)
  assert.deepEqual(stages, ['reading', 'identifying', 'organizing', 'generating'])
  assert.equal(calls.length, 3)
  assert.equal(JSON.parse(calls[0].data).sources[0].text, note)
  assert.ok(calls.every(({ payload }) => payload.model === 'deepseek-v4-pro'))
  assert.equal(isValidLearningPlan(result.result, result.result.sources), true)
})

test('多模态发送实际上传字节，按 sourceId 记回，转写和图示解读可区分', async () => {
  const bytes = await readFile(new URL('./fixtures/analysis-vision.png', import.meta.url))
  const { service, calls } = setup()
  const image = { sourceId: 'img', title: 'actual.png', type: 'image', file: new File([bytes], 'actual.png', { type: 'image/png' }) }
  const result = await service.readSources({ sources: [image] })
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.sources[0], { sourceId: 'img', title: 'actual.png', type: 'image', status: 'processed',
    extractedText: note + '\n\n【图示解读】\n角对齐' })
  assert.equal(calls[0].payload.model, 'deepseek-flash')
  assert.equal(calls[0].data[1].image_url.url, `data:image/png;base64,${bytes.toString('base64')}`)
})

test('图片失败后确认仅使用成功资料，短澄清不进入规划的事实输入', async () => {
  const { service, calls } = setup({ topic: ({ clarification }) => success(clarification ? topic : { status: 'needsClarification', question: '这是折纸吗？' }) })
  const image = { sourceId: 'img', title: 'broken.png', type: 'image', file: new File(['broken'], 'broken.png', { type: 'image/png' }) }
  const state = await startAnalysis([source, image], () => {}, service)
  assert.equal(state.phase, 'confirmation')
  assert.match(state.result.sources[1].error, /格式不符/)
  assert.equal(calls.length, 0)
  const before = await continueAnalysis({ sources: state.result.sources, confirmPartial: true }, () => {}, service)
  assert.equal(before.phase, 'clarification')
  const after = await continueAnalysis({ ...before, clarification: '是折纸' }, () => {}, service)
  assert.equal(after.phase, 'learning')
  assert.equal(after.result.sources[1].status, 'failed')
  const modelPlanInputs = JSON.parse(calls.find(({ stage }) => stage.includes('路线规划')).data)
  assert.deepEqual(modelPlanInputs.sources.map(({ sourceId }) => sourceId), [source.sourceId])
  assert.equal(modelPlanInputs.clarification, undefined)
})

test('冲突、伪造引用及其依赖均被移除，安全任务及有效起点仍可保留', async () => {
  const fake = { ...task, id: 'fake', sourceRefs: refs('不存在') }
  const clash = { ...task, id: 'clash' }
  const dependent = { ...task, id: 'dependent', prerequisiteTaskIds: ['clash'] }
  const { service, calls } = setup({
    plan: () => success({ ...proposal([clash, dependent, fake, task]), entryTaskId: clash.id }),
    review: ({ tasks }) => success({ verdicts: tasks.map(({ id }) => ({ id, verdict: id === clash.id ? 'conflict' : 'supported' })) }),
  })
  const result = await service.planLearning({ sources: [source] })
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.tasks.map(({ id }) => id), ['fold'])
  assert.equal(result.entryTaskId, 'fold')
  assert.match(result.notices[0], /冲突/)
  assert.ok(!JSON.parse(calls.at(-1).data).tasks.some(({ id }) => id === fake.id))
})

test('格式错误仅重试一次，无有效内容或缺少配置不会回退到 Mock', async () => {
  const invalid = setup({ plan: () => success('{malformed', true) })
  const malformed = await invalid.service.planLearning({ sources: [source] })
  assert.equal(malformed.status, 'unavailable')
  assert.equal(malformed.tasks, undefined)
  assert.equal(invalid.calls.filter(({ stage }) => stage.includes('路线规划')).length, 2)
  const allBlocked = setup({ review: () => success({ verdicts: [{ id: 'fold', verdict: 'conflict' }] }) })
  assert.equal((await allBlocked.service.planLearning({ sources: [source] })).status, 'unavailable')
  const missing = setup({}, {})
  const unavailable = await missing.service.planLearning({ sources: [source] })
  assert.match(unavailable.message, /密钥/)
  assert.equal(missing.calls.length, 0)
})

test('客户端再次校验模型引用，只使用输入批次而非返回的伪造原文', async () => {
  const service = createAnalysisService({ fetchImpl: async (_path, init) => Response.json(JSON.parse(init.body).action === 'identify'
    ? topic : { ...proposal(), mode: 'real', topic: topic.topic, supportedScope: '纸张', notices: [], sources: [source] }) })
  const altered = { ...source, text: '别的纸张资料' }
  const result = await service.planLearning({ sources: [altered] })
  assert.equal(result.status, 'unavailable')
  assert.match(result.message, /未通过校验/)
})

test('冲突导致模型整答拒绝时仅一次查找独立任务，保留冲突提示', async () => {
  const { service, calls } = setup({
    plan: ({ recoverIndependentTasks }) => success(recoverIndependentTasks ? proposal() :
      { status: 'unavailable', hasConflict: true, reason: '发现后续冲突' }),
  })
  const result = await service.planLearning({ sources: [source] })
  assert.equal(result.status, 'ready')
  assert.match(result.notices[0], /冲突/)
  assert.equal(calls.filter(({ stage }) => stage.includes('路线规划')).length, 2)
})
