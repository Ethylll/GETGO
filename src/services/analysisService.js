import * as provider from './mockAnalysisService.js'
import { isValidLearningPlan } from './validateLearningPlan.js'

export const readSources = provider.readSources

export async function planLearning(request = {}) {
  const result = await provider.planLearning(request)
  if (result.status !== 'ready') return result

  // Verify against the processed input batch, not evidence supplied by a plan provider.
  if (isValidLearningPlan(result, request.sources)) return result

  return {
    status: 'unavailable',
    mode: result.mode,
    sources: request.sources,
    notices: [],
    message: '学习计划的任务或来源引用未通过校验，无法生成可靠的学习计划。',
  }
}
