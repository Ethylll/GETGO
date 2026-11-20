export function createLearningProgress({ tasks = [], entryTaskId }) {
  return {
    currentTaskId: entryTaskId && tasks.some(({ id }) => id === entryTaskId) ? entryTaskId : null,
    completedTaskIds: [],
    reviewTaskId: null,
  }
}

export function adjacentTaskIds(tasks, progress) {
  const displayedId = progress.reviewTaskId ?? progress.currentTaskId
  const index = tasks.findIndex(({ id }) => id === displayedId)
  if (index === -1) return { previousTaskId: null, nextTaskId: null }

  return {
    previousTaskId: tasks[index - 1]?.id ?? null,
    nextTaskId: tasks[index + 1]?.id ?? null,
  }
}

export function updateLearningProgress(tasks, progress, action) {
  switch (action.type) {
    case 'complete': {
      const { taskId } = action
      if (!taskId || taskId !== progress.currentTaskId || progress.reviewTaskId !== null || progress.completedTaskIds.includes(taskId)) {
        return progress
      }

      const index = tasks.findIndex(({ id }) => id === taskId)
      if (index === -1) return progress

      const completedTaskIds = [...progress.completedTaskIds, taskId]
      const isIncomplete = ({ id }) => !completedTaskIds.includes(id)
      // Preserve route order from the entry task and retain any earlier unfinished tasks.
      const nextTask = tasks.slice(index + 1).find(isIncomplete) ?? tasks.find(isIncomplete)
      return { ...progress, currentTaskId: nextTask?.id ?? null, completedTaskIds }
    }
    case 'review': {
      const { taskId } = action
      if (!taskId || !tasks.some(({ id }) => id === taskId)) return progress
      return { ...progress, reviewTaskId: taskId === progress.currentTaskId ? null : taskId }
    }
    case 'returnToCurrent':
      return { ...progress, reviewTaskId: null }
    default:
      return progress
  }
}
