import * as mock from '../../src/services/mockAnalysisService.js'
import { isValidLearningPlan } from '../../src/services/validateLearningPlan.js'

export const readSources = mock.readSources

export async function planLearning(request) {
  const result = await mock.planLearning(request)
  if (result.status !== 'ready' || isValidLearningPlan(result, request.sources)) return result
  return {
    status: 'unavailable', mode: 'mock', sources: request.sources, notices: [],
    message: '学习计划的任务或来源引用未通过校验，无法生成可靠的学习计划。',
  }
}
