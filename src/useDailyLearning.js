import { useEffect, useRef, useState } from 'react'
import { updateScopedChatMessages } from './chatMessages.js'
import { resolveAgentChange } from './agentActions.js'
import { runLearningAgent } from './learningAgent.js'
import { createDailySession, updateLearningDay } from './learningDays.js'
import { saveWithLearningObservation } from './learningObservation.js'
import { LEARNING_SESSION_KEY, loadLearningSession, saveDailyLearningSession } from './learningSessionStorage.js'
import { respondToClarification } from './teachingInteractions.js'

const writeLock = `${LEARNING_SESSION_KEY}.write`

export function useDailyLearning(plan, restored) {
  const [session, setSession] = useState(() => restored ?? createDailySession(plan, crypto.randomUUID(), Date.now()))
  const [storageStatus, setStorageStatus] = useState('saved')
  const current = useRef(session)
  const persisted = useRef(Boolean(restored))
  const savedRevision = useRef(restored?.revision ?? -1)
  const queue = useRef(Promise.resolve())

  function adopt(next) {
    current.current = next
    setSession(next)
  }

  function transact(update, { trigger, durable = false } = {}) {
    function apply() {
      const local = current.current
      const stored = loadLearningSession()
      const remote = stored.session
      if (stored.status === 'invalid' || (stored.status === 'empty' && persisted.current) ||
        (stored.status === 'restored' && remote?.projectId !== local.projectId) ||
        (remote?.revision > savedRevision.current && local.revision > savedRevision.current && persisted.current)) {
        setStorageStatus('conflict')
        return
      }
      const base = remote?.revision > local.revision ? remote : local
      const updated = update(base)
      if (durable && updated === base) return { next: base }
      const { session: next, saved, event } = trigger && updated !== base
        ? saveWithLearningObservation(base, updated, trigger, saveDailyLearningSession)
        : { session: updated, saved: updated === remote || saveDailyLearningSession(updated) }
      if (saved) {
        persisted.current = true
        savedRevision.current = next.revision
      }
      if (!saved && durable) {
        setStorageStatus('unavailable')
        return
      }
      adopt(next)
      setStorageStatus(saved ? 'saved' : 'unavailable')
      return { next, event }
    }

    const next = queue.current.then(() => globalThis.navigator?.locks ? navigator.locks.request(writeLock, apply) : apply())
    queue.current = next.catch(() => setStorageStatus('unavailable'))
    return queue.current.then((result) => {
      if (result?.event) {
        void runLearningAgent(result.event, { commit: (apply) => transact(apply, { durable: true }) }).catch(() => {})
      }
      return result?.next
    })
  }

  useEffect(() => {
    if (!restored) void transact((state) => state)
    function sync(event) {
      if (event.key !== LEARNING_SESSION_KEY) return
      const { session: remote } = loadLearningSession()
      if (remote?.projectId !== current.current.projectId) setStorageStatus('conflict')
      else if (remote?.revision > savedRevision.current) {
        if (current.current.revision > savedRevision.current) setStorageStatus('conflict')
        else {
          savedRevision.current = remote.revision
          adopt(remote)
          setStorageStatus('saved')
        }
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function dispatch(action) {
    const now = Date.now()
    return transact((state) => updateLearningDay(state, { ...action, now }), { trigger: action })
  }

  function updateMessages(update, context, replyId) {
    return transact((state) => updateScopedChatMessages(state, context, update), {
      trigger: replyId && { type: 'chatReply', messageId: replyId },
    })
  }

  async function saveTeachingInteraction(update, trigger) {
    let changed = false
    const saved = await transact((state) => {
      const updated = update(state)
      changed = updated !== state
      return updated
    }, { trigger, durable: true })
    return Boolean(saved && changed)
  }

  function decideChange(id, command) {
    return saveTeachingInteraction((state) => resolveAgentChange(state, id, command, Date.now()))
  }

  function respondToPrompt(noteId, text) {
    const messageId = text === undefined ? undefined : crypto.randomUUID()
    return saveTeachingInteraction((state) => respondToClarification(state,
      { noteId, messageId, text, now: Date.now(), projectId: session.projectId }),
    messageId && { type: 'clarificationReply', messageId })
  }

  return { session, storageStatus, dispatch, updateMessages, decideChange, respondToPrompt }
}
