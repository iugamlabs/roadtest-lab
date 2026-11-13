import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { RouteId } from '../../content/schema'
import { BrowserSpeech } from '../speech'
import { createMapSession, mapReducer, type MapState } from './model'
import { mapResult, saveMapResult } from './history'

export function useMapSession(routeId: RouteId, seed: number, mode: MapState['mode'], voice: boolean, single?: string) {
  const [state, dispatch] = useReducer(mapReducer, null, () => createMapSession(routeId, seed, mode, voice, single))
  const [saved, setSaved] = useState<boolean | null>(null)
  const id = useRef(crypto.randomUUID())
  const hasSaved = useRef(false)
  const speaker = useRef(new BrowserSpeech())
  useEffect(() => {
    if (state.phase === 'ready' || state.phase === 'review' || state.phase === 'finished') return
    let last = performance.now()
    const timer = window.setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', deltaMs: now - last }); last = now }, 100)
    return () => clearInterval(timer)
  }, [state.phase])
  useEffect(() => {
    const visibility = () => dispatch({ type: 'pause', reason: 'hidden', value: document.hidden })
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  const announcementId = state.announcement?.id, text = state.announcement?.text
  const speechAllowed = !state.pauses.some(reason => reason !== 'speech')
  useEffect(() => {
    if (announcementId === undefined || !text || !speechAllowed) return
    return speaker.current.speak(text, { end: () => dispatch({ type: 'speech-end', id: announcementId }), error: () => dispatch({ type: 'speech-error', id: announcementId }) })
  }, [announcementId, text, speechAllowed])
  useEffect(() => {
    if (state.phase !== 'finished' || state.mode !== 'assessment' || state.single !== null || hasSaved.current) return
    hasSaved.current = true
    try { setSaved(saveMapResult(localStorage, mapResult(state, id.current))) } catch { setSaved(false) }
  }, [state])
  const pause = useCallback(() => dispatch({ type: 'pause', reason: 'user', value: true }), [])
  return { state, dispatch, saved, pause }
}
