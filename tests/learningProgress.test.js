import assert from 'node:assert/strict'
import test from 'node:test'
import { adjacentTaskIds, createLearningProgress, updateLearningProgress } from '../src/learningProgress.js'

const tasks = [{ id: 'posture' }, { id: 'chord' }, { id: 'strumming' }]
const start = (entryTaskId = 'posture') => createLearningProgress({ tasks, entryTaskId })
const update = (progress, type, taskId) => updateLearningProgress(tasks, progress, { type, taskId })

test('从 entryTaskId 开始，完成后按顺序进入下一项', () => {
  assert.equal(start('chord').currentTaskId, 'chord')
  const progress = start()
  assert.deepEqual(adjacentTaskIds(tasks, progress), { previousTaskId: null, nextTaskId: 'chord' })
  const next = update(progress, 'complete', 'posture')
  assert.deepEqual(next, { currentTaskId: 'chord', completedTaskIds: ['posture'], reviewTaskId: null })
  assert.deepEqual(progress, { currentTaskId: 'posture', completedTaskIds: [], reviewTaskId: null })
})

test('重复完成同一任务或回看时触发完成，都不会跳步', () => {
  const next = update(start(), 'complete', 'posture')
  assert.equal(update(next, 'complete', 'posture'), next)
  const review = update(next, 'review', 'posture')
  assert.equal(update(review, 'complete', 'chord'), review)
})

test('回看上一项或任一已完成项不改变进度，返回后恢复实际当前任务', () => {
  const next = update(update(start(), 'complete', 'posture'), 'complete', 'chord')
  const { previousTaskId: previous, nextTaskId } = adjacentTaskIds(tasks, next)
  assert.equal(previous, 'chord')
  assert.equal(nextTaskId, null)
  const previousReview = update(next, 'review', previous)
  assert.deepEqual(adjacentTaskIds(tasks, previousReview), { previousTaskId: 'posture', nextTaskId: 'strumming' })
  const otherReview = update(previousReview, 'review', 'posture')
  assert.equal(otherReview.currentTaskId, 'strumming')
  assert.equal(otherReview.reviewTaskId, 'posture')
  assert.equal(otherReview.completedTaskIds, next.completedTaskIds)
  assert.deepEqual(update(otherReview, 'returnToCurrent'), next)
})

test('最后一项完成后仍可回看所有任务，并可返回完成页', () => {
  const completed = tasks.reduce((progress, task) => update(progress, 'complete', task.id), start())
  assert.deepEqual(completed, { currentTaskId: null, completedTaskIds: tasks.map(({ id }) => id), reviewTaskId: null })
  assert.deepEqual(adjacentTaskIds(tasks, completed), { previousTaskId: null, nextTaskId: null })
  for (const { id } of tasks) {
    const review = update(completed, 'review', id)
    assert.equal(review.reviewTaskId, id)
    assert.equal(review.currentTaskId, null)
    assert.equal(review.completedTaskIds, completed.completedTaskIds)
    assert.deepEqual(update(review, 'returnToCurrent'), completed)
  }
})

test('非首项作为入口时保留其余未完成项，整条路线完成后才清空当前任务', () => {
  const next = update(start('chord'), 'complete', 'chord')
  assert.equal(next.currentTaskId, 'strumming')
  const remaining = update(next, 'complete', 'strumming')
  assert.equal(remaining.currentTaskId, 'posture')
  assert.equal(update(remaining, 'complete', 'posture').currentTaskId, null)
})

test('可以预览未完成任务，但不会改变实际进度或允许完成操作', () => {
  const progress = start()
  const preview = update(progress, 'review', 'chord')
  assert.deepEqual(preview, { ...progress, reviewTaskId: 'chord' })
  assert.deepEqual(adjacentTaskIds(tasks, preview), { previousTaskId: 'posture', nextTaskId: 'strumming' })
  assert.equal(update(preview, 'complete', 'chord'), preview)
  const current = update(preview, 'review', 'posture')
  assert.deepEqual(current, progress)
  assert.equal(update(current, 'complete', 'posture').currentTaskId, 'chord')
})

test('空路线、无效入口和未知任务不会误推进或回看', () => {
  const empty = createLearningProgress({ tasks: [], entryTaskId: 'posture' })
  assert.deepEqual(empty, { currentTaskId: null, completedTaskIds: [], reviewTaskId: null })
  assert.deepEqual(adjacentTaskIds([], empty), { previousTaskId: null, nextTaskId: null })
  assert.equal(updateLearningProgress([], empty, { type: 'complete', taskId: 'posture' }), empty)
  assert.deepEqual(start('missing'), empty)

  const progress = start()
  assert.equal(update(progress, 'complete', 'strumming'), progress)
  const invalid = { ...progress, currentTaskId: 'missing', completedTaskIds: ['missing'] }
  assert.equal(update(invalid, 'review', 'missing'), invalid)
  const missingTask = { ...progress, currentTaskId: 'missing' }
  assert.equal(update(missingTask, 'complete', 'missing'), missingTask)
})
