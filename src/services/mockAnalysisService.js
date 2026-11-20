import { guitarPostureImage, guitarScenario } from '../mocks/analysisScenarios.js'

const NO_PLAN = '现有资料不足，无法生成可靠的学习计划。'
const CONFLICT_NOTICE = '部分内容因资料冲突未纳入本次学习计划。'

function result(status, sources, details = {}) {
  return { status, mode: 'mock', sources, notices: [], ...details }
}

async function matchImage(file) {
  if (!file || typeof file.arrayBuffer !== 'function' || !globalThis.crypto?.subtle) return false

  try {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    return sha256 === guitarPostureImage.sha256
  } catch {
    return false
  }
}

async function readSource({ sourceId, title, type, text, file }) {
  const source = { sourceId, title, type }

  if (type === 'text') {
    return typeof text === 'string' && text.trim()
      ? { ...source, status: 'processed', text }
      : { ...source, status: 'failed', text, error: '这份文字资料没有可用内容。' }
  }

  if (type === 'image' && await matchImage(file)) {
    return { ...source, status: 'processed', extractedText: guitarPostureImage.extractedText }
  }

  const error = type === 'image' ? 'Mock 仅支持已登记的演示图片，无法识别这张图片。' : 'Mock 不支持此资料类型。'
  return { ...source, status: 'failed', error }
}

export async function readSources({ sources = [] } = {}) {
  const sourceIds = sources.map((source) => source.sourceId)
  if (sourceIds.some((id) => typeof id !== 'string' || !id.trim()) || new Set(sourceIds).size !== sourceIds.length) {
    return result('unavailable', [], { message: '资料 ID 缺失或重复，无法读取本批资料。' })
  }

  const processedSources = await Promise.all(sources.map(readSource))
  const usableCount = processedSources.filter((source) => source.status === 'processed').length
  if (!usableCount) return result('unavailable', processedSources, { message: NO_PLAN })

  return result('ready', processedSources, { requiresConfirmation: usableCount < processedSources.length })
}

export async function planLearning({ sources = [], clarification, confirmPartial = false, onStage } = {}) {
  const usableSources = sources.filter((source) => source.status === 'processed')
  if (!usableSources.length) return result('unavailable', sources, { message: NO_PLAN })

  if (usableSources.length < sources.length && confirmPartial !== true) {
    return result('unavailable', sources, {
      requiresConfirmation: true,
      message: '部分资料识别失败，请确认仅使用成功处理的资料继续。',
    })
  }

  await onStage?.('identifying')
  const { topic, keywords, clarificationQuestion, lessons } = guitarScenario
  const sourceText = (source) => source.type === 'text' ? source.text : source.extractedText
  const mentionsGuitar = (text) => keywords.some((keyword) => text?.toLowerCase().includes(keyword))
  const answer = clarification?.trim()
  if (!usableSources.some((source) => mentionsGuitar(sourceText(source))) && !mentionsGuitar(answer)) {
    if (answer) return result('unavailable', sources, { message: '仍无法可靠判断学习主题，无法生成学习计划。' })
    return result('needsClarification', sources, { question: clarificationQuestion })
  }

  await onStage?.('organizing')
  const findSource = (excerpt) => usableSources.find((source) => sourceText(source)?.includes(excerpt))
  const selectedLessons = new Map()
  const coverageGaps = []
  const notices = []

  for (const lesson of lessons) {
    const matches = lesson.steps.map(({ excerpt }) => findSource(excerpt))
    if (lesson.conflictingExcerpt && matches[0] && findSource(lesson.conflictingExcerpt)) {
      notices.push(CONFLICT_NOTICE)
      coverageGaps.push(`资料对${lesson.knowledgeTitle}的练习顺序存在冲突。`)
      continue
    }

    if (matches.some((source) => !source) || lesson.prerequisiteTaskIds.some((id) => !selectedLessons.has(id))) {
      coverageGaps.push(`可用资料不足以支持${lesson.knowledgeTitle}练习及其前置步骤。`)
      continue
    }

    selectedLessons.set(lesson.id, { lesson, matches })
  }

  if (!selectedLessons.size) return result('unavailable', sources, { message: NO_PLAN, notices })

  await onStage?.('generating')
  const tasks = []
  const knowledgePoints = []

  for (const { lesson, matches } of selectedLessons.values()) {
    const steps = lesson.steps.map(({ text, excerpt }, index) => ({
      text,
      sourceRefs: [{ sourceId: matches[index].sourceId, excerpt }],
    }))
    const sourceRefs = steps.flatMap((step) => step.sourceRefs)
    const knowledgePointId = `kp_${lesson.id}`

    knowledgePoints.push({
      id: knowledgePointId,
      title: lesson.knowledgeTitle,
      prerequisiteIds: lesson.prerequisiteTaskIds.map((id) => `kp_${id}`),
      sourceRefs,
    })

    tasks.push({
      id: lesson.id,
      title: lesson.title,
      objective: lesson.objective,
      prerequisiteTaskIds: [...lesson.prerequisiteTaskIds],
      knowledgePointIds: [knowledgePointId],
      steps,
      sourceRefs,
    })
  }

  return result('ready', sources, {
    topic,
    supportedScope: knowledgePoints.map((point) => point.title).join('、'),
    coverageGaps,
    knowledgePoints,
    tasks,
    entryTaskId: tasks[0].id,
    notices,
  })
}
