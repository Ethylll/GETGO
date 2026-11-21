import { useRef, useState } from 'react'
import { agentChangeControls } from './agentActions.js'
import { equalAgentData } from './agentPlanChanges.js'
import { References } from './LearningTools.jsx'

const statusLabels = {
  pending: '待你确认', expired: '建议已过时', applied: '已生效', undone: '已撤销', restored: '已恢复',
  rejected: '已拒绝', superseded: '已有后续变更',
}
const changeLabels = {
  ADJUST_PRACTICE: '练习调整', DECOMPOSE_TASK: '任务拆解', RESCHEDULE: '任务安排调整',
  CHECK_MASTERY: '自检选学', RESTORE: '恢复先前安排',
}
const commandLabels = {
  accept: '接受调整', reject: '保留原安排', undo: '撤销调整', restore: '恢复先前安排',
}
const timingText = (timing) => timing && `${timing.interval} ${timing.unit === 'elapsedMinutes' ? '实际分钟' : '个学习日'}`

function TaskDelta({ before, after, titleFor, tools }) {
  const rows = [
    ['预计时长', before && `${before.estimatedMinutes} 分钟`, after && `${after.estimatedMinutes} 分钟`],
    ['练习间隔', timingText(before?.practice?.frequency), timingText(after?.practice?.frequency)],
    ['复核间隔', timingText(before?.practice?.reviewAfter), timingText(after?.practice?.reviewAfter)],
    ['难度安排', before?.practice?.difficulty?.text, after?.practice?.difficulty?.text],
    ['前置任务', before?.prerequisiteTaskIds.map(titleFor).join('、'), after?.prerequisiteTaskIds.map(titleFor).join('、')],
    ['完成标准', before?.completionCriteria, after?.completionCriteria],
  ].filter(([, previous, next]) => previous !== next && (previous || next))
  const newSteps = after && !equalAgentData(before?.steps, after.steps)
  return (
    <div className="space-y-1.5 border-t border-line pt-2">
      <p className="font-semibold text-ink">{!before ? '新增 · ' : !after ? '移出后续安排 · ' : ''}{(after ?? before).title}</p>
      {rows.length > 0 && <dl className="space-y-1">
        {rows.map(([label, previous, next]) => (
          <div key={label}>
            <dt className="inline text-ink">{label} </dt>
            <dd className="inline">{previous && next ? `${previous} → ${next}` : next || `原为 ${previous}`}</dd>
          </div>
        ))}
      </dl>}
      {newSteps && <details>
        <summary className="w-fit cursor-pointer underline underline-offset-2">查看{before ? '调整前后' : '新增'}步骤</summary>
        {before && <p className="mt-1">原步骤 · {before.steps.map(({ text }) => text).join('；')}</p>}
        <ol className="mt-1 list-decimal space-y-2 pl-5">{after.steps.map(({ text, sourceRefs }, index) => (
          <li key={index}>{text}<References references={sourceRefs} sources={tools.sources} label="查看这一步的来源" onOpen={tools.openSource} /></li>
        ))}</ol>
      </details>}
    </div>
  )
}

function placementText(placement) {
  if (placement?.notBefore) return `Day ${placement.notBefore} 起可安排`
  if (placement?.priorityDay) return `Day ${placement.priorityDay} 优先安排`
  return '按原顺序与前置条件安排'
}

function ChangeDetails({ change, controls, titleFor, tools, onCommand, busy }) {
  const { status, commands } = controls
  const summary = useRef(null)
  const affected = change.action.taskId
  return (
    <details className="group rounded-xl border border-line bg-paper px-3 py-2.5">
      <summary ref={summary} className="cursor-pointer wrap-anywhere text-sm font-medium text-ink">
        {changeLabels[change.action.type]}{affected && ` · ${titleFor(affected)}`}
        <span className="ml-2 text-xs font-normal text-muted">{statusLabels[status]}</span>
      </summary>
      <div className="mt-2 space-y-2.5 text-xs leading-relaxed wrap-anywhere text-muted">
        <p>{change.reason}</p>
        {change.delta.tasks.map(({ taskId, before, after }) => <TaskDelta key={taskId} before={before} after={after} titleFor={titleFor} tools={tools} />)}
        {change.delta.schedule.map(({ taskId, before, after }) => (
          <p key={taskId} className="border-t border-line pt-2"><strong className="text-ink">{titleFor(taskId)}</strong> · {placementText(before)} → {placementText(after)}</p>
        ))}
        {status === 'pending' && <p>接受后才会应用这项调整。</p>}
        {status === 'expired' && <p>学习安排已有变化，这项建议已失效。</p>}
        {status === 'superseded' && <p>请先处理影响同一任务的后续调整。</p>}
        {commands.includes('restore') && <p>恢复安排会保留已经完成的练习和问答记录。</p>}
        {commands.length > 0 && <div className="flex flex-wrap gap-2">
          {commands.map((command) => (
            <button key={command} type="button" disabled={busy} onClick={async () => {
              if (await onCommand(change.id, command)) requestAnimationFrame(() => summary.current?.focus({ preventScroll: true }))
            }}
              className={`${command === 'accept' ? 'start-button' : 'secondary-button'} min-h-11 rounded-full px-3 font-semibold disabled:opacity-60`}>
              {commandLabels[command]}
            </button>
          ))}
        </div>}
      </div>
    </details>
  )
}

export default function TeachingUpdates({ session, day, review, taskTitles, tools, onCommand, onOpenChat }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const writing = useRef(false)
  const notes = session.agent?.notes ?? []
  const changes = session.agent?.changes ?? []
  const visibleDay = review ? review.dayId : day.id
  const guidance = notes.filter((note) => note.type === 'GUIDE' && note.dayId === visibleDay &&
    (!review || note.taskId === review.task?.id))
  const hasPrompt = !review && notes.some((note) => note.type === 'CLARIFY' && note.dayId === day.id &&
    note.ignoredAt === undefined && !session.messages.some(({ clarificationId }) => clarificationId === note.id))
  const recent = changes.filter((change) => change.dayId === day.id).slice(-3).reverse()
  const history = changes.filter((change) => !recent.includes(change)).reverse()
  const titleFor = (id) => taskTitles.get(id) ?? '相关任务'

  async function run(id, command) {
    if (writing.current) return
    writing.current = true
    setBusy(true)
    const changed = await onCommand(id, command)
    setNotice(changed ? {
      accept: '已应用调整。', reject: '已保留原安排。', undo: '已撤销调整。', restore: '已恢复先前安排，原学习记录已保留。',
    }[command] : '这项操作未保存，安排可能已更新。')
    writing.current = false
    setBusy(false)
    return changed
  }

  if (!guidance.length && !hasPrompt && (review || !changes.length)) return null
  return (
    <section aria-label="学习指导与安排" className="mt-6 space-y-3 text-sm text-muted">
      {guidance.map((note) => (
        <div key={note.id} className="border-l-2 border-line-strong pl-3">
          <p className="text-xs font-semibold text-accent">AI 老师的提示 · {note.taskTitle ?? titleFor(note.taskId)}</p>
          <p className="mt-1 leading-relaxed wrap-anywhere">{note.text}</p>
          <References references={note.sourceRefs} sources={tools.sources} label="查看提示来源" onOpen={tools.openSource} />
        </div>
      ))}
      {hasPrompt && <button type="button" onClick={onOpenChat} className="min-h-10 text-left text-sm text-accent underline underline-offset-2">
        AI 老师有个学习问题
      </button>}
      {!review && changes.length > 0 && <div className="space-y-2">
        <h2 className="text-xs font-semibold text-accent">学习安排</h2>
        {recent.map((change) => (
          <ChangeDetails key={change.id} change={change} controls={agentChangeControls(session, change)} titleFor={titleFor} tools={tools} onCommand={run} busy={busy} />
        ))}
        {history.length > 0 && <details>
          <summary className="w-fit cursor-pointer text-xs underline underline-offset-2">查看之前的安排变更</summary>
          <div className="mt-2 space-y-2">
            {history.map((change) => <ChangeDetails key={change.id} change={change} controls={agentChangeControls(session, change)}
              titleFor={titleFor} tools={tools} onCommand={run} busy={busy} />)}
          </div>
        </details>}
        {notice && <p role="status" className="text-xs">{notice}</p>}
      </div>}
    </section>
  )
}
