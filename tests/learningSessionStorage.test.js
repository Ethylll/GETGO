import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createLearningProgress, updateLearningProgress } from '../src/learningProgress.js'
import { clearLearningSession, LEARNING_SESSION_KEY, loadLearningSession, saveLearningSession } from '../src/learningSessionStorage.js'
import { planLearning, readSources } from '../src/services/analysisService.js'
import { taskChatHistory } from '../src/chatMessages.js'

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

test('刷新后恢复答疑历史和引用，按任务筛选上下文，未完成请求恢复为已中断', async () => {
  const storage = memoryStorage()
  const plan = await learningPlan()
  const base = { createdAt: 1730000000000, status: 'answered' }
  const first = { ...base, id: 'a', taskId: 'posture', question: '如何持琴？', answer: '把乐器放稳。', citations: [{ sourceId: 'text', excerpt: '把乐器放稳。' }] }
  const nextRef = plan.tasks[1].sourceRefs[0]
  const second = { ...base, id: 'b', taskId: 'chord', question: '和弦怎么按？', answer: nextRef.excerpt, citations: [nextRef] }
  const pending = { ...base, id: 'pending', taskId: 'posture', question: '接下来呢？', status: 'pending', request: { temporary: 'discard' } }
  assert.equal(saveLearningSession(plan, { ...createLearningProgress(plan), messages: [first, second, pending] }, storage), true)

  const loaded = loadLearningSession(storage)
  assert.deepEqual(loaded.messages.slice(0, 2), [first, second])
  assert.deepEqual(loaded.messages[2], { id: pending.id, taskId: 'posture', question: pending.question, status: 'interrupted', createdAt: pending.createdAt, answer: '', citations: [] })
  assert.deepEqual(taskChatHistory(loaded.messages, 'posture'), [{ taskId: 'posture', question: first.question, answer: first.answer }])
  assert.doesNotMatch(storage.getItem(LEARNING_SESSION_KEY), /temporary|"request"/)

  const oldSnapshot = JSON.parse(storage.getItem(LEARNING_SESSION_KEY))
  oldSnapshot.messages[0].citations[0].excerpt = '无效引文'
  storage.setItem(LEARNING_SESSION_KEY, JSON.stringify(oldSnapshot))
  const recovered = loadLearningSession(storage)
  assert.equal(recovered.progress.currentTaskId, 'posture')
  assert.deepEqual(recovered.messages.map(({ id }) => id), ['b', 'pending'])
})

test('自然语言和部分回答可原样刷新和追问，旧摘录兼容，伪造引用丢弃', async () => {
  const storage = memoryStorage()
  const plan = await learningPlan()
  const progress = createLearningProgress(plan)
  const base = { taskId: 'posture', createdAt: 12, question: '我怎么把琴拿稳？',
    citations: [{ sourceId: 'text', excerpt: '把乐器放稳。' }] }
  const messages = [
    { ...base, id: 'natural', status: 'answered', answer: '先让琴身稳住。' },
    { ...base, id: 'partial', status: 'partial', answer: '资料建议先把琴扶稳。' },
    { ...base, id: 'original', status: 'answered', answer: '把乐器放稳。' },
  ]
  const forged = { ...base, id: 'forged', status: 'answered', answer: '假的', citations: [{ sourceId: 'text', excerpt: '错误引用' }] }
  assert.equal(saveLearningSession(plan, { ...progress, messages: [...messages, forged] }, storage), true)
  const restored = loadLearningSession(storage)
  assert.deepEqual(restored.messages, messages)
  assert.deepEqual(taskChatHistory(restored.messages, 'posture').map(({ answer }) => answer), messages.map(({ answer }) => answer))
  assert.deepEqual(taskChatHistory(restored.messages, 'chord'), [])
})
