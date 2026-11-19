import { useCallback, useEffect, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mediaUrl } from '@/features/content/queries'
import type { RouteId } from '@/features/content/schema'
import type { QuizQuestion } from './bank'

type ClipPhase = 'loading' | 'ready' | 'playing' | 'paused' | 'finished' | 'failed'

export function QuizClip({ routeId, clip, suspended, onReady }: {
  routeId: RouteId
  clip: NonNullable<QuizQuestion['clip']>
  suspended: boolean
  onReady: (ready: boolean) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const autoplayAttempt = useRef(-1)
  const [phase, setPhase] = useState<ClipPhase>('loading')
  const [attempt, setAttempt] = useState(0)
  const start = clip.startMs / 1000
  const end = clip.endMs / 1000
  const latestReady = useRef(onReady)
  latestReady.current = onReady

  const fail = useCallback(() => {
    video.current?.pause()
    setPhase('failed')
    latestReady.current(false)
  }, [])

  const playClip = useCallback((element: HTMLVideoElement) => {
    element.muted = true
    void element.play().catch(error => {
      if (video.current === element && error.name !== 'AbortError' && error.name !== 'NotAllowedError') fail()
    })
  }, [fail])

  function locate() {
    const element = video.current
    if (!element || !Number.isFinite(element.duration)) return
    if (end >= element.duration) { fail(); return }
    if (Math.abs(element.currentTime - start) >= 0.05) element.currentTime = start
    confirmStart()
  }

  function confirmStart() {
    const element = video.current
    if (element && element.readyState >= 2 && !element.seeking && Math.abs(element.currentTime - start) < 0.05) {
      setPhase(current => current === 'loading' ? 'ready' : current)
    }
  }

  function finishAtEnd(element: HTMLVideoElement) {
    if (element.seeking || element.currentTime < end - 0.035) return false
    element.pause()
    setPhase('finished')
    latestReady.current(true)
    return true
  }

  useEffect(() => {
    if (phase !== 'playing') return
    const element = video.current
    if (!element) return
    let request = 0
    const check = () => {
      if (!finishAtEnd(element)) request = requestAnimationFrame(check)
    }
    request = requestAnimationFrame(check)
    return () => cancelAnimationFrame(request)
  }, [phase, end])

  useEffect(() => {
    if (phase !== 'loading') return
    const timeout = window.setTimeout(fail, 15_000)
    return () => window.clearTimeout(timeout)
  }, [phase, attempt, fail])

  useEffect(() => {
    const element = video.current
    const pauseInBackground = () => { if (document.hidden) element?.pause() }
    document.addEventListener('visibilitychange', pauseInBackground)
    return () => {
      document.removeEventListener('visibilitychange', pauseInBackground)
      element?.pause()
    }
  }, [attempt])

  useEffect(() => { if (suspended) video.current?.pause() }, [suspended])

  useEffect(() => {
    const element = video.current
    if (phase !== 'ready' || !element || autoplayAttempt.current === attempt) return
    autoplayAttempt.current = attempt
    if (!suspended && !document.hidden) playClip(element)
  }, [phase, attempt, suspended, playClip])

  function togglePlayback() {
    const element = video.current
    if (!element || suspended || document.hidden) return
    if (phase === 'playing') { element.pause(); return }
    if (phase === 'finished') element.currentTime = start
    playClip(element)
  }

  const visible = phase !== 'loading' && phase !== 'failed'
  const Icon = phase === 'playing' ? Pause : phase === 'finished' ? RotateCcw : Play
  const label = phase === 'playing' ? '暂停短片' : phase === 'finished' ? '重看短片' : phase === 'paused' ? '继续播放' : '播放短片'

  return <div className="min-w-0 space-y-2">
    <div className="video-frame rounded-md border" aria-label="本题实景短片" aria-busy={phase === 'loading'}>
      <video key={attempt} ref={video} src={`${mediaUrl(routeId, 'mp4')}#t=${start},${end}`}
        muted playsInline preload="auto" disablePictureInPicture disableRemotePlayback
        className={visible ? '' : 'invisible'} onLoadedMetadata={locate} onLoadedData={confirmStart} onSeeked={confirmStart}
        onError={fail} onContextMenu={event => event.preventDefault()} aria-label="静音路线短片"
        onPlay={event => {
          if (suspended || document.hidden) event.currentTarget.pause()
          else setPhase('playing')
        }}
        onTimeUpdate={event => { if (phase === 'playing') finishAtEnd(event.currentTarget) }}
        onPause={event => {
          if (phase === 'playing' && !finishAtEnd(event.currentTarget)) setPhase(current => current === 'playing' ? 'paused' : current)
        }} />
      <div aria-hidden className="absolute inset-x-0 bg-black" style={{ top: `${clip.maskTop}%`, height: `${clip.maskHeight}%` }} />
      {!visible && <div className="absolute inset-0 grid place-items-center bg-background p-3 text-center">
        {phase === 'failed' ? <div role="alert" className="space-y-2">
          <p>暂时无法加载这段短片。</p>
          <Button variant="outline" onClick={() => { setPhase('loading'); setAttempt(value => value + 1) }}><RotateCcw aria-hidden />重新加载</Button>
        </div> : <p role="status">正在准备短片…</p>}
      </div>}
    </div>
    {visible && <Button className="w-full" variant="outline" disabled={suspended} onClick={togglePlayback}><Icon aria-hidden />{label}</Button>}
  </div>
}
