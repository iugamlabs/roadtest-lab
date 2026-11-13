import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Map, Pause, Play, RotateCcw, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { routeIdSchema, subtitleText, type RouteId } from '@/features/content/schema'
import { eventsQueryOptions, formatTime, mediaUrl, roadRoutes, subtitlesQueryOptions } from '@/features/content/queries'
import { playbackRates, playbackRateSchema, useSettings } from '@/features/settings/settings'
import { useTraining } from '@/features/training/use-training'
import { TrainingEventList, TrainingPanel } from '@/features/training/training-panel'
import { useManualCalibration } from '@/features/training/use-manual-calibration'
import { CalibrationPanel } from '@/features/training/calibration-panel'
import { pauseTimeMs } from '@/features/training/practice-events'

export const Route = createFileRoute('/train/$routeId')({
  beforeLoad: ({ params }) => { if (!routeIdSchema.safeParse(params.routeId).success) throw notFound() },
  loader: ({ context, params }) => Promise.all([
    context.queryClient.ensureQueryData(subtitlesQueryOptions(routeIdSchema.parse(params.routeId))),
    context.queryClient.ensureQueryData(eventsQueryOptions(routeIdSchema.parse(params.routeId))),
  ]),
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
  const { data: eventData } = useSuspenseQuery(eventsQueryOptions(routeId))
  const { settings, save } = useSettings()
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const calibration = useManualCalibration(eventData, Math.round(duration * 1000))
  const training = useTraining(calibration.events, video)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationEventId, setCalibrationEventId] = useState<string | null>(null)
  const [audio, setAudio] = useState(settings.originalAudio)
  const [speed, setSpeed] = useState(settings.playbackRate)
  const [blur, setBlur] = useState(settings.blurSubtitles)
  const [maskTop, setMaskTop] = useState(settings.maskTop)
  const [maskHeight, setMaskHeight] = useState(settings.maskHeight)
  const [mediaError, setMediaError] = useState(false)
  const [maskMessage, setMaskMessage] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [mapError, setMapError] = useState(false)
  const [showSubtitles, setShowSubtitles] = useState(false)
  const currentCue = data.cues.find(cue => cue.startMs <= time * 1000 && cue.endMs > time * 1000)
  const mediaReady = duration > 0 && !mediaError
  const practicing = training.state.enabled && training.state.phase === 'practice'
  const pauseControl = practicing ? !training.state.suspensions.includes('user') : playing
  const playbackLabel = practicing ? pauseControl ? '暂停练习' : '继续练习' : playing ? '暂停' : '播放视频'
  const playbackDisabled = !training.controller || mediaError || training.state.seeking
    || training.state.enabled && (training.state.phase === 'review' || training.state.phase === 'finished')
    || training.state.suspensions.some(reason => reason !== 'user' && reason !== 'buffering')

  useEffect(() => { if (video.current) video.current.playbackRate = Number(speed) }, [speed])
  function togglePlayback() { if (!mediaError) training.controller?.toggle() }
  function seek(value: number) {
    if (video.current && duration > 0) {
      const next = Math.max(0, Math.min(duration, value))
      training.controller?.seek(next)
      setTime(next)
    }
  }

  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Button asChild variant="ghost" size="icon" className="size-11"><Link to="/" aria-label="返回路线选择" title="返回路线选择"><ArrowLeft aria-hidden /></Link></Button><h1 className="page-title">{route.name}</h1></div>
      <div className="flex max-w-full flex-wrap items-center gap-3"><Badge variant="secondary">{training.state.enabled ? '操作练习' : '路线学习'} · C2</Badge>
        <Button variant="outline" disabled={!training.controller} aria-pressed={calibrating} onClick={() => {
          if (!calibrating) {
            const position = (video.current?.currentTime ?? time) * 1000
            const closest = calibration.events.reduce<(typeof calibration.events)[number] | undefined>((best, event) => !best || Math.abs(pauseTimeMs(event) - position) < Math.abs(pauseTimeMs(best) - position) ? event : best, undefined)
            setCalibrationEventId(training.state.activeId ?? closest?.id ?? null)
          }
          training.controller?.stop(); setCalibrating(value => !value)
        }}><SlidersHorizontal aria-hidden />{calibrating ? '完成校准' : '人工校准'}</Button>
        <Dialog open={showMap} onOpenChange={open => { training.controller?.setMap(open); setShowMap(open) }}>
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
      <Card className="gap-0 min-w-0 overflow-hidden py-0" role="region" aria-label="路线视频">
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
          <div className="flex flex-wrap gap-3"><Button onClick={togglePlayback} disabled={playbackDisabled}>{pauseControl ? <Pause aria-hidden /> : <Play aria-hidden />}{playbackLabel}</Button><Button variant="outline" disabled={!mediaReady || !training.controller} onClick={() => seek(time - 10)}><RotateCcw aria-hidden />后退 10 秒</Button><Button variant="outline" aria-pressed={audio} onClick={() => setAudio(value => !value)}>{audio ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}{audio ? '原声开启' : '原声关闭'}</Button></div>
          <div className="flex flex-wrap items-center gap-3"><Label htmlFor="playback-speed">播放速度</Label><Select value={speed} onValueChange={value => { const parsed = playbackRateSchema.safeParse(value); if (parsed.success) setSpeed(parsed.data) }}><SelectTrigger id="playback-speed" className="min-h-[56px] w-[7rem] text-base"><SelectValue /></SelectTrigger><SelectContent>{playbackRates.map(value => <SelectItem key={value} value={value} className="min-h-11 text-base">{value} 倍</SelectItem>)}</SelectContent></Select></div>
        </CardContent>
      </Card>
      <aside className="min-w-0 space-y-4">
        {calibrating ? <CalibrationPanel source={eventData} initialEventId={calibrationEventId} calibration={calibration} durationMs={Math.round(duration * 1000)} positionMs={Math.round(time * 1000)} ready={mediaReady && Boolean(training.controller) && !training.state.seeking} getPositionMs={() => Math.round((video.current?.currentTime ?? time) * 1000)} onSeek={seek} onPause={() => training.controller?.pause()} onClose={() => { training.controller?.stop(); setCalibrating(false) }} /> : <><TrainingPanel {...training} mediaReady={mediaReady} />{calibration.message && <p role="status" className="rounded-md border p-3 text-base">{calibration.message}</p>}</>}
        <Card className="gap-0"><CardContent><div className="flex items-center justify-between gap-3"><Label htmlFor="player-blur" className="min-h-11 flex-1">模糊画面字幕</Label><Switch id="player-blur" checked={blur} onCheckedChange={setBlur} /></div><p className="muted mt-2 text-base">遮罩为手动设置，开启后请确认没有挡住道路标志。视频原声可单独关闭。</p>
          <details className="mt-3"><summary className="cursor-pointer py-3 text-base">调整遮罩范围</summary><div className="space-y-4 pt-3">
            <label className="block text-base">顶部位置：{maskTop}%<input type="range" min={0} max={100 - maskHeight} value={maskTop} onChange={event => setMaskTop(Number(event.target.value))} /></label>
            <label className="block text-base">高度：{maskHeight}%<input type="range" min={5} max={Math.min(40, 100 - maskTop)} value={maskHeight} onChange={event => setMaskHeight(Number(event.target.value))} /></label>
            <Button variant="outline" onClick={() => setMaskMessage(save({ ...settings, blurSubtitles: blur, maskTop, maskHeight }) ? '遮罩设置已保存。' : '本次已生效，浏览器未允许保存设置。')}>保存遮罩设置</Button><p role="status" className="muted text-base">{maskMessage}</p>
          </div></details>
        </CardContent></Card>
      </aside>
    </div>
    {!calibrating && <TrainingEventList {...training} mediaReady={mediaReady} />}
    <Card className="mt-5 gap-0"><CardContent><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">教学字幕</h2><Button variant="outline" aria-expanded={showSubtitles} onClick={() => setShowSubtitles(value => !value)}>{showSubtitles ? '收起字幕' : '显示当前字幕'}</Button></div><p className="muted mt-2 text-base">跟随视频查看讲解。完整字幕可在路线资料中查看。</p>{showSubtitles && <p className="mt-4 whitespace-pre-line rounded-md bg-secondary p-4 text-lg">{currentCue ? subtitleText(currentCue) : '当前时段没有字幕。'}</p>}</CardContent></Card>
  </>
}
