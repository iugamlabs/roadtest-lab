import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import type { PracticeEvent } from './practice-events'
import { createTrainingState } from './engine'
import { TrainingController } from './controller'

const emptySubscribe = () => () => {}

export function useTraining(events: PracticeEvent[], video: RefObject<HTMLVideoElement | null>) {
  const [controller, setController] = useState<TrainingController | null>(null)
  const [initial] = useState(() => createTrainingState(events))
  useEffect(() => {
    const element = video.current
    if (!element) return
    const current = new TrainingController(events, element)
    const handlers = {
      timeupdate: current.timeUpdate,
      seeking: current.seeking,
      seeked: current.seeked,
      waiting: current.waiting,
      stalled: current.stalled,
      canplay: current.canPlay,
      playing: current.playing,
      pause: current.mediaPaused,
      ended: current.ended,
      error: current.error,
    }
    for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler)
    const visibility = () => current.setHidden(document.hidden)
    document.addEventListener('visibilitychange', visibility)
    visibility()
    const interval = window.setInterval(current.tick, 100)
    setController(current)
    return () => {
      for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler)
      document.removeEventListener('visibilitychange', visibility)
      window.clearInterval(interval)
      current.dispose()
    }
  }, [events, video])
  const state = useSyncExternalStore(controller?.subscribe ?? emptySubscribe, controller?.getSnapshot ?? (() => initial))
  return { state, controller }
}
