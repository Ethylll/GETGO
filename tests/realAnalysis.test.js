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

const timing = { unit: 'learningDay', interval: 2, basis: 'recommendation' }
const practice = {
  startCondition: 'immediate', frequency: timing, reviewAfter: { ...timing, interval: 3 },
  longTermGoal: '让折痕稳定平整', reviewCriteria: { stop: '达到学习目标后再复核', reduce: '减量复核', adjust: '折痕仍歪斜时调整' },
}
const asV2 = (data, extra = {}) => ({ ...data, type: 'oneTime', status: 'notStarted',
  estimatedMinutes: 8, completionCriteria: '折痕平整且两角对齐', prerequisiteGates: [], ...extra })
const recurring = asV2(task, { id: 'repeat', type: 'recurring', practice })

test('显式请求 V2，保留两类任务、建议来源和并行路线，V1 默认协议仍可用', async () => {
  const { service, calls } = setup({
    plan: ({ planVersion }) => success(planVersion === 2
      ? proposal([asV2(task, { status: 'completed' }), recurring]) : proposal()),
    review: ({ tasks, planVersion, dailyLimits }) => {
      if (planVersion === 2) {
        assert.deepEqual(dailyLimits, { minutes: 30, tasks: 5 })
        assert.deepEqual(tasks.flatMap(({ prerequisiteTaskIds }) => prerequisiteTaskIds), [])
        assert.equal(tasks[0].status, 'notStarted')
      }
      return success({ verdicts: tasks.map(({ id }) => ({ id, verdict: 'supported' })) })
    },
  })
  const v2 = await service.planLearning({ sources: [source], planVersion: 2 })
  assert.equal(v2.planVersion, 2)
  assert.deepEqual(v2.tasks.map(({ type }) => type), ['oneTime', 'recurring'])
  assert.equal(v2.tasks[0].status, 'notStarted')
  assert.equal(v2.tasks[0].completionCriteria, '折痕平整且两角对齐')
  assert.deepEqual(v2.tasks[1].practice, practice)
  assert.equal(isValidLearningPlan(v2, [source]), true)
  assert.equal(calls.length, 3)

  const v1 = await service.planLearning({ sources: [source] })
  assert.equal(v1.status, 'ready')
  assert.equal(v1.planVersion, undefined)
  assert.equal(v1.tasks[0].type, undefined)
  assert.equal(JSON.parse(calls[4].data).planVersion, undefined)
  assert.match(calls[1].payload.messages[0].content, /prerequisiteGates/)
  assert.doesNotMatch(calls[4].payload.messages[0].content, /prerequisiteGates/)
  assert.doesNotMatch(calls[5].payload.messages[0].content, /## V2/)
})

test('V2 字段、频率来源和明确解锁门槛通过双端校验', async () => {
  const textWithInterval = { ...source, text: note + '每隔48小时重复一次。' }
  const natural = { ...practice, frequency: { unit: 'learningDay', interval: 2, basis: 'source',
    sourceRefs: refs('每隔48小时重复一次。') } }
  const tasks = [
    asV2(recurring, { type: 'recurring', practice: natural }),
    asV2(task, { prerequisiteTaskIds: ['repeat'], prerequisiteGates: [
      { taskId: 'repeat', kind: 'selfCheckFeedback', criterion: '观察折痕是否平整' },
    ] }),
    asV2(task, { id: 'next', prerequisiteTaskIds: ['repeat'], prerequisiteGates: [{ taskId: 'repeat', kind: 'practiceCompletion' }] }),
  ]
  const { service } = setup({
    plan: () => success(proposal(tasks)),
    review: ({ tasks: candidates }) => {
      assert.equal(candidates[0].practice.frequency.unit, 'elapsedMinutes')
      assert.equal(candidates[0].practice.frequency.interval, 2880)
      return success({ verdicts: candidates.map(({ id }) => ({ id, verdict: 'supported' })) })
    },
  })
  const plan = await service.planLearning({ sources: [textWithInterval], planVersion: 2 })
  assert.equal(plan.status, 'ready')
  assert.equal(plan.entryTaskId, 'repeat')
  assert.equal(plan.tasks[0].practice.frequency.interval, 2880)
  assert.equal(plan.tasks[1].prerequisiteGates[0].kind, 'selfCheckFeedback')
  assert.equal(plan.tasks[2].prerequisiteGates[0].kind, 'practiceCompletion')
  for (const mutate of [
    (p) => { delete p.tasks[0].completionCriteria },
    (p) => { p.tasks[0].estimatedMinutes = 31 },
    (p) => { p.tasks[0].practice.startCondition = 'afterPrerequisites' },
    (p) => { p.tasks[0].practice.frequency.basis = 'recommendation' },
    (p) => { Object.assign(p.tasks[0].practice.frequency, { unit: 'learningDay', interval: 2 }) },
    (p) => { p.tasks[0].practice.frequency.interval = 1440 },
    (p) => { p.tasks[0].practice.frequency.sourceRefs = refs('伪造间隔') },
    (p) => { p.tasks[0].practice.reviewAfter.sourceRefs = refs() },
    (p) => { p.tasks[0].practice.reviewAfter.interval = 0 },
    (p) => { delete p.tasks[0].practice.longTermGoal },
    (p) => { delete p.tasks[0].practice.reviewCriteria.stop },
    (p) => { p.tasks[1].prerequisiteGates = [] },
    (p) => { p.tasks[1].prerequisiteGates[0].kind = 'masteredByCount' },
    (p) => { p.tasks[2].prerequisiteGates[0].taskId = 'unknown' },
    (p) => { p.entryTaskId = 'next' },
  ]) {
    const invalid = structuredClone(plan)
    mutate(invalid)
    assert.equal(isValidLearningPlan(invalid, [textWithInterval]), false)
  }
})

test('V2 移除循环、无效前置、伪造周期引用和未通过独立核验的任务及依赖', async () => {
  const { service, calls } = setup({
    plan: () => success(proposal([
      asV2(task, { id: 'self', prerequisiteTaskIds: ['self'] }),
      asV2(task, { id: 'cycleA', prerequisiteTaskIds: ['cycleB'] }),
      asV2(task, { id: 'cycleB', prerequisiteTaskIds: ['cycleA'] }),
      asV2(task, { id: 'missing', prerequisiteTaskIds: ['not-defined'] }),
      asV2(recurring, { type: 'recurring', practice: { ...practice, frequency: { ...timing, basis: 'source', sourceRefs: refs('伪造频率') } } }),
      asV2(recurring, { id: 'veto', type: 'recurring', practice }),
      asV2(task, { id: 'requires-veto', prerequisiteTaskIds: ['veto'], prerequisiteGates: [{ taskId: 'veto', kind: 'practiceCompletion' }] }),
      asV2(task),
    ])),
    review: ({ tasks }) => {
      assert.deepEqual(tasks.map(({ id }) => id), ['veto', 'requires-veto', 'fold'])
      return success({ verdicts: tasks.map(({ id }) => ({ id, verdict: id === 'veto' ? 'unsupported' : 'supported' })) })
    },
  })
  const result = await service.planLearning({ sources: [source], planVersion: 2 })
  assert.equal(result.status, 'ready')
  assert.deepEqual(result.tasks.map(({ id }) => id), ['fold'])
  assert.equal(calls.length, 4)
  assert.equal(JSON.parse(calls[2].data).repairEvidence, true)
})

test('客户端拒绝旧版或未满足 V2 字段的计划，API 拦截未知协议', async () => {
  const v1Plan = { ...proposal(), status: 'ready', mode: 'real', topic: topic.topic, supportedScope: '折纸', notices: [] }
  for (const envelope of [v1Plan, { ...v1Plan, planVersion: 2 }]) {
    const service = createAnalysisService({ fetchImpl: async (_path, init) => Response.json(JSON.parse(init.body).action === 'identify' ? topic : envelope) })
    const result = await service.planLearning({ sources: [source], planVersion: 2 })
    assert.equal(result.status, 'unavailable')
    assert.equal(result.tasks, undefined)
  }
  const { transport, calls } = setup()
  const response = await transport('/api/analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'plan', topic: topic.topic, sources: [source], planVersion: 3 }) })
  assert.equal(response.status, 400)
  assert.equal(calls.length, 0)
})
