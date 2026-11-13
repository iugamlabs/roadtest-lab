import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { RouteId } from '../content/schema'
import { createExam, examReducer, type ExamAction, type ExamOperation } from './engine'
import { BrowserSpeech } from './speech'
import { resultFrom, saveResult } from './storage'

type WithoutNow<T> = T extends unknown ? Omit<T, 'now'> : never

export function newSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}
export function useExam(routeId: RouteId, seed: number, voice: boolean, singleSceneId?: string) {
  const [state, dispatch] = useReducer(examReducer, null, () => createExam(routeId, seed, performance.now(), voice, singleSceneId))
  const [saved, setSaved] = useState<boolean | null>(null)
  const resultId = useRef(crypto.randomUUID())
  const savedRef = useRef(false)
  const speaker = useRef(new BrowserSpeech())
  const send = useCallback((action: WithoutNow<ExamAction>) => dispatch({ ...action, now: performance.now() } as ExamAction), [])
  const operate = useCallback((operation: ExamOperation) => dispatch({ type: 'operate', operation, now: performance.now() }), [])
  const announcementId = state.announcement?.id
  const announcementText = state.announcement?.text
  const speechAllowed = !state.suspensions.some(reason => reason !== 'speech')
  useEffect(() => {
    if (announcementId === undefined || !announcementText || !speechAllowed) return
    return speaker.current.speak(announcementText, {
      end: () => dispatch({ type: 'speech-end', id: announcementId, now: performance.now() }),
      error: () => dispatch({ type: 'speech-error', id: announcementId, now: performance.now() }),
    })
  }, [announcementId, announcementText, speechAllowed])
  useEffect(() => {
    if (state.phase !== 'running') return
    const timer = window.setInterval(() => dispatch({ type: 'tick', now: performance.now() }), 100)
    return () => window.clearInterval(timer)
  }, [state.phase])
  useEffect(() => {
    const visibility = () => dispatch({ type: 'suspend', reason: 'hidden', value: document.hidden, now: performance.now() })
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  useEffect(() => {
    if (state.phase !== 'finished' || state.single || savedRef.current) return
    savedRef.current = true
    try { setSaved(saveResult(localStorage, resultFrom(state, resultId.current))) } catch { setSaved(false) }
  }, [state])
  return { state, send, dispatch, operate, saved }
}
