import { createHash } from 'node:crypto'
import { sourceText } from '../src/learningSources.js'

export const EVIDENCE_LIMIT = 8
const CANDIDATE_LIMIT = 14

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' })
const ignored = new Set('怎么 如何 怎样 什么 为什么 为何 请问 是否 可以 需要 应该 哪些 哪个 一下 进行 这个 那个 这里 刚才 前面 上述 然后 接下来 一点 以及 同时 另外 资料 学习 任务 步骤 吉他 乐器 时候 方法 办法 操作 具体 解释 介绍 不会 的话 请用 自己 简单 简要 通俗 回答 说明 详细 讲讲 the is and for how what why can do does next that'.split(' '))
const equivalents = [
  ['持琴', '握琴', '抱琴', '拿稳', '放稳', '稳住琴身', '固定琴身', '抱吉他', '握吉他', '琴身不晃', '不会晃', '扶稳'],
  ['肩膀', '肩部', '双肩', '松肩', '肩颈'],
  ['调音', '校音', '校准音高', '调弦', '对音准'],
  ['放松', '松开', '别绷紧', '不要紧绷'],
  ['换弦', '切换琴弦'],
  ['按弦', '压弦', '按住琴弦'],
  ['检查', '核对', '确认'],
  ['保存', '存档', '存盘'],
  ['撤销', '还原上一步'],
]

function searchFeatures(value) {
  const normalized = value.normalize('NFKC').toLowerCase()
  const phrases = new Set(equivalents
    .filter((group) => group.some((phrase) => normalized.includes(phrase)))
    .map(([canonical]) => canonical))
  const words = new Set([...segmenter.segment(normalized)]
    .filter(({ segment, isWordLike }) => isWordLike && segment.length >= 2 && !ignored.has(segment))
    .map(({ segment }) => segment))
  const pairs = new Set([...words].flatMap((word) => {
    if (!/^\p{Script=Han}{3,}$/u.test(word)) return []
    const chars = [...word]
    return chars.slice(0, -1).map((char, index) => char + chars[index + 1])
  }))
  return { normalized, words, phrases, pairs }
}

export function splitSources(sources) {
  const chunks = []
  for (const source of sources) {
    if (source.status !== 'processed') continue
    const original = sourceText(source)
    for (const paragraph of original.matchAll(/[^\r\n]+/g)) {
      for (let offset = 0; offset < paragraph[0].length;) {
        const window = paragraph[0].slice(offset, offset + 640)
        const boundary = Math.max(window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？'), window.lastIndexOf('. '))
        const size = window.length === 640 && boundary >= 320 ? boundary + 1 : window.length
        const piece = window.slice(0, size)
        const text = piece.trim()
        const start = paragraph.index + offset + piece.length - piece.trimStart().length
        const end = start + text.length
        if (text) {
          const chunkId = createHash('sha256').update(JSON.stringify([source.sourceId, start, end, text])).digest('hex').slice(0, 24)
          chunks.push({ chunkId, sourceId: source.sourceId, title: source.title, text, start, end })
        }
        offset += size < paragraph[0].length - offset ? size - 96 : size
      }
    }
  }
  return chunks
}

function hasFeatures({ words, phrases }) {
  return words.size + phrases.size > 0
}

function questionQueries(question, history) {
  const backReference = /刚才|前面|上述|这一点|然后|接下来|\b(?:next|that)\b/gi
  const queries = question.split(/以及|另外|同时|[？?；;]+/).map((clause) =>
    searchFeatures(clause.replace(backReference, ''))).filter(hasFeatures)
  if (question.match(backReference) && history.length) queries.push(...[searchFeatures(history.at(-1).question)].filter(hasFeatures))
  return queries
}

function matchFeatures(query, indexed) {
  const words = [...query.words].filter((word) => indexed.words.has(word) ||
    (/\p{Script=Han}/u.test(word) && indexed.normalized.includes(word)))
  const phrases = [...query.phrases].filter((phrase) => indexed.phrases.has(phrase))
  const pairs = [...query.pairs].filter((pair) => indexed.normalized.includes(pair))
  const coverage = (words.length + phrases.length) / (query.words.size + query.phrases.size || 1)
  const relevance = words.reduce((total, word) => total + (word.length > 2 ? 3 : 2), 0) +
    phrases.length * 4 + Math.min(pairs.length, 3) + coverage * 2
  return { words, phrases, pairs, coverage, relevance }
}

export function prepareRetrieval({ question, task, sources, history }) {
  const queries = questionQueries(question, history)
  const context = searchFeatures([task.title, ...task.steps].join(' '))
  const preferred = new Set(task.sourceIds)
  const chunks = splitSources(sources).map((chunk) => {
    const indexed = searchFeatures(chunk.text)
    const matches = queries.map((query) => matchFeatures(query, indexed))
    const relevance = Math.max(0, ...matches.map((match) => match.relevance))
    const contextScore = matchFeatures(context, indexed).relevance + 2 * Number(preferred.has(chunk.sourceId))
    return { ...chunk, relevance, matches, contextScore, score: relevance * 3 + contextScore / 10 }
  })
  const ranked = chunks.filter(({ relevance }) => relevance >= 2).sort((a, b) => b.score - a.score)
  const representatives = queries.slice(0, 6).map((_, index) =>
    ranked.find((chunk) => chunk.matches[index].relevance >= 2)).filter(Boolean)
  const seed = [...new Set([...representatives, ...ranked])].slice(0, 6)
  const bySource = new Map()
  for (const chunk of [...chunks].sort((a, b) => b.contextScore - a.contextScore)) {
    if (!bySource.has(chunk.sourceId)) bySource.set(chunk.sourceId, [])
    bySource.get(chunk.sourceId).push(chunk)
  }
  const diverse = [...bySource.values()].flatMap((group) => group.slice(0, 1))
  const neighbors = seed.flatMap((chunk) => {
    const index = chunks.indexOf(chunk)
    return [chunks[index - 1], chunks[index + 1]].filter((neighbor) => neighbor?.sourceId === chunk.sourceId)
  })
  const contextual = [...chunks].sort((a, b) => b.contextScore - a.contextScore)
  return {
    lexical: ranked.slice(0, EVIDENCE_LIMIT),
    candidates: [...new Set([...seed, ...diverse.slice(0, 4), ...neighbors.slice(0, 4), ...diverse, ...contextual])]
      .slice(0, CANDIDATE_LIMIT),
  }
}

export function fuseRetrieval(candidates, selected) {
  const scores = new Map()
  for (const entry of selected) {
    if ([2, 3].includes(entry?.relevance)) {
      scores.set(entry.chunkId, Math.max(entry.relevance, scores.get(entry.chunkId) ?? 0))
    }
  }
  return candidates.filter(({ chunkId }) => scores.has(chunkId))
    .map((chunk) => {
      const semanticScore = scores.get(chunk.chunkId)
      return { ...chunk, semanticScore, fusedScore: semanticScore * 4 + Math.min(chunk.relevance, 8) / 2 }
    })
    .sort((a, b) => b.fusedScore - a.fusedScore).slice(0, EVIDENCE_LIMIT)
}

export const INSUFFICIENT = '在你提供的资料中没有找到足够依据，因此无法可靠回答这个问题。'

export function insufficient() {
  return { status: 'insufficient', answer: '', citations: [], insufficientReason: INSUFFICIENT }
}
