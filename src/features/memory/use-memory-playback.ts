import { useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react'
import type { CalibratedEvent } from '@/features/content/schema'
import { memoryLeadIn, memoryPosition, type MemoryAction, type MemoryMode, type MemoryState } from './model'

export function useMemoryPlayback(state: MemoryState, dispatch: Dispatch<MemoryAction>, events: CalibratedEvent[]) {
  const video = useRef<HTMLVideoElement>(null)
  const latest = useRef(state)
  latest.current = state
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [notice, setNotice] = useState('')
  const autoplay = useRef(false)
  const generation = useRef(0)
  const wantsPlayback = useRef(false)
  const updating = useRef(false)

  function pause() {
    generation.current++
    wantsPlayback.current = false
    autoplay.current = false
    video.current?.pause()
    setPlaying(false)
  }

  async function play() {
    const element = video.current
    const current = latest.current
    if (!element || document.hidden || !['travelling', 'revealed'].includes(current.phase)) return
    const request = ++generation.current
    wantsPlayback.current = true
    // Apply the recall audio restriction before the first frame starts playing.
    element.muted = current.mode === 'recall' && current.phase !== 'revealed' || !originalAudio.current
    setNotice('')
    try {
      await element.play()
      if (!wantsPlayback.current || document.hidden) element.pause()
    } catch {
      if (request === generation.current) { wantsPlayback.current = false; setNotice('视频暂时没能开始，请再点播放。') }
    }
  }
  // The player owns persisted audio preferences; remember the rendered value for imperative playback.
  const originalAudio = useRef(true)

  function onTime(seconds: number) {
    if (updating.current) return
    const current = latest.current
    const event = current.targets[current.index]
    const element = video.current
    const limit = event && current.phase === 'travelling' ? memoryPosition(event) / 1000
      : event && current.phase === 'revealed' ? event.windowEndMs / 1000 : null
    if (limit !== null && seconds >= limit) {
      updating.current = true
      pause()
      if (element && Math.abs(element.currentTime - limit) > 0.03) element.currentTime = limit
      setTime(limit)
      if (current.phase === 'travelling') dispatch({ type: 'arrive' })
      updating.current = false
    } else setTime(seconds)
  }
  const onTimeRef = useRef(onTime)
  onTimeRef.current = onTime

  useLayoutEffect(() => {
    const element = video.current
    if (!element) return
    if (state.phase !== 'travelling') { pause(); return }
    element.pause()
    const event = state.targets[state.index]
    if (!event) return
    // Adjacent targets play continuously; a new/repeated/nonadjacent target includes a lead-in.
    const previous = state.targets[state.index - 1]
    const adjacent = previous && events.findIndex(item => item.id === event.id) === events.findIndex(item => item.id === previous.id) + 1
    const position = adjacent ? memoryPosition(previous) : memoryLeadIn(events, event)
    element.currentTime = position / 1000
    setTime(position / 1000)
    if (autoplay.current) { autoplay.current = false; void play() }
  }, [state])

  useEffect(() => {
    if (!playing) return
    let frame = 0
    const tick = () => {
      if (video.current) onTimeRef.current(video.current.currentTime)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing])

  useEffect(() => {
    const visibility = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', visibility)
    const element = video.current
    const position = () => { if (element) onTimeRef.current(element.currentTime) }
    element?.addEventListener('seeked', position)
    return () => {
      generation.current++
      wantsPlayback.current = false
      element?.pause()
      document.removeEventListener('visibilitychange', visibility)
      element?.removeEventListener('seeked', position)
    }
  }, [])

  function seek(seconds: number) {
    const current = latest.current
    const event = current.targets[current.index]
    if (!video.current || !event || !['travelling', 'revealed'].includes(current.phase)) return
    pause()
    const limit = current.phase === 'travelling' ? memoryPosition(event) : event.windowEndMs
    const next = Math.max(memoryLeadIn(events, event) / 1000, Math.min(limit / 1000, duration, seconds))
    video.current.currentTime = next
    onTime(next)
  }

  function start(mode: MemoryMode, targets: CalibratedEvent[]) {
    pause()
    autoplay.current = true
    dispatch({ type: 'start', mode, targets })
  }
  function advance(action: MemoryAction) {
    pause()
    autoplay.current = true
    dispatch(action)
  }
  function replay() {
    const event = latest.current.targets[latest.current.index]
    if (!event || !video.current) return
    pause()
    const position = memoryLeadIn(events, event) / 1000
    video.current.currentTime = position
    setTime(position)
    void play()
  }

  return { video, time, duration, playing, mediaError, notice, setDuration, setPlaying, setMediaError, originalAudio,
    onTime, seek, pause, start, advance, replay,
    controller: { toggle: () => { if (video.current?.paused) void play(); else pause() } },
  }
}
