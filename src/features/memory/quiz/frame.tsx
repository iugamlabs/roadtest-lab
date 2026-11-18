import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mediaUrl } from '@/features/content/queries'
import type { RouteId } from '@/features/content/schema'
import type { QuizQuestion } from './bank'

export function QuizFrame({ routeId, question, onReady }: { routeId: RouteId; question: QuizQuestion; onReady: (ready: boolean) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const frame = question.frame!
  const latest = useRef({ question, onReady })
  latest.current = { question, onReady }

  function locate() {
    const element = video.current
    if (!element || !Number.isFinite(element.duration)) return
    if (frame.atMs / 1000 >= element.duration) { fail(); return }
    element.pause()
    element.currentTime = frame.atMs / 1000
  }
  function confirm() {
    const element = video.current
    if (element && element.readyState >= 2 && !element.seeking && Math.abs(element.currentTime - frame.atMs / 1000) < 0.05) {
      setReady(true)
      setError(false)
      latest.current.onReady(true)
    }
  }
  function fail() { setError(true); setReady(false); latest.current.onReady(false) }

  useLayoutEffect(() => {
    setReady(false)
    setError(false)
    latest.current.onReady(false)
    locate()
    const element = video.current
    return () => { element?.pause() }
  }, [question.id, loadAttempt])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const element = video.current
      if (!element || element.readyState < 2 || element.seeking || Math.abs(element.currentTime - frame.atMs / 1000) >= 0.05) fail()
    }, 15_000)
    return () => window.clearTimeout(timeout)
  }, [question.id, loadAttempt])

  return <div className="space-y-2">
    <div className="video-frame overflow-hidden rounded-md border" aria-label="本题实景画面" aria-busy={!ready && !error}>
      <video ref={video} src={mediaUrl(routeId, 'mp4')} muted playsInline preload="metadata" disablePictureInPicture
        className={ready ? '' : 'invisible'} onLoadedMetadata={locate} onLoadedData={confirm} onSeeked={confirm} onError={fail}
        onPlay={event => event.currentTarget.pause()} onContextMenu={event => event.preventDefault()} aria-label="静音定格的路线画面" />
      <div aria-hidden className="absolute inset-x-0 bg-black" style={{ top: `${frame.maskTop}%`, height: `${frame.maskHeight}%` }} />
      {!ready && <div className="absolute inset-0 grid place-items-center bg-background p-5 text-center">{error ? <div role="alert" className="space-y-3"><p>这张实景画面暂时无法读取。</p><Button variant="outline" onClick={() => { setError(false); setLoadAttempt(value => value + 1); video.current?.load() }}><RotateCcw aria-hidden />重新加载画面</Button></div> : <p role="status">正在准备本题画面…</p>}</div>}
    </div>
  </div>
}
