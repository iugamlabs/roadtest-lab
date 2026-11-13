import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { RouteId } from '../../content/schema'
import { BrowserSpeech } from '../speech'
import { createMapSession, mapReducer, type MapAction, type MapState } from './model'
import { ExamEffects, operationEffect } from '../audio/effects'
import { mapResult, saveMapResult } from './history'

export function useMapSession(routeId: RouteId, seed: number, mode: MapState['mode'], voice: boolean, sound: boolean, single?: string) {
  const [state, reduce] = useReducer(mapReducer, null, () => createMapSession(routeId, seed, mode, voice, single))
  const [saved, setSaved] = useState<boolean | null>(null)
  const [soundError, setSoundError] = useState(false)
  const effects = useRef<ExamEffects | null>(null)
  useEffect(() => {
    const player = new ExamEffects(() => setSoundError(true))
    effects.current = player
    return () => { player.dispose(); effects.current = null }
  }, [])
  const dispatch = useCallback((action: MapAction) => {
    if (sound) {
      if (action.type === 'start') effects.current?.unlock()
      if (action.type === 'operate') {
        const effect = operationEffect(state, mapReducer(state, action), action.operation)
        if (effect) effects.current?.play(effect)
      }
    }
    reduce(action)
  }, [sound, state])
  const soundSuspended = state.pauses.some(reason => reason !== 'speech') || state.phase === 'ready' || state.phase === 'finished'
  useEffect(() => {
    if (!sound || soundSuspended) effects.current?.silence()
    else effects.current?.syncSignal(!!state.indicator, state.pauses.includes('speech'))
  }, [sound, soundSuspended, state.indicator, state.pauses])
  const id = useRef(crypto.randomUUID())
  const hasSaved = useRef(false)
  const speaker = useRef(new BrowserSpeech())
  useEffect(() => {
    if (state.phase === 'ready' || state.phase === 'review' || state.phase === 'finished') return
    let last = performance.now()
    const timer = window.setInterval(() => { const now = performance.now(); reduce({ type: 'tick', deltaMs: now - last }); last = now }, 100)
    return () => clearInterval(timer)
  }, [state.phase])
  useEffect(() => {
    const visibility = () => { if (document.hidden) effects.current?.silence(); reduce({ type: 'pause', reason: 'hidden', value: document.hidden }) }
    document.addEventListener('visibilitychange', visibility)
    return () => document.removeEventListener('visibilitychange', visibility)
  }, [])
  const announcementId = state.announcement?.id, text = state.announcement?.text
  const speechAllowed = !state.pauses.some(reason => reason !== 'speech')
  useEffect(() => {
    if (announcementId === undefined || !text || !speechAllowed) return
    return speaker.current.speak(text, { end: () => reduce({ type: 'speech-end', id: announcementId }), error: () => reduce({ type: 'speech-error', id: announcementId }) })
  }, [announcementId, text, speechAllowed])
  useEffect(() => {
    if (state.phase !== 'finished' || state.mode !== 'assessment' || state.single !== null || hasSaved.current) return
    hasSaved.current = true
    try { setSaved(saveMapResult(localStorage, mapResult(state, id.current))) } catch { setSaved(false) }
  }, [state])
  const pause = useCallback(() => { effects.current?.silence(); reduce({ type: 'pause', reason: 'user', value: true }) }, [])
  const unlockSound = useCallback(() => effects.current?.unlock(), [])
  return { state, dispatch, saved, pause, soundError, unlockSound }
}
