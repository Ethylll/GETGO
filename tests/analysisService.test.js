import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { planLearning, readSources } from '../src/services/analysisService.js'
import { isValidLearningPlan } from '../src/services/validateLearningPlan.js'

const posture = '把乐器放稳。练习前先放松肩膀。'
const chord = 'Em 和弦：按住第五弦和第四弦的第二品。逐根拨弦，确认声音清楚。'
const strumming = '在空弦上先练下拨。下拨练习后再练上拨。'
const reverseStrumming = '在空弦上先练上拨，再练下拨。'
const text = (sourceId, content) => ({ sourceId, title: sourceId, type: 'text', text: content })
const image = (sourceId, bytes, title = 'guitar-posture.png') => ({
  sourceId,
  title,
  type: 'image',
  file: new File([bytes], title, { type: 'image/png' }),
})

async function planFrom(sources) {
  const read = await readSources({ sources })
  return planLearning({ sources: read.sources })
}

function fullRouteSources() {
  return [
    text('import-11', `吉他入门。${posture}Em 和弦：按住第五弦和第四弦的第二品。`),
    text('import-27', `逐根拨弦，确认声音清楚。${strumming}`),
  ]
}

test('正常生成吉他路线，保留前置关系和各步骤的实际来源 ID', async () => {
  const plan = await planFrom(fullRouteSources())

  assert.equal(plan.mode, 'mock')
  assert.equal(plan.status, 'ready')
  assert.equal(plan.topic, '吉他入门')
  assert.equal(plan.entryTaskId, 'posture')
  assert.deepEqual(plan.tasks.map(({ id }) => id), ['posture', 'chord', 'strumming'])
  assert.deepEqual(plan.tasks[1].prerequisiteTaskIds, ['posture'])
  assert.deepEqual(plan.knowledgePoints[1].prerequisiteIds, ['kp_posture'])
  assert.deepEqual(plan.tasks[1].steps.map(({ sourceRefs }) => sourceRefs[0].sourceId), ['import-11', 'import-27'])
  assert.equal(isValidLearningPlan(plan, plan.sources), true)
  assert.deepEqual(plan.coverageGaps, [])
})

test('主题不明确时澄清，答复可确定主题但不能作为资料依据', async () => {
  const { sources } = await readSources({ sources: [text('ambiguous', posture)] })
  const request = await planLearning({ sources })
  assert.equal(request.status, 'needsClarification')
  assert.match(request.question, /吉他/)
  assert.equal(request.tasks, undefined)

  const plan = await planLearning({ sources, clarification: '是吉他入门' })
  assert.equal(plan.status, 'ready')
  assert.ok(plan.tasks[0].sourceRefs.every((ref) => ref.sourceId === 'ambiguous'))
  assert.equal((await planLearning({ sources, clarification: '不知道' })).status, 'unavailable')

  const unrelated = await readSources({ sources: [text('unrelated', '蛋糕要等冷却后再脱模。')] })
  assert.equal((await planLearning({ sources: unrelated.sources, clarification: `吉他入门。${posture}` })).status, 'unavailable')
})

test('部分识别失败须先确认，继续后保留逐份失败原因', async () => {
  const read = await readSources({ sources: [text('known', `吉他入门。${posture}`), image('unknown', 'other bytes')] })
  assert.equal(read.status, 'ready')
  assert.equal(read.requiresConfirmation, true)
  assert.deepEqual(read.sources.map(({ status }) => status), ['processed', 'failed'])
  assert.match(read.sources[1].error, /Mock/)

  const blocked = await planLearning({ sources: read.sources })
  assert.equal(blocked.status, 'unavailable')
  assert.equal(blocked.requiresConfirmation, true)
  const plan = await planLearning({ sources: read.sources, confirmPartial: true })
  assert.equal(plan.status, 'ready')
  assert.equal(plan.sources[1].status, 'failed')
  assert.ok(plan.tasks[0].sourceRefs.every((ref) => ref.sourceId === 'known'))
})

test('部分覆盖仅返回有资料及完整前置关系的任务', async () => {
  const plan = await planFrom([text('entry', `吉他入门。${posture}`)])
  assert.equal(plan.status, 'ready')
  assert.equal(plan.supportedScope, '持琴姿势')
  assert.equal(plan.coverageGaps.length, 2)
  assert.deepEqual(plan.tasks.map(({ id }) => id), ['posture'])

  const missingPrerequisite = await planFrom([text('next', `吉他入门。${chord}${strumming}`)])
  assert.deepEqual(missingPrerequisite.tasks.map(({ id }) => id), ['strumming'])
  assert.equal(missingPrerequisite.entryTaskId, 'strumming')
})

test('关键冲突省略受影响任务，剩余路线无效时拒绝生成', async () => {
  const conflict = text('reverse', reverseStrumming)
  const remaining = await planFrom([...fullRouteSources(), conflict])
  assert.equal(remaining.status, 'ready')
  assert.deepEqual(remaining.tasks.map(({ id }) => id), ['posture', 'chord'])
  assert.deepEqual(remaining.notices, ['部分内容因资料冲突未纳入本次学习计划。'])

  const alone = [text('strumming', `吉他入门。${strumming}`)]
  assert.equal((await planFrom(alone)).status, 'ready')
  const blocked = await planFrom([...alone, conflict])
  assert.equal(blocked.status, 'unavailable')
  assert.equal(blocked.tasks, undefined)
  assert.match(blocked.message, /无法生成可靠/)
})

test('空批次、空白文本、未知图片和缺少任务依据的文本不能生成路线', async () => {
  assert.equal((await readSources({ sources: [] })).status, 'unavailable')

  const read = await readSources({ sources: [text('blank', ' \n '), image('unknown', 'random bytes')] })
  assert.equal(read.status, 'unavailable')
  assert.ok(read.sources.every((source) => source.status === 'failed' && source.error))
  assert.equal((await planLearning({ sources: read.sources })).status, 'unavailable')

  const plan = await planFrom([text('only-keyword', '我想学吉他。')])
  assert.equal(plan.status, 'unavailable')
  assert.equal(plan.tasks, undefined)
})

test('只匹配登记 PNG 的实际内容，保留上传时的来源 ID 和名称', async () => {
  const fixture = await readFile(new URL('../src/mocks/fixtures/guitar-posture.png', import.meta.url))
  const read = await readSources({ sources: [image('my-image', fixture, 'renamed.png'), image('lookalike', 'other bytes')] })
  assert.equal(read.sources[0].status, 'processed')
  assert.equal(read.sources[0].title, 'renamed.png')
  assert.equal(read.sources[1].status, 'failed')
  assert.equal(read.sources[1].extractedText, undefined)

  const plan = await planLearning({ sources: read.sources, confirmPartial: true })
  assert.equal(plan.status, 'ready')
  assert.ok(plan.tasks[0].sourceRefs.every((ref) => ref.sourceId === 'my-image' && read.sources[0].extractedText.includes(ref.excerpt)))
})

test('拒绝不存在、未处理或引用片段不匹配的来源', async () => {
  const plan = await planFrom(fullRouteSources())
  const [first, second] = plan.sources
  assert.equal(isValidLearningPlan(plan, [{ ...first, status: 'failed' }, second]), false)
  assert.equal(isValidLearningPlan(plan, [{ ...first, sourceId: 'outside-batch' }, second]), false)
  assert.equal(isValidLearningPlan(plan, [{ ...first, text: '吉他资料缺少引文' }, second]), false)

  const invalidStep = structuredClone(plan)
  invalidStep.tasks[0].steps[0].sourceRefs[0] = { sourceId: first.sourceId, excerpt: '伪造的引文' }
  assert.equal(isValidLearningPlan(invalidStep, plan.sources), false)

  const noTaskRefs = structuredClone(plan)
  noTaskRefs.tasks[0].sourceRefs = []
  assert.equal(isValidLearningPlan(noTaskRefs, plan.sources), false)
})

test('拒绝无效的步骤数量、起始任务和前置任务关系', async () => {
  const original = await planFrom(fullRouteSources())
  const mutations = [
    (plan) => { plan.tasks[0].steps.length = 1 },
    (plan) => { plan.tasks[0].steps = Array(6).fill(plan.tasks[0].steps[0]) },
    (plan) => { plan.entryTaskId = 'missing-task' },
    (plan) => { plan.tasks[1].prerequisiteTaskIds = ['missing-task'] },
    (plan) => { plan.tasks[0].prerequisiteTaskIds = ['chord'] },
    (plan) => { plan.knowledgePoints[1].prerequisiteIds = ['missing-point'] },
  ]

  for (const mutate of mutations) {
    const plan = structuredClone(original)
    mutate(plan)
    assert.equal(isValidLearningPlan(plan, original.sources), false)
  }
})

test('统一入口拦截未通过校验的结果，不返回任务', async () => {
  const read = await readSources({ sources: fullRouteSources() })
  const duplicate = await readSources({ sources: [fullRouteSources()[0], fullRouteSources()[0]] })
  assert.equal(duplicate.status, 'unavailable')

  const result = await planLearning({ sources: [...read.sources, read.sources[0]] })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.tasks, undefined)
  assert.match(result.message, /未通过校验/)
})
