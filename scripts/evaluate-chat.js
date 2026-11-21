import { readFile } from 'node:fs/promises'
import { createChatHandler } from '../api/chat.js'
import { splitSources } from '../server/chatRag.js'
import { locateSourceReference } from '../src/learningSources.js'

const fixtures = JSON.parse(await readFile(new URL('../tests/fixtures/chat-evaluation.json', import.meta.url), 'utf8'))
const selected = fixtures.cases.filter(({ id }) => !process.argv.slice(2).length || process.argv.slice(2).includes(id))
if (!selected.length) throw new Error('No evaluation cases selected')

let events
const handler = createChatHandler({ report: (event) => events.push(event) })
let expectedTotal = 0
let foundTotal = 0
let lexicalFoundTotal = 0
let extraTotal = 0
let statusMatches = 0

for (const fixture of selected) {
  const sources = fixture.sources.map((sourceId) => ({
    sourceId, title: sourceId, type: 'text', status: 'processed', text: fixtures.sources[sourceId],
  }))
  const task = { id: 'posture', title: '吉他入门练习', steps: ['把乐器放稳。'], sourceIds: ['hold'] }
  const history = (fixture.history ?? []).map((turn) => ({ taskId: task.id, ...turn }))
  const positions = new Map()
  const indices = new Map()
  for (const { sourceId, chunkId } of splitSources(sources)) {
    const index = indices.get(sourceId) ?? 0
    positions.set(chunkId, `${sourceId}:${index}`)
    indices.set(sourceId, index + 1)
  }
  events = []
  const start = performance.now()
  const response = await handler(new Request('http://localhost/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic: '吉他入门', question: fixture.question, task, sources, history }),
  }))
  const data = await response.json()
  const retrieval = events.find(({ reason }) => reason === 'retrieval')
  const found = (retrieval?.evidence ?? []).map(({ chunkId }) => positions.get(chunkId))
  const lexical = (retrieval?.lexical ?? []).map(({ chunkId }) => positions.get(chunkId))
  const byId = new Map(sources.map((source) => [source.sourceId, source]))
  const locates = data.citations.every((ref) => locateSourceReference(byId, ref).status === 'located')
  const extras = found.filter((reference) => !fixture.expected.includes(reference))
  expectedTotal += fixture.expected.length
  foundTotal += fixture.expected.filter((reference) => found.includes(reference)).length
  lexicalFoundTotal += fixture.expected.filter((reference) => lexical.includes(reference)).length
  extraTotal += extras.length
  if (response.ok && data.status === fixture.status && locates) statusMatches++
  console.log(JSON.stringify({ id: fixture.id, http: response.status, status: data.status, expected: fixture.expected,
    lexical, found, extras, locates, citations: data.citations.length, elapsedMs: Math.round(performance.now() - start),
    reason: events.at(-1)?.reason, answer: data.answer }))
  if (response.status === 503) {
    console.error('DeepSeek server configuration unavailable.')
    break
  }
}

console.log(JSON.stringify({ caseCount: selected.length, statusMatches, expectedTotal, lexicalFoundTotal, foundTotal, extraTotal }))
if (statusMatches !== selected.length || foundTotal !== expectedTotal || extraTotal) process.exitCode = 1
