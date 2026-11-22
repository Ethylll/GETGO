import { readFile } from 'node:fs/promises'
import { createAnalysisHandler } from '../api/analysis.js'
import { createAnalysisService } from '../src/services/analysisService.js'
import { isValidLearningPlan } from '../src/services/validateLearningPlan.js'
import { locateSourceReference } from '../src/learningSources.js'

const entries = JSON.parse(await readFile(new URL('../tests/fixtures/learning-evaluation.json', import.meta.url), 'utf8'))
const image = await readFile(new URL('../tests/fixtures/analysis-vision.png', import.meta.url))
entries.push({ id: 'vision', expected: '根据图卡制作索引卡', sources: [], image })
const v2 = process.argv.includes('--v2')
const args = process.argv.slice(2).filter((arg) => arg !== '--v2')
const v2Cases = v2 ? JSON.parse(await readFile(new URL('../tests/fixtures/v2-workflow-smoke.json', import.meta.url), 'utf8')) : []
const selected = args.length ? [...entries, ...v2Cases].filter(({ id }) => args.includes(id)) : v2 ? v2Cases : entries
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
    ? await service.planLearning({ sources: read.sources, confirmPartial: true, planVersion: v2 ? 2 : 1,
      onStage: (stage) => stages.push(stage) }) : read
  const { status, topic, tasks, knowledgePoints, entryTaskId, message, coverageGaps, notices, diagnostic } = result
  const bySource = new Map(read.sources.map((source) => [source.sourceId, source]))
  const refs = tasks?.flatMap((task) => [...task.sourceRefs, ...task.steps.flatMap((step) => step.sourceRefs)]) ?? []
  const valid = status !== 'ready' || isValidLearningPlan(result, read.sources)
  const locates = refs.every((ref) => locateSourceReference(bySource, ref).status === 'located')
  const actualTypes = [...new Set(tasks?.map(({ type }) => type))].sort()
  const v2Matches = !v2 || status !== 'ready' || (result.planVersion === 2 &&
    (!fixture.types || JSON.stringify(actualTypes) === JSON.stringify(fixture.types)) &&
    (!fixture.frequency || tasks.some(({ practice }) => practice?.frequency.basis === fixture.frequency.basis &&
      practice.frequency.unit === fixture.frequency.unit &&
      (fixture.frequency.interval === undefined || practice.frequency.interval === fixture.frequency.interval))))
  if (status !== (fixture.status ?? 'ready') || !valid || !locates ||
    !v2Matches || (fixture.id.startsWith('conflict') && !notices.some((notice) => notice.includes('冲突')))) failures++
  console.log(JSON.stringify({ id: fixture.id, status, topic, stages, valid, locates, v2Matches, entryTaskId, message, diagnostic, coverageGaps, notices,
    sourceResults: read.sources.filter((source) => source.type === 'image').map(({ status, extractedText, error }) => ({ status, extractedText, error })),
    knowledge: knowledgePoints?.map(({ title, prerequisiteIds }) => ({ title, prerequisiteIds })),
    tasks: tasks?.map(({ id, title, prerequisiteTaskIds, steps, type, estimatedMinutes, completionCriteria, practice, prerequisiteGates }) =>
      ({ id, title, prerequisiteTaskIds, steps: steps.map(({ text }) => text), type, estimatedMinutes, completionCriteria, practice, prerequisiteGates })),
  }))
}
if (failures) process.exitCode = 1
