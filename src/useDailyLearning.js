import { useEffect, useRef, useState } from 'react'
import { createDailySession, updateLearningDay } from './learningDays.js'
import { LEARNING_SESSION_KEY, loadLearningSession, saveDailyLearningSession } from './learningSessionStorage.js'

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

  function transact(update) {
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
      const next = update(base)
      const saved = next === remote || saveDailyLearningSession(next)
      if (saved) {
        persisted.current = true
        savedRevision.current = next.revision
      }
      adopt(next)
      setStorageStatus(saved ? 'saved' : 'unavailable')
      return next
    }

    const next = queue.current.then(() => globalThis.navigator?.locks ? navigator.locks.request(writeLock, apply) : apply())
    queue.current = next.catch(() => setStorageStatus('unavailable'))
    return queue.current
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
        }
      }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  function dispatch(action) {
    const now = Date.now()
    return transact((state) => updateLearningDay(state, { ...action, now }))
  }

  function updateMessages(update) {
    return transact((state) => {
      const messages = update(state.messages)
      return messages === state.messages ? state : { ...state, messages, revision: state.revision + 1 }
    })
  }

  return { session, storageStatus, dispatch, updateMessages }
}
