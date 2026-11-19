import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { mediaUrl } from '@/features/content/queries'
import { useSettings } from '@/features/settings/settings'
import { memoryLeadIn } from '../model'
import type { MemorySource } from '../progress'
import type { QuizQuestion } from './bank'

export function QuizReplay({ source, questions, trigger, onClose }: {
  source: MemorySource
  questions: QuizQuestion[]
  trigger: HTMLButtonElement | null
  onClose: () => void
}) {
  const ids = new Set(questions.flatMap(question => question.topicEventIds))
  const clips = source.events.filter(event => ids.has(event.id))
  return <Dialog open={questions.length > 0} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:max-w-4xl"
      onCloseAutoFocus={event => { event.preventDefault(); trigger?.focus({ preventScroll: true }) }}>
      <DialogHeader>
        <DialogTitle>回看实景</DialogTitle>
        <DialogDescription>关闭后可继续查看小测结果。</DialogDescription>
      </DialogHeader>
      {clips.length > 0 && <ReplayClips source={source} clips={clips} questions={questions} />}
      <DialogFooter><DialogClose asChild><Button>返回小测结果</Button></DialogClose></DialogFooter>
    </DialogContent>
  </Dialog>
}

function ReplayClips({ source, clips, questions }: {
  source: MemorySource
  clips: MemorySource['events']
  questions: QuizQuestion[]
}) {
  const [index, setIndex] = useState(0)
  const clip = clips[index]
  const question = questions.find(question => question.anchorEventId === clip.id && (question.frame || question.clip))
  const leadIn = Math.max(memoryLeadIn(source.events, clip), clip.windowStartMs - 12_000)
  const start = (question?.clip?.startMs ?? Math.min(leadIn, question?.frame?.atMs ?? leadIn)) / 1000
  const end = clip.windowEndMs / 1000
  return <>
    <p className="font-semibold" aria-live="polite">{clip.title}{clips.length > 1 && ` · ${index + 1} / ${clips.length} 段`}</p>
    <ReplayVideo key={clip.id} src={mediaUrl(source.routeId, 'mp4')} start={start} end={end} title={clip.title} />
    {clips.length > 1 && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft aria-hidden />上一段</Button>
      <Button variant="outline" disabled={index === clips.length - 1} onClick={() => setIndex(index + 1)}>下一段<ArrowRight aria-hidden /></Button>
    </div>}
  </>
}

function ReplayVideo({ src, start, end, title }: { src: string; start: number; end: number; title: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  const { settings } = useSettings()
  useEffect(() => {
    const element = video.current
    const stopWhenHidden = () => { if (document.hidden) element?.pause() }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => document.removeEventListener('visibilitychange', stopWhenHidden)
  }, [])
  return <>
    <video ref={video} src={`${src}#t=${start},${end}`} aria-label={`${title}的实景视频`}
      className="aspect-video max-h-[50dvh] w-full rounded-md bg-black" controls playsInline autoPlay muted={!settings.originalAudio}
      onPlay={event => {
        const element = event.currentTarget
        if (element.currentTime < start || element.currentTime >= end - 0.05) element.currentTime = start
      }}
      onSeeked={event => {
        const element = event.currentTarget
        if (element.currentTime < start - 0.05) element.currentTime = start
        if (element.currentTime > end) { element.pause(); element.currentTime = end }
      }}
      onTimeUpdate={event => { if (event.currentTarget.currentTime >= end) event.currentTarget.pause() }}
      onError={() => setFailed(true)} />
    {failed && <p role="alert" className="text-base">暂时无法加载这段实景。<Button variant="outline" onClick={() => { setFailed(false); video.current?.load() }}>重新加载</Button></p>}
  </>
}
