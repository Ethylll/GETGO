import { sourceText } from '../src/learningSources.js'

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
        if (text) chunks.push({ sourceId: source.sourceId, title: source.title, text, start, end: start + text.length })
        offset += size
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
  // Only an explicit back-reference without other terms may borrow the last question's terms.
  if (!queries.length && question.match(backReference)) {
    return [searchFeatures(history.at(-1)?.question ?? '')].filter(hasFeatures)
  }
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

export function retrieveChunks({ question, task, sources, history }) {
  const queries = questionQueries(question, history)
  if (!queries.length) return []

  const context = searchFeatures([task.title, ...task.steps].join(' '))
  const preferred = new Set(task.sourceIds)
  const ranked = splitSources(sources).map((chunk) => {
    const indexed = searchFeatures(chunk.text)
    const matches = queries.map((query) => matchFeatures(query, indexed))
    const relevance = Math.max(...matches.map((match) => match.relevance))
    const taskBonus = Number(matchFeatures(context, indexed).relevance >= 2)
    return { ...chunk, relevance, matches, score: relevance * 3 + taskBonus + Number(preferred.has(chunk.sourceId)) }
  }).filter(({ relevance }) => relevance >= 2).sort((a, b) => b.score - a.score)
  // Reserve the best eligible passage for each subquestion before filling the remaining slots.
  const representatives = queries.map((_, index) => ranked.find((chunk) => chunk.matches[index].relevance >= 2)).filter(Boolean)
  return [...new Set([...representatives, ...ranked])].slice(0, 8).sort((a, b) => b.score - a.score)
}

export const INSUFFICIENT = '在你提供的资料中没有找到足够依据，因此无法可靠回答这个问题。'

export function insufficient() {
  return { status: 'insufficient', answer: '', citations: [], insufficientReason: INSUFFICIENT }
}

export function validateDraft(output, sources, chunks, { question, history }) {
  if (output?.status === 'insufficient') return insufficient()
  if (!['answered', 'partial', 'conflict'].includes(output?.status) || typeof output.answer !== 'string' ||
    !output.answer.trim() || output.answer.length > 1200 ||
    !Array.isArray(output.citations) || !output.citations.length || output.citations.length > 4) return insufficient()

  const byId = new Map(sources.map((source) => [source.sourceId, source]))
  const citations = []
  for (const ref of output.citations) {
    const source = byId.get(ref?.sourceId)
    const excerpt = ref?.excerpt
    if (source?.status !== 'processed' || typeof excerpt !== 'string' || excerpt.trim().length < 4 ||
      !sourceText(source).includes(excerpt) || !chunks.some((chunk) => chunk.sourceId === ref.sourceId && chunk.text.includes(excerpt))) return insufficient()
    citations.push({ sourceId: ref.sourceId, excerpt })
  }

  if (output.status === 'conflict' && new Set(citations.map(({ sourceId }) => sourceId)).size < 2) return insufficient()
  const answer = output.answer.trim()
  const citedNumbers = new Set(citations.flatMap(({ excerpt }) => numbersIn(excerpt)))
  if (numbersIn(answer).some((number) => !citedNumbers.has(number))) return insufficient()
  const quoted = citations.map(({ excerpt }) => searchFeatures(excerpt))
  const clauses = questionQueries(question, history)
  const status = output.status === 'answered' && clauses.length > 1 &&
    clauses.some((query) => !quoted.some((excerpt) => matchFeatures(query, excerpt).relevance >= 2))
    ? 'partial' : output.status

  return groundedAnswer(status, answer, citations)
}

function numbersIn(value) {
  return value.normalize('NFKC').replace(/^\s*\d+(?:[.)][ \t]+|、)/gm, '').toLowerCase()
    .match(/(?<![a-z\d])\d+(?:\.\d+)?%?/g) ?? []
}

export function groundedAnswer(status, answer, citations) {
  const response = { status, answer, citations }
  if (status === 'partial') response.insufficientReason = '资料只能支持问题的一部分，其余内容缺少可靠依据。'
  if (status === 'conflict') response.insufficientReason = '这些资料的说法存在冲突，无法据此给出统一结论。'
  return response
}
