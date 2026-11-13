import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpLeft, ArrowUpRight, CircleOff, Eye, Footprints, Map, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { routeIdSchema, type RouteId } from '@/features/content/schema'
import { formatTime, mediaUrl, roadRoutes, subtitlesQueryOptions } from '@/features/content/queries'
import { useSettings } from '@/features/settings/settings'

export const Route = createFileRoute('/train/$routeId')({
  beforeLoad: ({ params }) => { if (!routeIdSchema.safeParse(params.routeId).success) throw notFound() },
  loader: ({ context, params }) => context.queryClient.ensureQueryData(subtitlesQueryOptions(routeIdSchema.parse(params.routeId))),
  pendingComponent: () => <p role="status" className="rounded-lg border p-6">正在准备路线资料…</p>,
  component: TrainingPage,
})

function TrainingPage() {
  const { routeId } = Route.useParams()
  const id = routeIdSchema.parse(routeId)
  return <RoutePlayer key={id} routeId={id} />
}

function RoutePlayer({ routeId }: { routeId: RouteId }) {
  const route = roadRoutes.find(value => value.id === routeId)!
  const { data } = useSuspenseQuery(subtitlesQueryOptions(routeId))
  const { settings, save } = useSettings()
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audio, setAudio] = useState(settings.originalAudio)
  const [speed, setSpeed] = useState(settings.playbackRate)
  const [blur, setBlur] = useState(settings.blurSubtitles)
  const [maskTop, setMaskTop] = useState(settings.maskTop)
  const [maskHeight, setMaskHeight] = useState(settings.maskHeight)
  const [mediaError, setMediaError] = useState(false)
  const [feedback, setFeedback] = useState('点击一个按钮，熟悉它的位置与作用。')
  const [playbackMessage, setPlaybackMessage] = useState('')
  const [maskMessage, setMaskMessage] = useState('')
  const [indicator, setIndicator] = useState<'left' | 'right' | 'off'>('off')
  const [showMap, setShowMap] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [showOcr, setShowOcr] = useState(false)
  const currentCue = data.cues.find(cue => cue.startMs <= time * 1000 && cue.endMs > time * 1000)

  useEffect(() => { if (video.current) video.current.playbackRate = Number(speed) }, [speed])
  async function togglePlayback() {
    const element = video.current
    if (!element || mediaError) return
    if (!element.paused) { element.pause(); return }
    try { await element.play(); setPlaybackMessage('') } catch { setPlaybackMessage('视频暂时无法播放，请稍后再试。') }
  }
  function seek(value: number) {
    if (video.current && duration > 0) {
      const next = Math.max(0, Math.min(duration, value))
      video.current.currentTime = next
      setTime(next)
    }
  }
  function setLight(value: 'left' | 'right' | 'off') {
    setIndicator(value)
    setFeedback(value === 'off' ? '已关闭转向灯。' : `已打开${value === 'left' ? '左' : '右'}转向灯。`)
  }

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="size-11"><Link to="/" aria-label="返回路线选择" title="返回路线选择"><ArrowLeft aria-hidden /></Link></Button><h1 className="page-title">{route.name}</h1></div>
      <div className="flex items-center gap-3"><Badge variant="secondary">路线学习 · C2</Badge>
        <Dialog open={showMap} onOpenChange={open => { if (open) video.current?.pause(); setShowMap(open) }}>
          <DialogTrigger asChild><Button variant="outline"><Map aria-hidden />路线图</Button></DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(90vw,64rem)]">
            <DialogHeader><DialogTitle>{route.name}路线图</DialogTitle><DialogDescription>对照路线示意图熟悉位置。关闭后，点击播放视频继续学习。</DialogDescription></DialogHeader>
            {mapError ? <p role="alert" className="muted py-8">路线图暂时无法显示。</p> : <img src={mediaUrl(routeId, 'jpg')} alt={`${route.name}路线示意图`} className="mx-auto max-h-[65dvh] max-w-full object-contain" onError={() => setMapError(true)} />}
            <DialogFooter><DialogClose asChild><Button variant="outline">关闭路线图</Button></DialogClose></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
    <div className="training-grid">
      <Card className="gap-0 overflow-hidden py-0" role="region" aria-label="路线视频">
        <div className="video-frame">
          <video ref={video} src={mediaUrl(routeId, 'mp4')} playsInline preload="metadata" muted={!audio}
            aria-label={`${route.name}教学视频`} onLoadedMetadata={event => { const element = event.currentTarget; element.playbackRate = Number(speed); setDuration(Number.isFinite(element.duration) ? element.duration : 0) }}
            onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
            onError={() => { setMediaError(true); setPlaying(false) }} />
          {blur && !mediaError && <div aria-hidden className="subtitle-mask" style={{ top: `${maskTop}%`, height: `${maskHeight}%` }} />}
          {mediaError && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-white"><p className="text-xl font-bold">暂时无法播放这段视频</p><p className="text-base">请确认视频已准备好，或重新加载页面。</p><Button variant="secondary" onClick={() => { setMediaError(false); video.current?.load() }}>重新加载视频</Button></div>}
        </div>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-3"><span className="min-w-12 text-sm tabular-nums">{formatTime(time)}</span><input aria-label="视频播放进度" type="range" min={0} max={duration || 1} step={.1} value={time} disabled={!duration || mediaError} onChange={event => seek(Number(event.target.value))} /><span className="text-sm tabular-nums">{formatTime(duration)}</span></div>
          <div className="flex flex-wrap gap-3"><Button onClick={togglePlayback} disabled={mediaError}>{playing ? <Pause aria-hidden /> : <Play aria-hidden />}{playing ? '暂停' : '播放视频'}</Button><Button variant="outline" disabled={!duration || mediaError} onClick={() => seek(time - 10)}><RotateCcw aria-hidden />后退 10 秒</Button><Button variant="outline" aria-pressed={audio} onClick={() => setAudio(value => !value)}>{audio ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}{audio ? '原声开启' : '原声关闭'}</Button></div>
          <div className="flex flex-wrap items-center gap-3"><Label htmlFor="playback-speed">播放速度</Label><Select value={speed} onValueChange={value => { if (value === '0.75' || value === '1' || value === '1.25') setSpeed(value) }}><SelectTrigger id="playback-speed" className="min-h-[56px] w-[7rem] text-base"><SelectValue /></SelectTrigger><SelectContent>{['0.75', '1', '1.25'].map(value => <SelectItem key={value} value={value} className="min-h-11 text-base">{value} 倍</SelectItem>)}</SelectContent></Select></div>
          {playbackMessage && <p role="status" className="text-base text-destructive">{playbackMessage}</p>}
        </CardContent>
      </Card>
      <aside className="space-y-4">
        <Card className="gap-0"><CardContent><h2 className="text-xl font-bold">操作熟悉</h2><p className="muted mb-5 mt-2 text-base">这些按钮可以先试一试。当前不判断考试步骤，也不计分。</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant={indicator === 'left' ? 'default' : 'outline'} className="control-button" aria-pressed={indicator === 'left'} onClick={() => setLight('left')}><ArrowUpLeft aria-hidden />左转向灯</Button>
            <Button variant={indicator === 'right' ? 'default' : 'outline'} className="control-button" aria-pressed={indicator === 'right'} onClick={() => setLight('right')}><ArrowUpRight aria-hidden />右转向灯</Button>
            <Button variant="outline" className="control-button" onClick={() => setFeedback('已点击观察左后方。实际驾驶时，需要亲自观察交通情况。')}><Eye aria-hidden />观察左后方</Button>
            <Button variant="outline" className="control-button" onClick={() => setFeedback('已点击观察右后方。实际驾驶时，需要亲自观察交通情况。')}><Eye aria-hidden />观察右后方</Button>
            <Button variant="outline" className="control-button" onClick={() => setFeedback('已点击踩刹车。这是按钮练习，不会改变视频里的车速。')}><Footprints aria-hidden />踩刹车</Button>
            <Button variant="outline" className="control-button" onClick={() => setLight('off')}><CircleOff aria-hidden />关闭转向灯</Button>
          </div><p role="status" className="mt-4 rounded-md bg-secondary p-3 text-base leading-relaxed">{feedback}</p>
        </CardContent></Card>
        <Card className="gap-0"><CardContent><div className="flex items-center justify-between gap-3"><Label htmlFor="player-blur" className="min-h-11 flex-1">模糊画面字幕</Label><Switch id="player-blur" checked={blur} onCheckedChange={setBlur} /></div><p className="muted mt-2 text-base">遮罩为手动设置，开启后请确认没有挡住道路标志。视频原声可单独关闭。</p>
          <details className="mt-3"><summary className="cursor-pointer py-3 text-base">调整遮罩范围</summary><div className="space-y-4 pt-3">
            <label className="block text-base">顶部位置：{maskTop}%<input type="range" min={0} max={100 - maskHeight} value={maskTop} onChange={event => setMaskTop(Number(event.target.value))} /></label>
            <label className="block text-base">高度：{maskHeight}%<input type="range" min={5} max={Math.min(40, 100 - maskTop)} value={maskHeight} onChange={event => setMaskHeight(Number(event.target.value))} /></label>
            <Button variant="outline" onClick={() => setMaskMessage(save({ ...settings, blurSubtitles: blur, maskTop, maskHeight }) ? '遮罩设置已保存。' : '本次已生效，浏览器未允许保存设置。')}>保存遮罩设置</Button><p role="status" className="muted text-base">{maskMessage}</p>
          </div></details>
        </CardContent></Card>
      </aside>
    </div>
    <Card className="mt-5 gap-0"><CardContent><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">原始 OCR 字幕</h2><Button variant="outline" aria-expanded={showOcr} onClick={() => setShowOcr(value => !value)}>{showOcr ? '收起字幕' : '显示当前字幕'}</Button></div><p className="muted mt-2 text-base">文字尚未校对，不能直接作为考试指令。完整字幕可在路线资料中查看。</p>{showOcr && <p className="mt-4 whitespace-pre-line rounded-md bg-secondary p-4 text-lg">{currentCue?.rawText ?? '当前时段没有 OCR 字幕。'}</p>}</CardContent></Card>
  </>
}
