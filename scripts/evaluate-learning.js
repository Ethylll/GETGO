import { readFile } from 'node:fs/promises'
import { createAnalysisHandler } from '../api/analysis.js'
import { createAnalysisService } from '../src/services/analysisService.js'
import { isValidLearningPlan } from '../src/services/validateLearningPlan.js'
import { locateSourceReference } from '../src/learningSources.js'

const entries = JSON.parse(await readFile(new URL('../tests/fixtures/learning-evaluation.json', import.meta.url), 'utf8'))
const image = await readFile(new URL('../tests/fixtures/analysis-vision.png', import.meta.url))
entries.push({ id: 'vision', expected: '根据图卡制作索引卡', sources: [], image })
const args = process.argv.slice(2)
const selected = args.length ? entries.filter(({ id }) => args.includes(id)) : entries
if (!selected.length) throw new Error('No matching learning evaluation cases')

const handle = createAnalysisHandler()
const service = createAnalysisService({ fetchImpl: (path, options) => handle(new Request(`http://getgo.local${path}`, options)) })
let failures = 0
for (const fixture of selected) {
  const sources = fixture.sources.map((text, index) => ({ type: 'text', title: `资料 ${index + 1}`, sourceId: `${fixture.id}-${index}`, text }))
  if (fixture.image) sources.push({ type: 'image', title: 'study-diagram.png', sourceId: 'vision-test',
    file: new File([fixture.image], 'study-diagram.png', { type: 'image/png' }) })
  const read = await service.readSources({ sources })
  const stages = []
  const result = read.status === 'ready'
    ? await service.planLearning({ sources: read.sources, confirmPartial: true, onStage: (stage) => stages.push(stage) }) : read
  const { status, topic, tasks, knowledgePoints, entryTaskId, message, coverageGaps, notices } = result
  const bySource = new Map(read.sources.map((source) => [source.sourceId, source]))
  const refs = tasks?.flatMap((task) => [...task.sourceRefs, ...task.steps.flatMap((step) => step.sourceRefs)]) ?? []
  const valid = status !== 'ready' || isValidLearningPlan(result, read.sources)
  const locates = refs.every((ref) => locateSourceReference(bySource, ref).status === 'located')
  if (status !== (fixture.status ?? 'ready') || !valid || !locates ||
    (fixture.id.startsWith('conflict') && !notices.some((notice) => notice.includes('冲突')))) failures++
  console.log(JSON.stringify({ id: fixture.id, status, topic, stages, valid, locates, entryTaskId, message, coverageGaps, notices,
    sourceResults: read.sources.filter((source) => source.type === 'image').map(({ status, extractedText, error }) => ({ status, extractedText, error })),
    knowledge: knowledgePoints?.map(({ title, prerequisiteIds }) => ({ title, prerequisiteIds })),
    tasks: tasks?.map(({ id, title, prerequisiteTaskIds, steps }) => ({ id, title, prerequisiteTaskIds, steps: steps.map(({ text }) => text) })),
  }))
}
if (failures) process.exitCode = 1
