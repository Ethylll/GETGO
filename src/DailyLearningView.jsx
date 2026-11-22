import { useState } from 'react'
import { chatScopeKey, scopedChatTurns } from './chatMessages.js'
import { activeLearningPlan, currentDayInstances, feedbackCriteria, getOneTimeProgress } from './learningDays.js'
import LearningTools, { LearningSteps, References, useLearningTools } from './LearningTools.jsx'
import TeachingUpdates from './TeachingUpdates.jsx'
import { clarificationCards } from './teachingInteractions.js'
import { useDailyLearning } from './useDailyLearning.js'
import { useLearningChat } from './useLearningChat.js'

const statuses = { notStarted: '未开始', inProgress: '进行中', completed: '已完成' }
const kinds = { oneTime: '一次性学习', recurring: '周期练习' }

function DailyList({ label, items, focusedId, onSelect }) {
  if (!items.length) return null
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" aria-pressed={focusedId === item.id} onClick={() => onSelect(item.id)}
              className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line px-3 py-2 text-left text-sm aria-pressed:bg-oat">
              <span className="min-w-0 wrap-anywhere">{item.task.title}</span>
              <span className="text-xs text-muted">{item.optional && `${kinds[item.task.type]} · `}{item.task.estimatedMinutes} 分钟 · {statuses[item.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function PracticeTiming({ label, timing, tools }) {
  const unit = timing.unit === 'elapsedMinutes' ? '模拟分钟' : '个学习日'
  return (
    <div>
      <p>{label} · {timing.interval} {unit} · {timing.basis === 'recommendation' ? 'AI 教学建议' : '原资料安排'}</p>
      <References references={timing.sourceRefs} sources={tools.sources} label="查看时间安排来源" onOpen={tools.openSource} />
    </div>
  )
}

function TaskDetail({ task, instance, criteria, tools, onAction, isReviewing }) {
  const [feedback, setFeedback] = useState([])
  return (
    <section className="mt-6 space-y-3 border-t border-line pt-5" aria-labelledby="current-task-heading">
      <p className="text-xs font-semibold text-accent">{isReviewing ? '回看 · ' : ''}{kinds[task.type]} · {task.estimatedMinutes} 分钟{instance && ` · ${statuses[instance.status]}`}</p>
      <h2 id="current-task-heading" className="text-xl font-semibold wrap-anywhere sm:text-2xl">{task.title}</h2>
      <p className="text-sm leading-relaxed text-muted">{task.objective}</p>
      <LearningSteps task={task} sources={tools.sources} onOpen={tools.openSource} />
      <p className="text-sm"><span className="font-semibold">本次完成标准</span> · {task.completionCriteria}</p>
      <References references={task.sourceRefs} sources={tools.sources} label="查看本任务的全部来源" onOpen={tools.openSource} />
      {task.practice && (
        <details className="space-y-2 rounded-xl bg-oat px-3 py-2 text-xs leading-relaxed text-muted">
          <summary className="cursor-pointer font-semibold text-ink">持续练习安排</summary>
          <p>{task.practice.longTermGoal}</p>
          {task.practice.difficulty && <div>
            <p>练习难度 · {task.practice.difficulty.text}</p>
            <References references={task.practice.difficulty.sourceRefs} sources={tools.sources} label="查看难度安排来源" onOpen={tools.openSource} />
          </div>}
          <PracticeTiming label="练习间隔" timing={task.practice.frequency} tools={tools} />
          <PracticeTiming label="复核间隔" timing={task.practice.reviewAfter} tools={tools} />
          <p>停止参考 · {task.practice.reviewCriteria.stop}</p>
          <p>减量参考 · {task.practice.reviewCriteria.reduce}</p>
          <p>调整参考 · {task.practice.reviewCriteria.adjust}</p>
        </details>
      )}
      {isReviewing && instance?.feedback.length > 0 && <p className="text-sm text-muted">已记录的自检 · {instance.feedback.join('、')}</p>}
      {!isReviewing && instance.status === 'inProgress' && criteria.length > 0 && (
        <fieldset className="space-y-2 rounded-xl border border-line px-3 py-2 text-sm">
          <legend className="px-1 font-semibold">自检反馈（按实际勾选）</legend>
          {criteria.map((criterion) => (
            <label key={criterion} className="flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={feedback.includes(criterion)} onChange={(event) =>
                setFeedback(event.target.checked ? [...feedback, criterion] : feedback.filter((item) => item !== criterion))} />
              <span>{criterion}</span>
            </label>
          ))}
        </fieldset>
      )}
      {!isReviewing && instance.status !== 'completed' && (
        <button key={instance.status} type="button" className="start-button min-h-11 rounded-full px-4 text-sm font-semibold" onClick={(event) => {
          if (event.detail <= 1) onAction(instance.status === 'notStarted' ? 'start' : 'complete', instance.id, feedback)
        }} onKeyDown={(event) => { if (event.repeat) event.preventDefault() }}>
          {instance.status === 'notStarted' ? (instance.optional ? '开始选学' : '开始本项') : '完成本项'}
        </button>
      )}
    </section>
  )
}

function DailyRoute({ plan, day, days, scheduled, done, focusedId, projectQuestionDays, onTask, onHistory, onProjectHistory }) {
  const phase = scheduled.find(({ status, optional }) => status !== 'completed' && !optional)?.task.title
  return (
    <div className="max-h-[65vh] space-y-3 overflow-y-auto">
      <p><strong>整体目标</strong> · {plan.topic}。{plan.supportedScope}</p>
      <p><strong>当前阶段</strong> · Day {day.dayNumber}{phase ? ` · ${phase}` : ' · 可查看后续安排'}</p>
      {projectQuestionDays.has(day.id) && <button type="button" className="text-left underline" onClick={() => onProjectHistory(day)}>查看本日项目答疑</button>}
      {[
        ['已完成的一次性任务', plan.tasks.filter(({ type, id }) => type === 'oneTime' && done.has(id))],
        ['后续学习内容', plan.tasks.filter(({ type, id }) => type === 'oneTime' && !done.has(id))],
        ['周期练习', plan.tasks.filter(({ type }) => type === 'recurring')],
      ].map(([label, tasks]) => (
        <section key={label}>
          <h3 className="font-semibold">{label}</h3>
          {tasks.length ? <ul className="space-y-1">{tasks.map((task) => {
            const today = scheduled.find((item) => item.task.id === task.id)
            return <li key={task.id}><button type="button" className="text-left underline" onClick={() => onTask(task)}
              aria-current={today && today.id === focusedId ? 'step' : undefined}>{task.title}
              {task.practice && (today ? ' · 今日练习' : ' · 按安排进行')}</button></li>
          })}</ul> : <p className="text-xs">暂无</p>}
        </section>
      ))}
      {days.length > 1 && (
        <section>
          <h3 className="font-semibold">历史学习日</h3>
          {[...days.slice(0, -1)].reverse().map((record) => (
            <details key={record.id} className="mt-1 border-t border-line py-1">
              <summary className="cursor-pointer">Day {record.dayNumber} · 完成 {record.instances.filter(({ status }) => status === 'completed').length}/{record.instances.filter(({ held }) => !held).length}</summary>
              {projectQuestionDays.has(record.id) && <button type="button" className="text-left underline" onClick={() => onProjectHistory(record)}>
                查看 Day {record.dayNumber} 项目答疑
              </button>}
              {record.instances.length ? <ul>{record.instances.map((item) => (
                <li key={item.id}><button type="button" className="text-left underline" onClick={() => onHistory(item, record)}>
                  {item.task.title} · {item.held ? (item.startedAt === null ? '已调整安排' : '已暂停，曾开始')
                    : item.status === 'completed' ? '已完成' : '未完成'}
                </button></li>
              ))}</ul> : <p className="text-xs">该日没有安排任务</p>}
            </details>
          ))}
        </section>
      )}
    </div>
  )
}

export default function DailyLearningView({ initialPlan, sourceFiles, restored }) {
  const { session, storageStatus, dispatch, updateMessages, decideChange, respondToPrompt } = useDailyLearning(initialPlan, restored)
  const plan = activeLearningPlan(session)
  const tools = useLearningTools(plan)
  const { messages, pendingKey, sendQuestion } = useLearningChat(plan, undefined, { messages: session.messages, updateMessages })
  const [selectedId, setSelectedId] = useState(null)
  const [review, setReview] = useState(null)
  const [transition, setTransition] = useState('')
  const day = session.days.at(-1)
  const scheduled = currentDayInstances(session)
  const required = scheduled.filter(({ optional }) => !optional)
  const options = scheduled.filter(({ optional }) => optional)
  const done = getOneTimeProgress(session.days)
  const completed = required.filter(({ status }) => status === 'completed').length
  const minutes = scheduled.reduce((sum, { task }) => sum + task.estimatedMinutes, 0)
  const focused = scheduled.find(({ id }) => id === selectedId) ??
    required.find(({ status }) => status === 'inProgress') ?? required.find(({ status }) => status === 'notStarted')
  const task = review ? review.task : focused?.task
  const activeInstance = review ? review.instance : focused
  const chatContext = { projectId: session.projectId, dayId: review ? review.dayId : day.id, instanceId: activeInstance?.id ?? null }
  const chatTaskId = task?.id ?? null
  const projectQuestionDays = new Set([...messages, ...(session.agent?.notes ?? [])]
    .filter(({ taskId }) => taskId === null).map(({ dayId }) => dayId))
  const taskTitles = new Map([...session.plan.tasks, ...session.days.flatMap(({ instances }) => instances.map(({ task }) => task)),
    ...plan.tasks].map(({ id, title }) => [id, title]))
  for (const change of session.agent?.changes ?? []) {
    for (const { taskId, before, after } of change.delta.tasks) {
      if (!taskTitles.has(taskId)) taskTitles.set(taskId, (after ?? before).title)
    }
  }
  const clarifications = clarificationCards(session, day.id, chatContext.dayId, chatTaskId, Boolean(review)).map((note) => ({
    ...note, taskTitle: note.taskTitle ?? (note.taskId === null ? '学习项目' : taskTitles.get(note.taskId) ?? '相关任务'),
    dayNumber: session.days.find(({ id }) => id === note.dayId)?.dayNumber,
  }))

  function select(id) {
    setReview(null)
    setSelectedId(id)
  }

  function openTask(definition) {
    const today = scheduled.find(({ task }) => task.id === definition.id)
    if (today) select(today.id)
    else {
      const moved = day.instances.find(({ task }) => task.id === definition.id)
      if (moved) {
        openHistory(moved, day)
        return
      }
      const completedDay = session.days.find((record) => record.instances.some(
        ({ task, status }) => task.id === definition.id && status === 'completed' && task.type === 'oneTime'))
      const instance = completedDay?.instances.find(({ task, status }) => task.id === definition.id && status === 'completed')
      setReview(instance ? { task: instance.task, instance, dayId: completedDay.id, dayNumber: completedDay.dayNumber } : { task: definition })
    }
    tools.setOpenPanel(null)
  }

  function openHistory(instance, record) {
    setReview({ task: instance.task, instance, dayId: record.id, dayNumber: record.dayNumber })
    tools.setOpenPanel(null)
  }

  function openProjectHistory(record) {
    setReview(record.id === day.id && !focused ? null : { dayId: record.id, dayNumber: record.dayNumber })
    tools.setOpenPanel('qa')
  }

  function changeTask(type, instanceId, feedback) {
    if (type === 'complete') setSelectedId(null)
    void dispatch({ type, instanceId, dayId: day.id, feedback })
  }

  async function advance(event) {
    if (event.detail > 1) return
    const dayId = day.id
    const next = await dispatch({ type: 'advance', dayId })
    if (next && next.days.at(-1).id !== dayId) {
      setTransition(completed < required.length ? `Day ${day.dayNumber} 的未完成状态已保留。` : '')
      select(null)
    }
  }

  return (
    <div className="mt-7 grid items-start gap-4 sm:mt-10 md:grid-cols-[3.5rem_minmax(0,1fr)] md:gap-5">
      <article aria-labelledby="today-heading" className="min-w-0 rounded-[1.75rem] border border-line bg-paper px-5 py-6 sm:px-9 sm:py-9">
        {storageStatus !== 'saved' && <p role="status" className="mb-4 rounded-xl bg-error-light px-3 py-2 text-sm text-error">
          {storageStatus === 'conflict' ? '本地记录已在其他页面变更，请刷新后继续。' : '暂时无法保存学习记录，可以继续学习，刷新可能丢失新增进度。'}
        </p>}
        <header className="space-y-2">
          <p className="text-sm text-muted">{plan.topic} · Day {day.dayNumber}</p>
          <h1 id="today-heading" className="text-2xl font-semibold sm:text-3xl">今日学习</h1>
          <p className="text-sm text-muted">预计 {minutes} 分钟{options.length > 0 ? '（含选学）' : ''} · 必做完成 {completed} / {required.length}</p>
          {transition && <p role="status" className="text-sm text-muted">{transition}</p>}
          <details className="text-xs leading-relaxed text-muted">
            <summary className="cursor-pointer">资料支持范围 · {plan.supportedScope}</summary>
            {plan.coverageGaps.map((gap) => <p key={gap}>{gap}</p>)}
          </details>
          {plan.notices.map((notice) => <p key={notice} className="text-sm text-muted">{notice}</p>)}
          <p id="agent-data-notice" className="text-xs leading-relaxed text-muted">
            推进学习日或提交学习反馈时，相关学习记录、问答和资料片段会发送给 DeepSeek，用于判断是否需要教学帮助。数据处理以 DeepSeek 的条款为准。
          </p>
        </header>
        <div className="mt-5 space-y-4">
          <DailyList label="周期练习" items={required.filter(({ task }) => task.type === 'recurring')} focusedId={review ? null : focused?.id} onSelect={select} />
          <DailyList label="一次性学习" items={required.filter(({ task }) => task.type === 'oneTime')} focusedId={review ? null : focused?.id} onSelect={select} />
          <DailyList label="选学 · 可跳过" items={options} focusedId={review ? null : focused?.id} onSelect={select} />
          {completed === required.length && <p className="rounded-xl bg-oat px-3 py-2 text-sm text-muted">
            {required.length ? '今日必做已完成，可以结束今天的学习。' : '本学习日没有到期任务，可以回看或进入下一学习日。'}
          </p>}
        </div>
        {review && <button type="button" className="secondary-button mt-5 min-h-10 rounded-full px-4 text-sm" onClick={() => select(null)}>
          返回今日学习{review.dayNumber ? ` · 正在回看 Day ${review.dayNumber}` : ''}
        </button>}
        {task && <TaskDetail key={activeInstance?.id ?? task.id} task={task} instance={activeInstance} tools={tools}
          criteria={[...new Set([...feedbackCriteria(plan, task.id), task.selfCheck].filter(Boolean))]}
          onAction={changeTask} isReviewing={Boolean(review)} />}
        <TeachingUpdates session={session} day={day} review={review} taskTitles={taskTitles} tools={tools} onCommand={decideChange}
          onOpenChat={tools.openChat} />
        <footer className="mt-6 flex flex-wrap items-center justify-end gap-x-3 border-t border-line pt-3">
          {completed < required.length && <p className="mr-auto text-xs text-muted">还有未完成任务，原记录会保留。</p>}
          <button key={day.id} type="button" className="min-h-10 rounded-lg px-2 text-xs text-muted underline-offset-4 hover:underline" onClick={advance}
            aria-describedby="agent-data-notice"
            title="推进 24 小时模拟学习时间"
            onKeyDown={(event) => { if (event.repeat) event.preventDefault() }}>
            下一日
          </button>
        </footer>
      </article>
      <LearningTools tools={tools} plan={plan} sourceFiles={sourceFiles} isRestored={Boolean(restored)}
        route={<DailyRoute plan={plan} day={day} days={session.days} scheduled={scheduled} done={done} onTask={openTask} onHistory={openHistory}
          projectQuestionDays={projectQuestionDays} onProjectHistory={openProjectHistory} focusedId={focused?.id} />}
        chat={{ task, canAsk: !review, dayNumber: review ? review.dayNumber : day.dayNumber,
          scopeKey: chatScopeKey(chatTaskId, chatContext), messages: scopedChatTurns(messages, chatTaskId, chatContext), pendingKey,
          clarifications, onClarification: respondToPrompt, onSend: (selectedTask, draft) => sendQuestion(selectedTask, draft, chatContext) }} />
    </div>
  )
}
