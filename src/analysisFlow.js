import * as analysisService from './services/analysisService.js'

export function createAnalysisBatch(materials) {
  let textNumber = 0

  return materials.map((material) => {
    const sourceId = `src_${material.id}`

    if (material.type === 'text') {
      return { sourceId, type: 'text', title: `文字资料 ${++textNumber}`, text: material.text }
    }

    return { sourceId, type: 'image', title: material.name || '图片资料', file: material.file }
  })
}

export async function continueAnalysis({ sources, confirmPartial, clarification, planVersion }, onStage, service = analysisService) {
  const result = await service.planLearning({ sources, confirmPartial, clarification, planVersion, onStage })

  if (result.status === 'needsClarification') {
    return { phase: 'clarification', result, sources, confirmPartial, planVersion }
  }

  return { phase: result.status === 'ready' ? 'learning' : 'unavailable', result }
}

export async function startAnalysis(sources, onStage, service = analysisService, planVersion) {
  await onStage('reading')
  const result = await service.readSources({ sources })

  if (result.status !== 'ready') return { phase: 'unavailable', result }
  if (result.requiresConfirmation) return { phase: 'confirmation', result, planVersion }

  return continueAnalysis({ sources: result.sources, planVersion }, onStage, service)
}
