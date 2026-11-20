import { useRef, useState } from 'react'
import AnalysisView from './AnalysisView.jsx'
import LearningView from './LearningView.jsx'
import MaterialList from './MaterialList.jsx'
import { clearLearningSession, loadLearningSession } from './learningSessionStorage.js'
import { checkImage, IMAGE_ACCEPT, MAX_MATERIALS } from './materials.js'
import { useAnalysis } from './useAnalysis.js'

export default function App() {
  const fileInput = useRef(null)
  const nextId = useRef(1)
  const [materials, setMaterials] = useState([])
  const [draft, setDraft] = useState('')
  const [errors, setErrors] = useState([])
  const [notice, setNotice] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [startup, setStartup] = useState(loadLearningSession)
  const { analysis, sourceFiles, start, confirmPartial, clarify, returnToImport } = useAnalysis()
  const restored = startup.status === 'restored' ? startup : null
  const plan = restored?.plan ?? (analysis?.phase === 'learning' ? analysis.result : null)
  const isFull = materials.length === MAX_MATERIALS
  const showEmptyNotice = !materials.length && Boolean(notice)

  async function addImages(event) {
    const files = Array.from(event.target.files)
    event.target.value = ''
    if (!files.length) return

    setIsImporting(true)
    setErrors([])
    setNotice('')

    const availableSlots = MAX_MATERIALS - materials.length
    const images = []
    const problems = []

    for (const file of files) {
      if (images.length === availableSlots) {
        problems.push(`最多可添加 ${MAX_MATERIALS} 份资料，其余图片未添加。`)
        break
      }

      const error = await checkImage(file)
      if (error) {
        problems.push(`「${file.name}」${error}`)
        continue
      }

      images.push({ id: nextId.current++, type: 'image', name: file.name, file })
    }

    setMaterials((current) => [...current, ...images])
    setErrors(problems)
    setIsImporting(false)
  }

  function addText(event) {
    event.preventDefault()
    setNotice('')
    const text = draft.trim()

    if (!text) {
      setErrors(['请先粘贴文字，再添加这份资料。'])
      return
    }

    if (isFull) {
      setErrors([`最多可添加 ${MAX_MATERIALS} 份资料，请先移除一份。`])
      return
    }

    const material = {
      id: nextId.current++,
      type: 'text',
      text,
    }
    setMaterials((current) => [...current, material])
    setDraft('')
    setErrors([])
  }

  function removeMaterial(id) {
    setMaterials((current) => current.filter((material) => material.id !== id))
    setErrors([])
    setNotice('')
  }

  function handleStart() {
    if (isImporting || analysis) return
    if (!materials.length) {
      setNotice('请至少给我一份资料哦~')
      return
    }
    start(materials)
  }

  const importPage = (
    <>
      <section className="py-9 text-center sm:pt-14 sm:pb-11" aria-labelledby="home-heading">
        <h1 id="home-heading" className="hero-heading text-[clamp(1.65rem,6.3vw,3.55rem)] leading-tight font-semibold">
          只要想做，就能开始
        </h1>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] border border-line bg-paper" aria-labelledby="import-heading">
        <div className="border-b border-line px-5 py-4 sm:px-8 sm:py-5">
          <h2 id="import-heading" className="text-base font-semibold sm:text-lg">把你收藏的东西尽管交给我^^</h2>
        </div>

        <div className="grid gap-6 px-5 py-5 sm:px-8 sm:py-7 md:grid-cols-2 md:gap-7">
          <div className="min-w-0">
            <h3 className="mb-3 text-sm font-semibold">上传文件</h3>
            <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} multiple className="hidden" onChange={addImages} disabled={isImporting} aria-label="选择图片文件" />
            <button
              type="button"
              className="upload-zone flex min-h-52 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-oat px-4 py-6 text-center enabled:hover:border-accent enabled:hover:bg-oat-hover disabled:opacity-65 md:h-[15.25rem]"
              onClick={() => fileInput.current.click()}
              disabled={isImporting}
              aria-describedby="file-limits"
            >
              <span className="upload-mark" aria-hidden="true">↑</span>
              <span className="mt-3 text-base font-semibold">{isImporting ? '正在检查图片…' : '选择图片'}</span>
              <span id="file-limits" className="mt-2 text-sm leading-relaxed text-muted">PNG、JPG、WebP · 可多选 · 单张 ≤ 5 MB</span>
            </button>
          </div>

          <form className="flex min-w-0 flex-col" onSubmit={addText}>
            <label className="mb-3 text-sm font-semibold" htmlFor="material-text">粘贴文字</label>
            <textarea
              id="material-text"
              className="min-h-36 w-full resize-y rounded-2xl border border-line bg-sheet px-4 py-4 text-base leading-relaxed placeholder:text-muted md:min-h-[11.25rem]"
              placeholder="在这里粘贴笔记、文章或教程片段…"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <button className="secondary-button mt-3 min-h-11 self-end rounded-full px-5 text-sm font-semibold" type="submit" disabled={isImporting}>
              添加这段文字<span className="ml-2" aria-hidden="true">＋</span>
            </button>
          </form>
        </div>

        {errors.length > 0 && (
          <ul role="alert" className="mx-5 mb-5 space-y-1 rounded-xl bg-error-light px-4 py-3 text-sm leading-relaxed break-all text-error sm:mx-8">
            {errors.map((error, index) => <li key={index}>{error}</li>)}
          </ul>
        )}

        {materials.length > 0 && <MaterialList materials={materials} onRemove={removeMaterial} disabled={isImporting} />}
      </section>

      <div className="mt-6 text-center sm:mt-8">
        <button
          type="button"
          className="start-button min-h-13 w-full rounded-full px-8 text-base font-semibold sm:w-60"
          disabled={isImporting}
          aria-describedby="start-help"
          onClick={handleStart}
        >
          <span aria-live="polite">{showEmptyNotice ? notice : '我要开始！'}</span>
          {!showEmptyNotice && <span className="ml-2" aria-hidden="true">→</span>}
        </button>
        <p id="start-help" role="status" className="mt-3 empty:mt-0 text-sm leading-relaxed text-muted">
          {isImporting ? '图片检查完成后即可开始。' : ''}
        </p>
      </div>
    </>
  )

  return (
    <main className="mx-auto w-full max-w-[68rem] px-5 pb-12 sm:px-10 sm:pb-16">
      <header className="flex items-center gap-3 border-b border-line py-5 sm:py-6">
        <span className="brand-mark" aria-hidden="true">↗</span>
        <p className="flex items-baseline gap-2 text-xl font-bold tracking-tight">
          开练<span className="text-line-strong" aria-hidden="true">|</span>
          <span className="text-sm font-extrabold tracking-[0.14em]">GETGO</span>
        </p>
      </header>

      {startup.status === 'invalid' && (
        <section className="mx-auto mt-10 max-w-xl rounded-2xl border border-line bg-paper p-6" aria-labelledby="recovery-heading">
          <h1 id="recovery-heading" className="text-2xl font-semibold">无法恢复上次学习</h1>
          <p className="mt-3 leading-relaxed text-muted" role="alert">
            {startup.reason === 'version' ? '上次会话的存储版本不兼容。' : '上次会话记录损坏或未通过校验。'}原有记录仍保留，点击重新开始后将清除这份记录。
          </p>
          <button type="button" className="start-button mt-5 min-h-11 rounded-full px-5 text-sm font-semibold" onClick={() => setStartup({ status: clearLearningSession() ? 'empty' : 'unavailable' })}>
            重新开始
          </button>
        </section>
      )}
      {!analysis && !plan && startup.status !== 'invalid' && (
        <>
          {startup.status === 'unavailable' && <p className="mt-5 rounded-xl bg-error-light px-4 py-3 text-sm text-error" role="status">暂时无法访问本地学习记录，刷新后可能丢失进度。</p>}
          {importPage}
        </>
      )}
      {plan && <LearningView plan={plan} sourceFiles={sourceFiles} initialProgress={restored?.progress} initialMessages={restored?.messages} />}
      {analysis && analysis.phase !== 'learning' && (
        <AnalysisView analysis={analysis} onConfirm={confirmPartial} onClarify={clarify} onBack={returnToImport} />
      )}
    </main>
  )
}
