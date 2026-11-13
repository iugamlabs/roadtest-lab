import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, List, Map, Pause, Play, RotateCcw, Settings2, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useSidebar } from '@/components/ui/sidebar'
import { RouteMapViewer } from '@/components/route-map'
import { activeEvent, stepsFor } from '@/features/training/engine'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { routeIdSchema, subtitleText, type RouteId } from '@/features/content/schema'
import { eventsQueryOptions, formatTime, mediaUrl, roadRoutes, subtitlesQueryOptions } from '@/features/content/queries'
import { playbackRates, playbackRateSchema, useSettings } from '@/features/settings/settings'
import { LearningSettings } from '@/features/settings/learning-settings'
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
  const { openMobile } = useSidebar()
  const video = useRef<HTMLVideoElement>(null)
  const operationArea = useRef<HTMLDivElement>(null)
  const selectedFromList = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const calibration = useManualCalibration(eventData, Math.round(duration * 1000))
  const training = useTraining(calibration.events, video)
  const [calibrating, setCalibrating] = useState(false)
  const [calibrationEventId, setCalibrationEventId] = useState<string | null>(null)
  const [mediaError, setMediaError] = useState(false)
  const [settingsMessage, setSettingsMessage] = useState('')
  const [showMap, setShowMap] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const event = activeEvent(training.state)
  const currentCue = data.cues.find(cue => cue.startMs <= time * 1000 && cue.endMs > time * 1000)
  const mediaReady = duration > 0 && !mediaError
  const practicing = training.state.enabled && training.state.phase === 'practice'
  const pauseControl = practicing ? !training.state.suspensions.includes('user') : playing
  const playbackLabel = practicing ? pauseControl ? '暂停练习' : '继续练习' : playing ? '暂停视频' : '播放视频'
  const playbackDisabled = !training.controller || mediaError || training.state.seeking
    || training.state.enabled && (training.state.phase === 'review' || training.state.phase === 'finished')
    || training.state.suspensions.some(reason => reason !== 'user' && reason !== 'buffering')
  useEffect(() => { if (video.current) video.current.playbackRate = Number(settings.playbackRate) }, [settings.playbackRate])
  useEffect(() => { if (openMobile) training.controller?.pause() }, [openMobile, training.controller])
  useEffect(() => {
    if (training.state.activeId && window.matchMedia('(max-width: 1023px)').matches && !showProjects) operationArea.current?.scrollIntoView({ block: 'start' })
  }, [training.state.activeId, showProjects])
  function seek(value: number) {
    if (video.current && duration > 0) {
      const next = Math.max(0, Math.min(duration, value))
      training.controller?.seek(next)
      setTime(next)
    }
  }
  function toggleCalibration() {
    if (!calibrating) {
      const position = (video.current?.currentTime ?? time) * 1000
      const closest = calibration.events.reduce<(typeof calibration.events)[number] | undefined>((best, event) => !best || Math.abs(pauseTimeMs(event) - position) < Math.abs(pauseTimeMs(best) - position) ? event : best, undefined)
      setCalibrationEventId(training.state.activeId ?? closest?.id ?? null)
    }
    training.controller?.stop()
    setCalibrating(value => !value)
  }
  return <div className="training-workspace">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Button asChild variant="ghost" size="icon" className="size-[56px]"><Link to="/train" aria-label="返回路线选择" title="返回路线选择"><ArrowLeft aria-hidden /></Link></Button><h1 className="page-title">{route.name}</h1><span className="ml-2 text-base text-muted-foreground">C2 自动挡</span></div>
      <div className="flex max-w-full flex-wrap gap-2">
        {!calibrating && <Sheet open={showProjects} onOpenChange={open => { if (open) training.controller?.pause(); setShowProjects(open) }}><SheetTrigger asChild><Button variant="outline"><List aria-hidden />练习项目</Button></SheetTrigger><SheetContent className="w-full overflow-y-auto sm:max-w-[28rem]" showCloseButton={false} onCloseAutoFocus={event => {
          if (selectedFromList.current) { event.preventDefault(); selectedFromList.current = false; operationArea.current?.focus({ preventScroll: true }) }
        }}><SheetHeader className="border-b"><div className="flex items-center justify-between gap-3"><SheetTitle>练习项目 · {calibration.events.length} 项</SheetTitle><SheetClose asChild><Button variant="outline">关闭</Button></SheetClose></div><SheetDescription>选择想练的项目，随时回来重练。</SheetDescription></SheetHeader><div className="p-4 pt-0"><TrainingEventList {...training} mediaReady={mediaReady} onSelect={() => { selectedFromList.current = true; setShowProjects(false) }} /></div></SheetContent></Sheet>}
        <Dialog open={showMap} onOpenChange={open => { training.controller?.setMap(open); setShowMap(open) }}><DialogTrigger asChild><Button variant="outline"><Map aria-hidden />路线图</Button></DialogTrigger><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[min(90vw,64rem)]"><DialogHeader><DialogTitle>{route.name}路线图</DialogTitle><DialogDescription>关闭后，点击播放视频或继续练习。</DialogDescription></DialogHeader><RouteMapViewer routeId={routeId} name={route.name} /><DialogFooter><DialogClose asChild><Button variant="outline">关闭路线图</Button></DialogClose></DialogFooter></DialogContent></Dialog>
        <Sheet open={showSettings} onOpenChange={open => { if (open) training.controller?.pause(); setShowSettings(open) }}><SheetTrigger asChild><Button variant="outline"><Settings2 aria-hidden />学习设置</Button></SheetTrigger><SheetContent className="w-full overflow-y-auto sm:max-w-[26rem]" showCloseButton={false}><SheetHeader className="border-b"><div className="flex items-center justify-between gap-3"><SheetTitle>学习设置</SheetTitle><SheetClose asChild><Button variant="outline">完成</Button></SheetClose></div><SheetDescription>对照视频调整，设置会保存在本机。</SheetDescription></SheetHeader><div className="p-4 pt-0"><LearningSettings /></div></SheetContent></Sheet>
        <Button variant="ghost" disabled={!training.controller} aria-pressed={calibrating} onClick={toggleCalibration}><SlidersHorizontal aria-hidden />{calibrating ? '完成校准' : '人工校准'}</Button>
      </div>
    </header>
    <div className="training-grid">
      <div className="training-video-column min-w-0 space-y-3">
        <section className="min-w-0 overflow-hidden rounded-lg border" aria-label="路线视频">
          <div className="video-frame"><video ref={video} src={mediaUrl(routeId, 'mp4')} playsInline preload="metadata" muted={!settings.originalAudio} aria-label={`${route.name}教学视频`}
            onLoadedMetadata={event => { const element = event.currentTarget; element.playbackRate = Number(settings.playbackRate); setDuration(Number.isFinite(element.duration) ? element.duration : 0) }}
            onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => { setMediaError(true); setPlaying(false) }} />
            {settings.blurSubtitles && !mediaError && <div aria-hidden className="subtitle-mask" style={{ top: `${settings.maskTop}%`, height: `${settings.maskHeight}%` }} />}
            {practicing && !mediaError && <span className="video-state">{training.state.suspensions.length ? '练习已暂停' : '已到练习位置，请在操作区完成动作'}</span>}
            {mediaError && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center text-white"><p className="text-xl font-bold">暂时无法播放这段视频</p><Button variant="secondary" onClick={() => { setMediaError(false); video.current?.load() }}>重新加载视频</Button></div>}
          </div>
          <div className="space-y-3 p-3">
            <div className="flex items-center gap-3"><span className="text-sm tabular-nums">{formatTime(time)}</span><input aria-label="视频播放进度" type="range" min={0} max={duration || 1} step={.1} value={time} disabled={!duration || mediaError} onChange={event => seek(Number(event.target.value))} /><span className="text-sm tabular-nums">{formatTime(duration)}</span></div>
            <div className="player-toolbar"><Button onClick={() => training.controller?.toggle()} disabled={playbackDisabled}>{pauseControl ? <Pause aria-hidden /> : <Play aria-hidden />}{playbackLabel}</Button><Button variant="outline" disabled={!mediaReady || !training.controller} onClick={() => seek(time - 10)} aria-label="后退 10 秒" title="后退 10 秒"><RotateCcw aria-hidden /><span className="hidden xl:inline">后退</span>10 秒</Button><Button variant="outline" aria-label={settings.originalAudio ? '关闭原声' : '开启原声'} aria-pressed={settings.originalAudio} title={settings.originalAudio ? '关闭原声' : '开启原声'} onClick={() => setSettingsMessage(save({ ...settings, originalAudio: !settings.originalAudio }) ? '原声设置已保存' : '原声已调整，本次生效')}>{settings.originalAudio ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}</Button><div className="flex items-center gap-2"><Label htmlFor="playback-speed" className="sr-only">播放速度</Label><Select value={settings.playbackRate} onValueChange={value => { const parsed = playbackRateSchema.safeParse(value); if (parsed.success) setSettingsMessage(save({ ...settings, playbackRate: parsed.data }) ? `已调整为 ${parsed.data} 倍速` : '倍速已调整，本次生效') }}><SelectTrigger id="playback-speed" className="min-h-[56px] w-[6rem] text-base"><SelectValue /></SelectTrigger><SelectContent>{playbackRates.map(value => <SelectItem key={value} value={value} className="min-h-11 text-base">{value} 倍</SelectItem>)}</SelectContent></Select></div></div>
          </div>
        </section>
        <section className="rounded-lg border px-4 py-3" aria-label="当前教学字幕"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-medium text-muted-foreground">教学字幕</h2><span role="status" className="text-sm text-muted-foreground">{settingsMessage}</span></div><p className="mt-1 min-h-14 whitespace-pre-line text-base leading-relaxed">{currentCue ? subtitleText(currentCue) : '播放视频后，这里会显示当前讲解。'}</p></section>
        {event && !calibrating && <details className="rounded-lg border px-4 text-base"><summary className="cursor-pointer py-3 font-medium">操作要点与全部步骤</summary><p className="muted mb-3">{event.guidance}</p><ol aria-label="本项操作步骤" className="space-y-2">{stepsFor(event).map((value, index) => <li key={value.id} aria-current={index === training.state.stepIndex ? 'step' : undefined}><span className="mr-2">{index < training.state.stepIndex ? '✓' : index + 1 + '.'}</span>{value.label}</li>)}</ol><p className="muted my-3">打灯等待 {training.state.signalWaitMs / 1000} 秒用于动作记忆练习。</p></details>}
        {training.state.enabled && <Button variant="outline" onClick={() => training.controller?.stop()}>结束练习，观看视频</Button>}
        {calibration.message && <p role="status" className="rounded-md border p-3 text-base">{calibration.message}</p>}
        <p className="text-sm text-muted-foreground">视频自动行驶，只需练习关键动作。可打开“练习项目”选择单项。</p>
      </div>
      <div ref={operationArea} tabIndex={-1} className="operation-area min-w-0 scroll-mt-4">
        {calibrating ? <CalibrationPanel source={eventData} initialEventId={calibrationEventId} calibration={calibration} durationMs={Math.round(duration * 1000)} positionMs={Math.round(time * 1000)} ready={mediaReady && Boolean(training.controller) && !training.state.seeking} getPositionMs={() => Math.round((video.current?.currentTime ?? time) * 1000)} onSeek={seek} onPause={() => training.controller?.pause()} onClose={() => { training.controller?.stop(); setCalibrating(false) }} /> : <TrainingPanel {...training} mediaReady={mediaReady} />}
      </div>
    </div>
  </div>
}
