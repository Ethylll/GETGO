import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createLearningProgress, updateLearningProgress } from '../src/learningProgress.js'
import { clearLearningSession, LEARNING_SESSION_KEY, loadLearningSession, saveLearningSession } from '../src/learningSessionStorage.js'
import { planLearning, readSources } from '../src/services/analysisService.js'

const original = '吉他入门。把乐器放稳。\n原文保留换行。Em 和弦：按住第五弦和第四弦的第二品。逐根拨弦，确认声音清楚。'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
}

async function learningPlan() {
  const bytes = await readFile(new URL('../src/mocks/fixtures/guitar-posture.png', import.meta.url))
  const read = await readSources({ sources: [
    { sourceId: 'text', type: 'text', title: '导入文字', text: original },
    { sourceId: 'image', type: 'image', title: '原图.png', file: new File([bytes], '原图.png') },
    { sourceId: 'failed', type: 'image', title: '未识别.png', file: new File(['unknown'], '未识别.png') },
  ] })
  const plan = await planLearning({ sources: read.sources, confirmPartial: true })
  assert.equal(plan.status, 'ready')
  return plan
}

test('首次保存完整校验结果，保留资料原文、提取文字、失败原因和引用', async () => {
  const storage = memoryStorage()
  const plan = await learningPlan()
  const progress = createLearningProgress(plan)
  assert.deepEqual(loadLearningSession(storage), { status: 'empty' })
  assert.equal(saveLearningSession(plan, progress, storage), true)

  const snapshot = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  assert.equal(snapshot.version, 1)
  assert.equal(snapshot.plan.mode, 'mock')
  assert.deepEqual(snapshot.plan, plan)
  assert.equal(snapshot.plan.sources[0].text, original)
  assert.equal(snapshot.plan.sources[1].extractedText, '吉他入门\n把乐器放稳。\n练习前先放松肩膀。')
  assert.equal(snapshot.plan.sources[2].status, 'failed')
  assert.match(snapshot.plan.sources[2].error, /无法识别/)
  assert.deepEqual(loadLearningSession(storage), {
    status: 'restored', plan, progress: { currentTaskId: 'posture', completedTaskIds: [] },
  })
})

test('恢复实际任务和已完成任务，省略回看、面板、对象 URL 和 File', async () => {
  const storage = memoryStorage()
  const plan = await learningPlan()
  const progress = updateLearningProgress(plan.tasks, createLearningProgress(plan), { type: 'complete', taskId: 'posture' })
  const review = updateLearningProgress(plan.tasks, progress, { type: 'review', taskId: 'posture' })
  const extendedPlan = {
    ...plan,
    openPanel: 'sources',
    sourcePreview: { sourceId: 'image' },
    sources: plan.sources.map((source) => ({ ...source, file: new File([], 'unsaved.png'), objectUrl: 'blob:temporary' })),
  }
  assert.equal(saveLearningSession(extendedPlan, review, storage), true)

  const loaded = loadLearningSession(storage)
  assert.deepEqual(loaded, { status: 'restored', plan, progress: { currentTaskId: 'chord', completedTaskIds: ['posture'] } })
  assert.doesNotMatch(storage.getItem(LEARNING_SESSION_KEY), /reviewTaskId|openPanel|sourcePreview|objectUrl|"file"|blob:temporary/)
})

test('全部完成后恢复完成状态，并保留完整路线以供回看', async () => {
  const storage = memoryStorage()
  const plan = await learningPlan()
  const progress = plan.tasks.reduce((state, { id }) => updateLearningProgress(plan.tasks, state, { type: 'complete', taskId: id }), createLearningProgress(plan))
  assert.equal(progress.currentTaskId, null)
  assert.equal(saveLearningSession(plan, progress, storage), true)
  const restored = loadLearningSession(storage)
  assert.equal(restored.status, 'restored')
  assert.deepEqual(restored.plan.tasks, plan.tasks)
  assert.deepEqual(restored.progress, { currentTaskId: null, completedTaskIds: ['posture', 'chord'] })
})

test('损坏 JSON 和未知版本保留原记录，显式清除后才重新开始', () => {
  const storage = memoryStorage()
  for (const [raw, reason] of [['not JSON', 'data'], ['null', 'data'], ['{"version":99}', 'version']]) {
    storage.setItem(LEARNING_SESSION_KEY, raw)
    assert.deepEqual(loadLearningSession(storage), { status: 'invalid', reason })
    assert.equal(storage.getItem(LEARNING_SESSION_KEY), raw)
  }
  assert.equal(clearLearningSession(storage), true)
  assert.deepEqual(loadLearningSession(storage), { status: 'empty' })
})

test('拦截不存在或重复的任务 ID、无效来源和引用，且保留原记录', async () => {
  const storage = memoryStorage()
  const plan = await learningPlan()
  const mutations = [
    (snapshot) => { snapshot.currentTaskId = 'missing' },
    (snapshot) => { snapshot.currentTaskId = null },
    (snapshot) => { snapshot.completedTaskIds = ['missing'] },
    (snapshot) => { snapshot.completedTaskIds = ['chord', 'chord'] },
    (snapshot) => { snapshot.completedTaskIds = ['posture'] },
    (snapshot) => { snapshot.plan.sources[0].sourceId = 'unlinked' },
    (snapshot) => { snapshot.plan.tasks[0].steps[0].sourceRefs[0].excerpt = '无效引文' },
  ]
  for (const mutate of mutations) {
    const snapshot = { version: 1, plan: structuredClone(plan), currentTaskId: 'posture', completedTaskIds: [] }
    mutate(snapshot)
    const raw = JSON.stringify(snapshot)
    storage.setItem(LEARNING_SESSION_KEY, raw)
    assert.deepEqual(loadLearningSession(storage), { status: 'invalid', reason: 'data' })
    assert.equal(storage.getItem(LEARNING_SESSION_KEY), raw)
  }
})

test('存储不可访问或空间不足时不抛出，也不会改动内存中的进度', async () => {
  const plan = await learningPlan()
  const progress = createLearningProgress(plan)
  const error = () => { throw new Error('Storage unavailable') }
  assert.deepEqual(loadLearningSession({ getItem: error }), { status: 'unavailable' })
  assert.equal(clearLearningSession({ removeItem: error }), false)
  assert.equal(saveLearningSession(plan, progress, { setItem: error }), false)
  assert.deepEqual(progress, createLearningProgress(plan))
})
