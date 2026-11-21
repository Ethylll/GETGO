import assert from 'node:assert/strict'
import test from 'node:test'
import { continueAnalysis as proceed, createAnalysisBatch, startAnalysis as start } from '../src/analysisFlow.js'
import * as mock from './fixtures/mockAnalysis.js'

const startAnalysis = (sources, stage) => start(sources, stage, mock)
const continueAnalysis = (request, stage) => proceed(request, stage, mock)

const posture = '把乐器放稳。练习前先放松肩膀。'
const guitar = (text = `吉他入门。${posture}`) => ({ id: 5, type: 'text', text })
const unknown = {
  id: 9,
  type: 'image',
  name: 'unknown.png',
  file: new File(['unknown'], 'unknown.png', { type: 'image/png' }),
}

test('提交快照保留全文和原始文件，正常分析按实际阶段推进', async () => {
  const input = [guitar(), unknown, { ...guitar(), id: 12 }]
  const batch = createAnalysisBatch(input)
  input[0].text = '修改后的草稿'
  assert.deepEqual(batch.map((source) => [source.sourceId, source.title]), [
    ['src_5', '文字资料 1'], ['src_9', 'unknown.png'], ['src_12', '文字资料 2'],
  ])
  assert.equal(batch[1].file, unknown.file)
  assert.equal(batch[0].text, `吉他入门。${posture}`)

  const stages = []
  const state = await startAnalysis([batch[0]], (stage) => stages.push(stage))
  assert.deepEqual(stages, ['reading', 'identifying', 'organizing', 'generating'])
  assert.equal(state.phase, 'learning')
  assert.equal(state.result.mode, 'mock')
  assert.equal(state.result.tasks.find((task) => task.id === state.result.entryTaskId)?.title, '先把吉他拿稳')
})

test('部分失败暂停在读取后，确认和澄清复用完整读取结果', async () => {
  const stages = []
  const record = (stage) => stages.push(stage)
  const state = await startAnalysis(createAnalysisBatch([guitar(posture), unknown]), record)
  assert.equal(state.phase, 'confirmation')
  assert.deepEqual(stages, ['reading'])
  assert.match(state.result.sources[1].error, /无法识别/)

  const confirmed = await continueAnalysis({ sources: state.result.sources, confirmPartial: true }, record)
  assert.equal(confirmed.phase, 'clarification')
  assert.equal(confirmed.confirmPartial, true)
  assert.equal(confirmed.sources, state.result.sources)
  assert.deepEqual(stages, ['reading', 'identifying'])

  const ready = await continueAnalysis({ ...confirmed, clarification: '是吉他' }, record)
  assert.equal(ready.phase, 'learning')
  assert.equal(ready.result.sources[1].status, 'failed')
  assert.deepEqual(stages, ['reading', 'identifying', 'identifying', 'organizing', 'generating'])
})

test('全部读取失败、澄清失败或无可靠路线时停在失败页', async () => {
  const stages = []
  const record = (stage) => stages.push(stage)
  assert.equal((await startAnalysis(createAnalysisBatch([unknown]), record)).phase, 'unavailable')
  assert.deepEqual(stages, ['reading'])

  const question = await startAnalysis(createAnalysisBatch([guitar(posture)]), record)
  assert.equal(question.phase, 'clarification')
  const unresolved = await continueAnalysis({ sources: question.sources, clarification: '不知道' }, record)
  assert.equal(unresolved.phase, 'unavailable')
  assert.match(unresolved.result.message, /仍无法可靠判断学习主题/)

  stages.length = 0
  const noRoute = await startAnalysis(createAnalysisBatch([guitar('我想学吉他。')]), record)
  assert.equal(noRoute.phase, 'unavailable')
  assert.deepEqual(stages, ['reading', 'identifying', 'organizing'])
})

test('统一入口拒绝的路线不会进入学习页', async () => {
  const [source] = createAnalysisBatch([guitar()])
  const processed = { ...source, status: 'processed' }
  const stages = []
  const state = await continueAnalysis({ sources: [processed, processed] }, (stage) => stages.push(stage))
  assert.deepEqual(stages, ['identifying', 'organizing', 'generating'])
  assert.equal(state.phase, 'unavailable')
  assert.equal(state.result.tasks, undefined)
  assert.match(state.result.message, /未通过校验/)
})
