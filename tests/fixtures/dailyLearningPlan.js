const original = '先调整鼓棒握姿，再观察手腕。交替敲击并听节奏是否均匀。最后记下练习心得。两次练习相隔48小时。'
export const sourceRefs = [{ sourceId: 'src_1', excerpt: '交替敲击并听节奏是否均匀。' }]
const timing = { unit: 'learningDay', interval: 1, basis: 'recommendation' }
export const practice = { startCondition: 'immediate', frequency: timing, reviewAfter: { ...timing, interval: 4 },
  longTermGoal: '稳定交替敲击节奏', reviewCriteria: { stop: '核对目标之后考虑停止', reduce: '根据反馈考虑减量', adjust: '根据听辨调整' } }

export function makeTask(id, extra = {}) {
  return {
    id, type: 'oneTime', status: 'notStarted', title: `任务 ${id}`, objective: '按资料完成一次检查',
    estimatedMinutes: 6, completionCriteria: '确认一次敲击节奏', prerequisiteTaskIds: [], prerequisiteGates: [],
    knowledgePointIds: ['point'], sourceRefs,
    steps: [{ text: '交替敲击', sourceRefs }, { text: '听节奏是否均匀', sourceRefs }],
    ...extra,
  }
}

export function makePlan(tasks = [
  makeTask('first', { title: '准备握姿' }),
  makeTask('practice', { title: '交替敲击', type: 'recurring', practice }),
  makeTask('reflection', { title: '记录练习心得', prerequisiteTaskIds: ['first'] }),
]) {
  return { status: 'ready', mode: 'real', planVersion: 2, topic: '基础节奏', supportedScope: '握姿与稳定敲击',
    coverageGaps: ['未提供节拍设置'], notices: [],
    sources: [{ sourceId: 'src_1', title: '练习资料', type: 'text', text: original, status: 'processed' }],
    tasks, entryTaskId: tasks[0].id, knowledgePoints: [{ id: 'point', title: '节奏', prerequisiteIds: [], sourceRefs }],
  }
}
