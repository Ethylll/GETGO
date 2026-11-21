import { useRef, useState } from 'react'
import { continueAnalysis, createAnalysisBatch, startAnalysis } from './analysisFlow.js'

const STAGE_DISPLAY_MS = 320

export function useAnalysis() {
  const [analysis, setAnalysis] = useState(null)
  const [sourceFiles, setSourceFiles] = useState(null)
  const running = useRef(false)

  async function run(operation) {
    if (running.current) return
    running.current = true

    const showStage = (stage) => {
      setAnalysis({ phase: 'processing', stage })
      return new Promise((resolve) => setTimeout(resolve, STAGE_DISPLAY_MS))
    }

    try {
      setAnalysis(await operation(showStage))
    } catch {
      setAnalysis({ phase: 'unavailable', result: { message: '分析暂时未能完成，请返回资料导入页重试。' } })
    } finally {
      running.current = false
    }
  }

  function start(materials) {
    const batch = createAnalysisBatch(materials)
    return run((onStage) => {
      setSourceFiles(new Map(batch.filter(({ file }) => file).map(({ sourceId, file }) => [sourceId, file])))
      return startAnalysis(batch, onStage, undefined, 2)
    })
  }

  function confirmPartial() {
    return run((onStage) => continueAnalysis({ sources: analysis.result.sources, confirmPartial: true, planVersion: analysis.planVersion }, onStage))
  }

  function clarify(clarification) {
    return run((onStage) => continueAnalysis({ ...analysis, clarification }, onStage))
  }

  function returnToImport() {
    if (running.current) return
    setAnalysis(null)
    setSourceFiles(null)
  }

  return { analysis, sourceFiles, start, confirmPartial, clarify, returnToImport }
}
