import { useEffect, useRef, useState, type RefObject, type KeyboardEvent } from 'react'
import { Captions, Maximize, Minimize, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatTime, mediaUrl } from '@/features/content/queries'
import type { RouteId } from '@/features/content/schema'
import { playbackRates, playbackRateSchema, useSettings } from '@/features/settings/settings'
import type { TrainingController } from './controller'

interface Props {
  routeId: RouteId
  name: string
  video: RefObject<HTMLVideoElement | null>
  time: number
  duration: number
  playing: boolean
  playbackLabel: string
  playbackDisabled: boolean
  pauseControl: boolean
  mediaReady: boolean
  mediaError: boolean
  requiresOperations: boolean
  practiceNotice: string | null
  subtitle: string | null
  controller: Pick<TrainingController, 'toggle'> | null
  concealAnswers?: boolean
  onSeek: (seconds: number) => void
  onTime: (seconds: number) => void
  onDuration: (seconds: number) => void
  onPlaying: (value: boolean) => void
  onError: (value: boolean) => void
}

export function TrainingVideoPlayer(props: Props) {
  const { routeId, name, video, time, duration, playing, playbackLabel, playbackDisabled, pauseControl, mediaReady, mediaError, requiresOperations, practiceNotice, subtitle, controller, onSeek, onTime, onDuration, onPlaying, onError, concealAnswers = false } = props
  const { settings, save } = useSettings()
  const player = useRef<HTMLElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [captions, setCaptions] = useState(true)
  const [volume, setVolume] = useState(1)
  const [buffered, setBuffered] = useState(0)
  const [waiting, setWaiting] = useState(false)
  const [notice, setNotice] = useState('')
  const enlarged = fullscreen || expanded
  useEffect(() => { if (video.current) video.current.playbackRate = Number(settings.playbackRate) }, [settings.playbackRate, video])
  useEffect(() => { if (video.current) video.current.volume = volume }, [volume, video])
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === player.current)
    document.addEventListener('fullscreenchange', changed)
    return () => { document.removeEventListener('fullscreenchange', changed) }
  }, [])
  useEffect(() => {
    if (!expanded) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false) }
    document.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', escape) }
  }, [expanded])
  useEffect(() => {
    if (!requiresOperations) return
    setExpanded(false)
    if (document.fullscreenElement === player.current) void document.exitFullscreen().catch(() => setNotice('请退出全屏，完成右侧操作。'))
  }, [requiresOperations])
  async function toggleFullscreen() {
    if (document.fullscreenElement === player.current) { await document.exitFullscreen().catch(() => setNotice('请按 Esc 退出全屏。')); return }
    if (expanded) { setExpanded(false); return }
    if (player.current?.requestFullscreen) {
      try { await player.current.requestFullscreen(); return } catch { /* Use the same player in an expanded viewport. */ }
    }
    setExpanded(true)
  }
  function mute() { if (!concealAnswers) setNotice(save({ ...settings, originalAudio: !settings.originalAudio }) ? '' : '原声已调整，本次生效。') }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (event.target instanceof HTMLElement && event.target.closest('button, input, select, [role="combobox"], [role="option"]')) return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const key = event.key.toLowerCase()
    if (key === ' ' || key === 'k') { event.preventDefault(); if (!playbackDisabled) controller?.toggle() }
    if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); if (mediaReady) onSeek(time + (key === 'arrowleft' ? -10 : 10)) }
    if (key === 'f') { event.preventDefault(); void toggleFullscreen() }
    if (key === 'm') { event.preventDefault(); mute() }
    if (key === 'c') { event.preventDefault(); if (!concealAnswers) setCaptions(value => !value) }
  }
  return <section ref={player} tabIndex={0} aria-label="路线视频播放器" aria-keyshortcuts="Space K ArrowLeft ArrowRight F M C" onKeyDown={keyboard} className={`training-player min-w-0 overflow-hidden rounded-lg border bg-background ${expanded ? 'is-expanded' : ''}`}>
    <div className="video-frame">
      <video ref={video} src={mediaUrl(routeId, 'mp4')} playsInline preload="metadata" muted={concealAnswers || !settings.originalAudio} aria-label={`${name}教学视频`}
        onLoadedMetadata={event => { const element = event.currentTarget; element.playbackRate = Number(settings.playbackRate); element.volume = volume; onDuration(Number.isFinite(element.duration) ? element.duration : 0) }}
        onTimeUpdate={event => onTime(event.currentTarget.currentTime)} onPlay={() => onPlaying(true)} onPause={() => { onPlaying(false); setWaiting(false) }} onEnded={() => { onPlaying(false); setWaiting(false) }}
        onWaiting={() => setWaiting(true)} onPlaying={() => setWaiting(false)} onCanPlay={() => setWaiting(false)}
        onProgress={event => { const element = event.currentTarget; setBuffered(element.buffered.length && Number.isFinite(element.duration) && element.duration > 0 ? element.buffered.end(element.buffered.length - 1) / element.duration * 100 : 0) }}
        onError={() => { onError(true); onPlaying(false); setWaiting(false) }} />
      {(settings.blurSubtitles || concealAnswers) && !mediaError && <div aria-hidden className={concealAnswers ? 'absolute inset-x-0 bg-black' : 'subtitle-mask'} style={{ top: `${settings.maskTop}%`, height: `${settings.maskHeight}%` }} />}
      <div className="player-heading"><span>{name} · 实景教学</span><span>{waiting ? '正在缓冲' : playing ? '播放中' : '已暂停'}</span></div>
      {practiceNotice && !mediaError && <span className="video-state player-practice-notice">{practiceNotice}</span>}
      {!concealAnswers && captions && subtitle && !mediaError && <div className="player-caption" aria-label="当前教学字幕"><span className="player-caption-label">教学字幕</span><p>{subtitle}</p></div>}
      {mediaError && <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-5 text-center text-white"><p className="text-xl font-bold">暂时无法播放这段视频</p><Button variant="secondary" onClick={() => { onError(false); video.current?.load() }}>重新加载视频</Button></div>}
    </div>
    <div className="player-controls space-y-2 border-t p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-sm tabular-nums">{formatTime(time)}</span>
        <div className="player-progress relative flex min-w-0 flex-1 items-center">
          <div aria-hidden className="absolute inset-x-0 h-1 overflow-hidden rounded-sm bg-muted"><div className="h-full bg-muted-foreground/40" style={{ width: `${buffered}%` }} /></div>
          <div aria-hidden className="pointer-events-none absolute left-0 h-1 rounded-sm bg-primary" style={{ width: `${duration ? time / duration * 100 : 0}%` }} />
          <input className="relative" aria-label="视频播放进度" aria-valuetext={`${formatTime(time)}，共 ${formatTime(duration)}`} type="range" min={0} max={duration || 1} step={.1} value={time} disabled={!mediaReady || !controller} onChange={event => onSeek(Number(event.target.value))} />
        </div>
        <span className="text-sm tabular-nums">{formatTime(duration)}</span>
      </div>
      <div className="player-toolbar">
        <Button className="player-play" aria-label={playbackLabel} onClick={() => controller?.toggle()} disabled={playbackDisabled} title="空格：播放或暂停">{pauseControl ? <Pause aria-hidden /> : <Play aria-hidden />}<span className="player-play-label">{playbackLabel}</span></Button>
        <Button variant="outline" size="icon" className="size-[56px]" disabled={!mediaReady || !controller} onClick={() => onSeek(time - 10)} aria-label="后退 10 秒" title="后退 10 秒（←）"><RotateCcw aria-hidden /></Button>
        <Button variant="outline" size="icon" className="size-[56px]" disabled={!mediaReady || !controller} onClick={() => onSeek(time + 10)} aria-label="前进 10 秒" title="前进 10 秒（→）"><RotateCw aria-hidden /></Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-[56px]" disabled={concealAnswers} aria-label={concealAnswers ? '回忆时原声已关闭' : settings.originalAudio ? '关闭原声' : '开启原声'} aria-pressed={concealAnswers || !settings.originalAudio} title="原声开关（M）" onClick={mute}>{!concealAnswers && settings.originalAudio && volume > 0 ? <Volume2 aria-hidden /> : <VolumeX aria-hidden />}</Button>
          <input type="range" min={0} max={1} step={.05} disabled={concealAnswers} value={!concealAnswers && settings.originalAudio ? volume : 0} aria-label="视频音量" aria-valuetext={`${Math.round((!concealAnswers && settings.originalAudio ? volume : 0) * 100)}%`} className="player-volume" onChange={event => { const next = Number(event.target.value); setVolume(next); if (next > 0 && !settings.originalAudio) save({ ...settings, originalAudio: true }) }} />
        </div>
        <Select value={settings.playbackRate} onValueChange={value => { const parsed = playbackRateSchema.safeParse(value); if (parsed.success) setNotice(save({ ...settings, playbackRate: parsed.data }) ? '' : '倍速已调整，本次生效。') }}><SelectTrigger aria-label="播放速度" className="min-h-[56px] w-[6rem] text-base"><SelectValue /></SelectTrigger><SelectContent container={player.current}>{playbackRates.map(value => <SelectItem key={value} value={value} className="min-h-11 text-base">{value} 倍</SelectItem>)}</SelectContent></Select>
        <Button variant={!concealAnswers && captions ? 'secondary' : 'ghost'} size="icon" className="size-[56px]" disabled={concealAnswers} aria-label={concealAnswers ? '回忆时教学字幕已隐藏' : captions ? '关闭教学字幕' : '显示教学字幕'} aria-pressed={!concealAnswers && captions} title="教学字幕（C）" onClick={() => setCaptions(value => !value)}><Captions aria-hidden /></Button>
        <Button variant="ghost" size="icon" className="size-[56px]" aria-label={enlarged ? '退出全屏' : '全屏播放'} title={enlarged ? '退出全屏（F / Esc）' : '全屏播放（F）'} onClick={() => void toggleFullscreen()}>{enlarged ? <Minimize aria-hidden /> : <Maximize aria-hidden />}</Button>
      </div>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    </div>
  </section>
}
