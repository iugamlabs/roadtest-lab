import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, List, Map, Settings2, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSidebar } from '@/components/ui/sidebar'
import { RouteMapViewer } from '@/components/route-map'
import { activeEvent, stepsFor } from '@/features/training/engine'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { routeIdSchema, subtitleText, type RouteId } from '@/features/content/schema'
import { eventsQueryOptions, roadRoutes, subtitlesQueryOptions } from '@/features/content/queries'
import { TrainingVideoPlayer } from '@/features/training/video-player'
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
  const [workspaceTab, setWorkspaceTab] = useState('operations')
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
  useEffect(() => { training.controller?.setMap(workspaceTab === 'map') }, [workspaceTab, training.controller])
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
    setWorkspaceTab('operations')
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
        }}><SheetHeader className="border-b"><div className="flex items-center justify-between gap-3"><SheetTitle>练习项目 · {calibration.events.length} 项</SheetTitle><SheetClose asChild><Button variant="outline">关闭</Button></SheetClose></div><SheetDescription>选择想练的项目，随时回来重练。</SheetDescription></SheetHeader><div className="p-4 pt-0"><TrainingEventList {...training} mediaReady={mediaReady} onSelect={() => { selectedFromList.current = true; setWorkspaceTab('operations'); setShowProjects(false) }} /></div></SheetContent></Sheet>}
        <Sheet open={showSettings} onOpenChange={open => { if (open) training.controller?.pause(); setShowSettings(open) }}><SheetTrigger asChild><Button variant="outline"><Settings2 aria-hidden />学习设置</Button></SheetTrigger><SheetContent className="w-full overflow-y-auto sm:max-w-[26rem]" showCloseButton={false}><SheetHeader className="border-b"><div className="flex items-center justify-between gap-3"><SheetTitle>学习设置</SheetTitle><SheetClose asChild><Button variant="outline">完成</Button></SheetClose></div><SheetDescription>对照视频调整，设置会保存在本机。</SheetDescription></SheetHeader><div className="p-4 pt-0"><LearningSettings /></div></SheetContent></Sheet>
        <Button variant="ghost" disabled={!training.controller} aria-pressed={calibrating} onClick={toggleCalibration}><SlidersHorizontal aria-hidden />{calibrating ? '完成校准' : '人工校准'}</Button>
      </div>
    </header>
    <div className="training-grid">
      <div className="training-video-column min-w-0 space-y-3">
        <TrainingVideoPlayer routeId={routeId} name={route.name} video={video} time={time} duration={duration} playing={playing}
          playbackLabel={playbackLabel} playbackDisabled={playbackDisabled} pauseControl={pauseControl} mediaReady={mediaReady} mediaError={mediaError}
          requiresOperations={training.state.enabled && training.state.phase !== 'road'}
          practiceNotice={practicing ? training.state.suspensions.length ? '练习已暂停' : '已到练习位置，请在操作区完成动作' : null}
          subtitle={currentCue ? subtitleText(currentCue) : null} controller={training.controller} onSeek={seek}
          onTime={setTime} onDuration={setDuration} onPlaying={setPlaying} onError={setMediaError} />
        {event && !calibrating && <details className="rounded-lg border px-4 text-base"><summary className="cursor-pointer py-3 font-medium">操作要点与全部步骤</summary><p className="muted mb-3">{event.guidance}</p><ol aria-label="本项操作步骤" className="space-y-2">{stepsFor(event).map((value, index) => <li key={value.id} aria-current={index === training.state.stepIndex ? 'step' : undefined}><span className="mr-2">{index < training.state.stepIndex ? '✓' : index + 1 + '.'}</span>{value.label}</li>)}</ol><p className="muted my-3">打灯等待 {training.state.signalWaitMs / 1000} 秒用于动作记忆练习。</p></details>}
        {training.state.enabled && <Button variant="outline" onClick={() => training.controller?.stop()}>结束练习，观看视频</Button>}
        {calibration.message && <p role="status" className="rounded-md border p-3 text-base">{calibration.message}</p>}
        <p className="text-sm text-muted-foreground">视频自动行驶，只需练习关键动作。可打开“练习项目”选择单项。</p>
      </div>
      <div ref={operationArea} tabIndex={-1} className="operation-area min-w-0 scroll-mt-4">
        {calibrating ? <CalibrationPanel source={eventData} initialEventId={calibrationEventId} calibration={calibration} durationMs={Math.round(duration * 1000)} positionMs={Math.round(time * 1000)} ready={mediaReady && Boolean(training.controller) && !training.state.seeking} getPositionMs={() => Math.round((video.current?.currentTime ?? time) * 1000)} onSeek={seek} onPause={() => training.controller?.pause()} onClose={() => { training.controller?.stop(); setCalibrating(false) }} /> : <Tabs value={workspaceTab} onValueChange={setWorkspaceTab} className="gap-3">
          <TabsList aria-label="训练工作区" className="w-full">
            <TabsTrigger value="operations" className="min-h-[56px] text-base"><List aria-hidden />关键操作</TabsTrigger>
            <TabsTrigger value="map" className="min-h-[56px] text-base"><Map aria-hidden />路线图</TabsTrigger>
          </TabsList>
          <TabsContent value="operations"><TrainingPanel {...training} mediaReady={mediaReady} /></TabsContent>
          <TabsContent value="map" className="min-w-0 rounded-lg border p-4">
            <RouteMapViewer routeId={routeId} name={route.name} />
            <p className="mt-3 text-base text-muted-foreground">返回关键操作后，手动继续练习或播放视频。</p>
          </TabsContent>
        </Tabs>}
      </div>
    </div>
  </div>
}
