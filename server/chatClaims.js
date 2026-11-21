import { ANSWER_LIMIT, CITATION_LIMIT } from '../src/chatMessages.js'
import { sourceText } from '../src/learningSources.js'
import { insufficient } from './chatRag.js'

const digits = '零一二三四五六七八九'
const chineseNumber = /^[零〇一二两三四五六七八九十百千万]+$/
const factors = { 十: 10, 百: 100, 千: 1000 }
const timeUnits = { 秒: 1, 秒钟: 1, 分钟: 60, 小时: 3600 }

function numberValue(raw) {
  const normalized = raw.replaceAll('两', '二').replaceAll('〇', '零')
  if (!chineseNumber.test(normalized)) return Number(normalized)
  if (!/[十百千万]/.test(normalized)) return Number([...normalized].map((char) => digits.indexOf(char)).join(''))
  let total = 0
  let section = 0
  let digit = 0
  for (const char of normalized) {
    if (char === '万') {
      total += (section + digit || 1) * 10_000
      section = digit = 0
    } else if (factors[char]) {
      section += (digit || 1) * factors[char]
      digit = 0
    } else {
      digit = digits.indexOf(char)
    }
  }
  return total + section + digit
}

function quantities(text) {
  return [...text.normalize('NFKC').matchAll(/(?<![a-z\d])(-?\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万]+)\s*(分钟|小时|秒钟|秒|毫升|毫米|厘米|千克|公里|米|公斤|克|次|组|天|周|个月|年|%)/gi)]
    .map(([, raw, unit]) => timeUnits[unit] ? `秒:${numberValue(raw) * timeUnits[unit]}` : `${unit}:${numberValue(raw)}`)
}

export function validateClaims(output, sources, evidence) {
  const bySource = new Map(sources.filter((source) => source.status === 'processed')
    .map((source) => [source.sourceId, sourceText(source)]))
  const byChunk = new Map(evidence.map((chunk) => [chunk.chunkId, chunk]))
  return output.claims.map((claim, index) => {
    if (!['explanation', 'instruction', 'conflict'].includes(claim?.kind) ||
      typeof claim.text !== 'string' || !claim.text.trim() || claim.text.length > (ANSWER_LIMIT - 6) / 4 ||
      !Array.isArray(claim.citations) || claim.citations.length < 1 || claim.citations.length > 3) return null
    const citations = []
    for (const ref of claim.citations) {
      const chunk = byChunk.get(ref?.chunkId)
      if (!chunk || ref.sourceId !== chunk.sourceId || typeof ref.excerpt !== 'string' || ref.excerpt.trim().length < 2 ||
        !chunk.text.includes(ref.excerpt) || !bySource.get(ref.sourceId)?.includes(ref.excerpt)) return null
      citations.push({ chunkId: chunk.chunkId, sourceId: chunk.sourceId, excerpt: ref.excerpt })
    }
    const exactRefs = new Set(citations.map(({ sourceId, excerpt }) => JSON.stringify([sourceId, excerpt])))
    if (claim.kind === 'conflict' && exactRefs.size < 2) return null
    const citedQuantities = new Set(citations.flatMap(({ excerpt }) => quantities(excerpt)))
    if (quantities(claim.text).some((quantity) => !citedQuantities.has(quantity))) return null
    return { id: index + 1, kind: claim.kind, text: claim.text.trim(), citations }
  }).filter(Boolean)
}

export function composeAnswer(draft, claims, review) {
  const allowed = new Map(review.verdicts.map(({ id, verdict }) => [id, verdict]))
  const verified = claims.filter(({ id, kind }) => allowed.get(id) === (kind === 'conflict' ? 'conflict' : 'supported'))
  if (!verified.length) return insufficient()
  const citations = new Map()
  for (const claim of verified) {
    for (const { sourceId, excerpt } of claim.citations) citations.set(JSON.stringify([sourceId, excerpt]), { sourceId, excerpt })
  }
  const partial = draft.coverage === 'partial' || review.coverage === 'partial' || verified.length !== draft.claims.length
  const conflict = verified.some(({ kind }) => kind === 'conflict')
  const status = partial ? 'partial' : conflict ? 'conflict' : 'answered'
  return {
    status,
    answer: verified.map(({ text }) => text).join('\n\n'),
    citations: [...citations.values()].slice(0, CITATION_LIMIT),
  }
}
