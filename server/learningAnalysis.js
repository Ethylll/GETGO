import { readFile } from 'node:fs/promises'
import {
  DEFAULT_LEARNING_DAY_LIMITS, explicitElapsedMinutes, hasValidSourceRefs, indexSourceEvidence, isValidLearningPlan, isValidV2Task,
} from '../src/services/validateLearningPlan.js'
import { sourceText } from '../src/learningSources.js'

const endpoint = 'https://api.deepseek.com/chat/completions'
const flash = 'deepseek-flash'
export const MAX_ANALYSIS_TEXT = 60_000
export const MAX_ANALYSIS_IMAGE = 4 * 1024 * 1024
const conflictNotice = '部分内容因资料冲突未纳入本次学习计划。'
const noPlan = '现有资料不足，无法生成可靠的学习计划。'

const prompts = {
  image: new URL('./prompts/analysis.image.md', import.meta.url),
  identify: new URL('./prompts/analysis.topic.md', import.meta.url),
  plan: new URL('./prompts/analysis.plan.md', import.meta.url),
  review: new URL('./prompts/analysis.review.md', import.meta.url),
}
const v2PromptSection = '\n## V2 任务协议'

export function boundedText(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit
}

function stringList(value, limit = 12, itemLimit = 350) {
  return Array.isArray(value) && value.length <= limit && value.every((item) => boundedText(item, itemLimit))
}

function hasIds(items) {
  return items.every((item) => boundedText(item?.id, 80)) &&
    new Set(items.map(({ id }) => id)).size === items.length
}

export function cleanSources(sources) {
  if (!Array.isArray(sources) || sources.length > 10) return null
  const ids = new Set()
  let total = 0
  const result = []
  for (const source of sources) {
    if (!boundedText(source?.sourceId, 100) || ids.has(source.sourceId) || !boundedText(source.title, 255) ||
      !['text', 'image'].includes(source.type) || !['processed', 'failed'].includes(source.status)) return null
    const { sourceId, title, type, status } = source
    const row = { sourceId, title, type, status }
    if (status === 'processed') {
      const text = sourceText(source)
      if (!text) return null
      total += text.length
      if (total > MAX_ANALYSIS_TEXT) return { tooLarge: true }
      row[type === 'text' ? 'text' : 'extractedText'] = text
    } else {
      row.error = boundedText(source.error, 350) ? source.error : '这份资料未能读取。'
      // Retain the original text of a failed text input when present.
      if (type === 'text' && typeof source.text === 'string') {
        if (source.text.length > MAX_ANALYSIS_TEXT) return { tooLarge: true }
        row.text = source.text
      }
    }
    ids.add(sourceId)
    result.push(row)
  }
  return result
}

export function analysisResult(status, sources, details = {}) {
  return { status, mode: 'real', sources, notices: [], ...details }
}

class ModelError extends Error {
  constructor(status) {
    super('Invalid upstream response')
    this.status = status
  }
}

export function createAnalysisModel({ key, model, fetchImpl, signal }) {
  return async function request(stage, content, maxTokens, validate) {
    const prompt = await readFile(prompts[stage], 'utf8')
    const system = content.planVersion === 2 ? prompt : prompt.split(v2PromptSection)[0]
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetchImpl(endpoint, {
        method: 'POST', redirect: 'error', signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: stage === 'image' ? flash : model,
          thinking: { type: 'disabled' }, response_format: { type: 'json_object' },
          max_tokens: maxTokens, stream: false,
          messages: [
            { role: 'system', content: system + (attempt ? '\n请仅输出符合规定结构的完整 JSON。' : '') },
            { role: 'user', content: typeof content === 'object' && !Array.isArray(content) ? JSON.stringify(content) : content },
          ],
        }),
      })
      if (!response.ok) throw new ModelError(response.status)
      const choice = (await response.json()).choices?.[0]
      if (choice?.finish_reason === 'content_filter' && stage === 'image') {
        return { status: 'unreadable', reason: '图片未通过模型内容检查。' }
      }
      if (choice?.finish_reason !== 'stop') continue
      try {
        const output = JSON.parse(choice.message.content)
        if (validate(output)) return output
      } catch {
        // Give an incomplete or malformed model reply one bounded retry.
      }
    }
    throw new ModelError(502)
  }
}

export async function extractImage(request, image) {
  const data = await image.arrayBuffer()
  const head = Buffer.from(data).subarray(0, 12)
  const formats = {
    'image/png': head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': head.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'image/webp': head.toString('ascii', 0, 4) === 'RIFF' && head.toString('ascii', 8, 12) === 'WEBP',
  }
  if (!formats[image.type]) return { status: 'failed', error: '图片内容与 PNG、JPG 或 WebP 格式不符。' }
  const output = await request('image', [
    { type: 'text', text: '读取此图中实际可见的学习内容。' },
    { type: 'image_url', image_url: { url: `data:${image.type};base64,${Buffer.from(data).toString('base64')}`, detail: 'high' } },
  ], 3000, (value) => value?.status === 'unreadable' && boundedText(value.reason, 350) ||
    value?.status === 'readable' && typeof value.transcript === 'string' && typeof value.visualNotes === 'string' &&
    value.transcript.length <= 8000 && value.visualNotes.length <= 3000)
  if (output.status === 'unreadable') return { status: 'failed', error: output.reason }
  const extractedText = [output.transcript.trim(), output.visualNotes.trim() && `【图示解读】\n${output.visualNotes.trim()}`]
    .filter(Boolean).join('\n\n')
  return extractedText ? { status: 'processed', extractedText } : { status: 'failed', error: '图片中未找到可辨认的学习内容。' }
}

export async function identifyLearning(request, sources, clarification) {
  const output = await request('identify', { sources: evidenceFor(sources), clarification }, 1300, (value) =>
    value?.status === 'ready' && boundedText(value.topic, 160) && stringList(value.domains, 8, 120) && boundedText(value.relationship, 600) ||
    value?.status === 'needsClarification' && boundedText(value.question, 220) ||
    value?.status === 'unavailable' && boundedText(value.reason, 350))
  if (output.status === 'needsClarification') {
    return clarification ? analysisResult('unavailable', sources, { message: '仍无法可靠判断学习主题，请补充有教学内容的资料后重试。' })
      : analysisResult('needsClarification', sources, { question: output.question })
  }
  return output.status === 'ready' ? analysisResult('ready', sources, {
    topic: output.topic, domains: output.domains, relationship: output.relationship,
  }) : analysisResult('unavailable', sources, { message: output.reason })
}

function evidenceFor(sources) {
  return sources.filter(({ status }) => status === 'processed').map(({ sourceId, title, type, text, extractedText }) =>
    ({ sourceId, title, type, text: type === 'text' ? text : extractedText }))
}

function practiceIntervalRefs(refs, evidenceById) {
  return (Array.isArray(refs) ? refs : []).filter((ref) => hasValidSourceRefs([ref], evidenceById) &&
    explicitElapsedMinutes([ref]).length > 0)
}

function initializeV2Task(proposal, evidenceById) {
  const task = { ...proposal, status: 'notStarted' }
  const frequency = task.practice?.frequency
  if (task.type !== 'recurring' || !frequency) return task
  const directFrequency = frequency.basis === 'source' && hasValidSourceRefs(frequency.sourceRefs, evidenceById)
    ? frequency.sourceRefs
    : frequency.basis === 'recommendation' ? practiceIntervalRefs(task.sourceRefs, evidenceById) : []
  const intervals = new Set(explicitElapsedMinutes(directFrequency))
  if (intervals.size === 1) {
    const [interval] = intervals
    task.practice = { ...task.practice, frequency: { unit: 'elapsedMinutes', interval, basis: 'source', sourceRefs: directFrequency } }
  }
  const review = task.practice.reviewAfter
  if (review?.basis === 'source' && hasValidSourceRefs(review.sourceRefs, evidenceById)) {
    const reviewIntervals = new Set(explicitElapsedMinutes(review.sourceRefs, 'reviewAfter'))
    if (reviewIntervals.size === 1) {
      const [interval] = reviewIntervals
      task.practice = { ...task.practice, reviewAfter: { ...review, unit: 'elapsedMinutes', interval } }
    } else if (intervals.size === 1 && practiceIntervalRefs(review.sourceRefs, evidenceById).length === review.sourceRefs.length) {
      task.practice = { ...task.practice, reviewAfter: { unit: 'learningDay', interval: 3, basis: 'recommendation' } }
    }
  }
  return task
}

// Validate each node against independent evidence, then keep only nodes whose dependencies survived.
export function prunePlan(draft, sources, rejected = new Set(), planVersion = 1, issues) {
  const evidenceById = indexSourceEvidence(sources)
  const points = new Map()
  const tasks = new Map()
  const orderedTasks = []
  for (const point of draft.knowledgePoints) {
    if (boundedText(point.title, 240) && Array.isArray(point.prerequisiteIds) &&
      point.prerequisiteIds.every((id) => points.has(id)) && hasValidSourceRefs(point.sourceRefs, evidenceById)) {
      points.set(point.id, point)
    } else issues?.push({ pointId: point.id, code: 'point_evidence_or_dependency' })
  }
  for (const proposal of draft.tasks) {
    const task = planVersion === 2 ? initializeV2Task(proposal, evidenceById) : proposal
    if (rejected.has(task.id)) continue
    if (!Array.isArray(task.prerequisiteTaskIds) || !task.prerequisiteTaskIds.every((id) => tasks.has(id))) {
      issues?.push({ taskId: task.id, code: 'task_dependency' })
      continue
    }
    if (!Array.isArray(task.knowledgePointIds) || !task.knowledgePointIds.length || !task.knowledgePointIds.every((id) => points.has(id))) {
      issues?.push({ taskId: task.id, code: 'task_knowledge_point' })
      continue
    }
    if (!boundedText(task.title, 240) || !boundedText(task.objective, 350) ||
      !hasValidSourceRefs(task.sourceRefs, evidenceById) || !Array.isArray(task.steps) ||
      task.steps.length < 2 || task.steps.length > 5 || !task.steps.every((step) =>
        boundedText(step?.text, 350) && hasValidSourceRefs(step.sourceRefs, evidenceById))) {
      issues?.push({ taskId: task.id, code: 'task_evidence_or_steps' })
      continue
    }
    if (planVersion === 2 && !isValidV2Task(task,
      task.prerequisiteTaskIds.filter((id) => tasks.get(id).type === 'recurring'), evidenceById)) {
      issues?.push({ taskId: task.id, code: 'task_v2_fields' })
      continue
    }
    tasks.set(task.id, task)
    orderedTasks.push(task)
  }
  const usedPoints = new Set(orderedTasks.flatMap((task) => task.knowledgePointIds))
  for (const point of [...points.values()].reverse()) {
    if (usedPoints.has(point.id)) for (const parentId of point.prerequisiteIds) usedPoints.add(parentId)
  }
  const knowledgePoints = [...points.values()].filter(({ id }) => usedPoints.has(id))
  const entry = orderedTasks.find((task) => task.id === draft.entryTaskId && !task.prerequisiteTaskIds.length) ??
    orderedTasks.find((task) => !task.prerequisiteTaskIds.length)
  return { tasks: orderedTasks, knowledgePoints, entryTaskId: entry?.id }
}

export async function generateLearningPlan(request, sources, topic, planVersion = 1) {
  const evidence = evidenceFor(sources)
  const isDraft = (value) =>
    value?.status === 'unavailable' && boundedText(value.reason, 350) && typeof value.hasConflict === 'boolean' ||
    value?.status === 'ready' && Array.isArray(value.tasks) && value.tasks.length > 0 && value.tasks.length <= 20 &&
    hasIds(value.tasks) && Array.isArray(value.knowledgePoints) && value.knowledgePoints.length <= 40 &&
    hasIds(value.knowledgePoints) && boundedText(value.entryTaskId, 80) && stringList(value.coverageGaps) &&
    typeof value.hasConflict === 'boolean'
  const protocol = planVersion === 2 ? { planVersion, dailyLimits: DEFAULT_LEARNING_DAY_LIMITS } : {}
  const input = { topic, sources: evidence, ...protocol }
  const prune = (draft, rejected, issues) => prunePlan(draft, sources, rejected, planVersion, issues)
  const initial = await request('plan', input, 9500, isDraft)
  const issues = []
  const initialCount = initial.status === 'ready' ? prune(initial, undefined, issues).tasks.length : 0
  const recovery = initial.status === 'unavailable' && initial.hasConflict ? { recoverIndependentTasks: true }
    : initial.status === 'ready' && (!initialCount || (planVersion === 2 && initialCount < initial.tasks.length))
      ? { repairEvidence: true, ...(planVersion === 2 ? { repairIssues: issues.slice(0, 24) } : {}) } : null
  const alternative = recovery ? await request('plan', { ...input, ...recovery }, 9500, isDraft).catch((error) => {
    if (!initialCount) throw error
    return null
  }) : null
  // An unsuccessful repair must not discard independently valid tasks from the first draft.
  const alternativeCount = alternative?.status === 'ready' ? prune(alternative).tasks.length : 0
  const improves = alternativeCount > initialCount ||
    (alternativeCount === initialCount && initialCount > 0 && alternative?.tasks?.length < initial.tasks.length)
  const draft = initialCount && !improves
    ? initial : (alternative ?? initial)
  const reportedConflict = initial.hasConflict || draft.hasConflict
  const fail = (message, reason, hasConflict = reportedConflict) => analysisResult('unavailable', sources, {
    message, diagnostic: reason, notices: hasConflict ? [conflictNotice] : [],
  })
  if (draft.status === 'unavailable') return fail(draft.reason, 'plan_declined')
  const candidate = prune(draft)
  if (!candidate.tasks.length) return fail(noPlan, 'plan_structure')

  const review = await request('review', { ...input, ...candidate }, 2400, (value) => {
    if (!Array.isArray(value?.verdicts) || value.verdicts.length !== candidate.tasks.length) return false
    const expected = new Set(candidate.tasks.map(({ id }) => id))
    return value.verdicts.every((item) => expected.delete(item?.id) && ['supported', 'unsupported', 'conflict'].includes(item.verdict))
  })
  const rejected = new Set(review.verdicts.filter(({ verdict }) => verdict !== 'supported').map(({ id }) => id))
  const hasConflict = reportedConflict || review.verdicts.some(({ verdict }) => verdict === 'conflict')
  const retained = prune(draft, rejected)
  if (!retained.tasks.length) return fail(noPlan, 'plan_review', hasConflict)
  const plan = analysisResult('ready', sources, {
    topic, ...retained, ...(planVersion === 2 ? { planVersion } : {}),
    supportedScope: retained.knowledgePoints.map(({ title }) => title).join('、'),
    coverageGaps: [...new Set([...draft.coverageGaps,
      ...(retained.tasks.length !== draft.tasks.length ? ['部分内容因依据或前置关系未通过检查而未纳入路线。'] : []),
    ])],
    notices: hasConflict ? [conflictNotice] : [],
  })
  return isValidLearningPlan(plan, sources) ? plan : fail(noPlan, 'plan_structure', hasConflict)
}
