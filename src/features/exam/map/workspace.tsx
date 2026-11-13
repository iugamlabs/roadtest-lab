import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Check, List, Map, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RouteMapViewer } from '@/components/route-map'
import type { RouteId } from '../../content/schema'
import { newSeed } from '../use-exam'
import { scenarioRoute } from '../routes'
import { MapControls } from './controls'
import { MapFeedback } from './feedback'
import { currentMapScene, mapNodePrompt, type MapOperation, type MapState } from './model'
import { mapResult, mapSettingsSchema, readMapSettings, MAP_SETTINGS_KEY } from './history'
import { MapRoadView } from './road-map'
import { MapReport } from './report'
import { useMapSession } from './use-session'

export function MapWorkspace({ routeId, initialSeed, initialMode = 'practice' }: { routeId: RouteId; initialSeed?: number; initialMode?: MapState['mode'] }) {
  const [seed, setSeed] = useState(initialSeed ?? newSeed)
  const [mode, setMode] = useState<MapState['mode']>(initialMode)
  const [audio, setAudio] = useState(() => { try { return readMapSettings(localStorage) } catch { return { voice: true, sound: true } } })
  const audioRef = useRef(audio)
  const [single, setSingle] = useState<string | undefined>()
  const [revision, setRevision] = useState(0)
  const preference = useCallback((key: 'voice' | 'sound', value: boolean) => {
    const next = { ...audioRef.current, [key]: value }
    audioRef.current = next; setAudio(next)
    try { localStorage.setItem(MAP_SETTINGS_KEY, JSON.stringify(mapSettingsSchema.parse(next))) } catch { /* session remains usable */ }
  }, [])
  useEffect(() => { try { localStorage.setItem(MAP_SETTINGS_KEY, JSON.stringify(mapSettingsSchema.parse(audio))) } catch { /* session remains usable */ } }, [audio])
  const voicePreference = useCallback((value: boolean) => preference('voice', value), [preference])
  const restart = (same = true, singleId?: string) => { if (!same) setSeed(newSeed()); setSingle(singleId); if (singleId) setMode('practice'); setRevision(value => value + 1) }
  return <MapSession key={`${routeId}-${revision}-${mode}-${single ?? 'all'}`} routeId={routeId} seed={seed} mode={mode} voice={audio.voice} sound={audio.sound} single={single} onSound={value => preference('sound', value)} onVoice={voicePreference} onRestart={restart} />
}
function MapSession({ routeId, seed, mode, voice, sound, single, onSound, onVoice, onRestart }: { routeId: RouteId; seed: number; mode: MapState['mode']; voice: boolean; sound: boolean; single?: string; onSound: (value: boolean) => void; onVoice: (value: boolean) => void; onRestart: (same?: boolean, singleId?: string) => void }) {
  const { state, dispatch, saved, pause, soundError, unlockSound } = useMapSession(routeId, seed, mode, voice, sound, single)
  const [panel, setPanel] = useState<'map' | 'items' | 'help' | null>(null)
  const [confirm, setConfirm] = useState<'restart' | 'end' | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const scene = currentMapScene(state)
  const operate = (operation: MapOperation) => dispatch({ type: 'operate', operation })
  const live = state.phase !== 'ready' && state.phase !== 'finished'
  const blocker = useBlocker({ shouldBlockFn: () => { if (live) { pause(); return true }; return false }, withResolver: true, enableBeforeUnload: live })
  useEffect(() => { onVoice(state.voice) }, [state.voice, onVoice])
  useEffect(() => { if (state.phase === 'finished') { resultRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' }); resultRef.current?.focus() } }, [state.phase])
  const openPanel = (value: typeof panel) => { pause(); dispatch({ type: 'pause', reason: 'dialog', value: true }); setPanel(value) }
  const closePanel = () => { setPanel(null); dispatch({ type: 'pause', reason: 'dialog', value: false }) }
  const result = useMemo(() => state.phase === 'finished' && state.mode === 'assessment' && state.single === null ? mapResult(state, 'current') : null, [state])
  const status = state.phase === 'ready' ? '准备出发' : state.pauses.includes('voice-error') ? '语音不可用，已暂停' : state.pauses.some(reason => reason !== 'speech') ? '已暂停' : state.pauses.includes('speech') ? '正在播报口令' : state.phase === 'decision' ? '到达操作位置，等你准备' : state.phase === 'review' ? '本项已完成' : state.phase === 'secure' ? '停车收尾' : state.stopped ? '停车等待中' : state.phase === 'moving' ? '正在通行' : '缓慢驶向操作位置'
  return <div className={`prototype-workspace map-workspace space-y-3 ${state.phase === 'secure' ? 'map-parking' : ''}`}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Button asChild variant="outline" size="icon" className="size-[56px] shrink-0" aria-label="返回路线选择"><Link to="/exam"><ArrowLeft aria-hidden /></Link></Button><h1 className="text-xl font-semibold md:text-2xl">{state.route.name} · {single ? '单项练习' : mode === 'practice' ? '路线练习' : '模拟考试'}</h1><Badge variant="outline" className={mode === 'practice' ? 'hidden sm:inline-flex' : 'border-foreground font-semibold'}>{mode === 'practice' ? '舒缓练习' : `${state.score}分`}</Badge></div><div className="flex flex-wrap gap-1"><Button variant="ghost" onClick={() => openPanel('map')}><Map aria-hidden /><span className="hidden sm:inline">路线图</span></Button><Button variant="ghost" onClick={() => openPanel('items')}><List aria-hidden />项目</Button><Button variant="ghost" onClick={() => { if (live) { pause(); setConfirm('restart') } else onRestart(true, single) }} aria-label="重新开始当前路线"><RotateCcw aria-hidden /></Button><Button variant="ghost" onClick={() => openPanel('help')}>说明</Button></div></header>
    <div className="flex flex-wrap items-center justify-between gap-2 text-base"><p>{state.phase === 'ready' ? mode === 'practice' ? '到点等待，没有反应时限' : '教学评分 · 低于90分结束' : mode === 'practice' || scene.category === 'command' ? scene.title : '请自主识别道路与行驶位置'}{scene.kind === 'overtake' && state.phase !== 'ready' && <span className="text-muted-foreground"> · {state.leg === 0 ? '驶出' : '返回'}</span>}</p><span className="text-muted-foreground">已完成 {state.completed.length} / {single ? 1 : state.route.scenes.length} 项</span></div>
    {state.phase === 'finished' ? <div ref={resultRef} tabIndex={-1} className="space-y-4 outline-none">
      {result ? <MapReport result={result} onRetry={() => onRestart(true)} onReplay={id => onRestart(true, id)} /> : <div className="rounded-lg border p-5"><h2 className="text-xl font-semibold">{state.outcome === 'aborted' ? '本次练习已结束' : single ? '本项练习完成' : '路线练习完成'}</h2><p className="mt-3 text-base text-muted-foreground">完成 {state.completed.length} / {single ? 1 : state.route.scenes.length} 项 · 纠正 {state.corrections} 次</p></div>}
      {saved === false && <p role="alert" className="text-base">本机存储不可用，本次结果未保存。当前仍可查看回顾。</p>}
      <div className="flex flex-wrap gap-3"><Button onClick={() => onRestart(false)}>换一组路况，练整条路线</Button><Button asChild variant="outline"><Link to="/exam">选择其他路线<ArrowUpRight aria-hidden /></Link></Button><Button variant="outline" onClick={() => openPanel('items')}>选择单项重练</Button></div>
    </div> : <>
      <section className="overflow-hidden rounded-lg border" aria-label="2D路线工作台">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b px-4 py-2"><p className="text-base font-semibold">{state.announcement?.text ?? (state.phase === 'ready' ? '准备好后，请点击开始。' : mapNodePrompt(state))}</p><div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="size-[48px]" aria-label={state.phase === 'ready' ? '试听语音' : '重听当前口令'} disabled={!state.voice} onClick={() => dispatch({ type: 'repeat-command' })}><Volume2 aria-hidden /></Button><Button variant="outline" disabled={state.phase === 'ready'} onClick={() => dispatch({ type: 'pause', reason: 'user', value: !state.pauses.includes('user') })}>{state.pauses.includes('user') ? <Play aria-hidden /> : <Pause aria-hidden />}{state.pauses.includes('user') ? '继续练习' : '暂停'}</Button></div></div>
        <div className="relative"><MapRoadView route={state.route} seed={seed} frame={state} showPlan={mode === 'practice'} stopped={!!state.pauses.length} />
          {state.phase === 'ready' && <div className="absolute inset-0 flex items-end justify-center pb-6"><Button className="min-h-[64px] px-8 text-lg" onClick={() => dispatch({ type: 'start' })}><Play aria-hidden />{single ? '开始单项练习' : mode === 'practice' ? '开始舒缓练习' : '开始模拟考试'}</Button></div>}
          {state.pauses.includes('user') && !state.pauses.includes('dialog') && !state.pauses.includes('voice-error') && state.phase !== 'ready' && <div className="absolute inset-0 grid place-items-center bg-background/40"><Button disabled={state.pauses.includes('hidden')} onClick={() => dispatch({ type: 'pause', reason: 'user', value: false })}><Play aria-hidden />继续练习</Button></div>}
          {!state.observed && <div className="absolute left-3 top-3 max-w-[65%] rounded-md border bg-background/95 px-3 py-2 text-base">{status}</div>}
        </div>
        <div className="map-route-feedback flex min-h-[76px] flex-wrap items-center justify-between border-t"><MapFeedback state={state} />{state.phase === 'secure' && <div className="flex flex-wrap gap-2 p-2"><Button variant="outline" disabled={!!state.pauses.length} aria-pressed={state.gearP} onClick={() => operate('park-p')}>挂P挡{state.gearP && <Check aria-hidden />}</Button><Button variant="outline" disabled={!!state.pauses.length} aria-pressed={state.handbrake} onClick={() => operate('park-brake')}>拉驻车制动{state.handbrake && <Check aria-hidden />}</Button></div>}</div>
      </section>
      {state.pauses.includes('voice-error') && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><p className="text-base">语音暂时不可用，已暂停，不会因此扣分。</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => dispatch({ type: 'retry-speech' })}>重试语音</Button><Button onClick={() => { onVoice(false); dispatch({ type: 'text-only' }) }}>改用文字继续</Button></div></div>}
      {sound && soundError && <p role="status" className="text-sm text-muted-foreground">部分音效暂时不可用，文字与操作不受影响。</p>}
      <MapControls state={state} operate={operate} />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"><p>{mode === 'practice' ? '六个固定操作 · 到点等待 · 左右灯再次点击关闭' : '舒缓操作考核 · 教学评分，距离和交通为示意'}</p><div className="flex flex-wrap items-center gap-3"><Label htmlFor="map-sound" className="text-sm">操作音效</Label><Switch id="map-sound" checked={sound} onCheckedChange={value => { if (value) unlockSound(); onSound(value) }} /><Label htmlFor="map-voice" className="text-sm">语音播报</Label><Switch id="map-voice" checked={state.voice} onCheckedChange={value => { onVoice(value); dispatch({ type: 'set-voice', value }) }} />{live && <Button variant="ghost" className="min-h-[44px] px-2 text-sm" onClick={() => { pause(); setConfirm('end') }}>结束本次</Button>}</div></div>
    </>}
    <Sheet open={panel === 'items' || panel === 'help'} onOpenChange={open => { if (!open) closePanel() }}><SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>{panel === 'items' ? '路线项目' : '怎么操作'}</SheetTitle><SheetDescription>查看时暂停，关闭后手动继续。</SheetDescription></SheetHeader><div className="space-y-4 px-4 pb-5">{panel === 'items' ? <><p className="text-base text-muted-foreground">选择一项会开始新的单项练习，当前进行中的进度不保留。</p><ol className="divide-y">{state.route.scenes.map((item, i) => <li key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-base">{i + 1}. {item.title}</p><p className="mt-1 text-sm text-muted-foreground">{state.completed.includes(item.id) ? '已完成' : state.index === i ? '当前项目' : '待练习'}</p></div><Button variant="outline" aria-label={`练习${item.title}`} onClick={() => onRestart(true, item.id)}>练习</Button></li>)}</ol></> : <>
      <p className="text-base leading-relaxed">车辆沿所选路线缓慢行驶，到每个操作位置会等你，不设反应时限。通行可以恢复行驶，也可以在准备好后完成当前动作；项目完成后再次点通行继续。</p>
      <ul className="list-disc space-y-3 pl-5 text-base"><li>左右灯再次点击关闭；打灯等待可以与观察同时进行，教学等待为3秒。</li><li>观察会展开相关交通，不设置8秒失效；停车瞭望需先停车再观察。</li><li>减速降低自身速度，停车后其他交通仍会移动；暂停会冻结整个场景。</li><li>超车先左灯驶出，再右灯返回。停车收尾时才显示P挡和驻车制动。</li><li>舒缓练习只提示和纠正。操作考核每类错误扣10分，同一次动作同类错误不重复扣分；90分可继续，低于90分立即结束。</li></ul>
      <p className="border-t pt-3 text-base text-muted-foreground">路线结构参考三张路线图，距离和车速为示意。当前考核检查操作准备与安全决策，不评价实际转向、车身压线或连续驾驶反应，也不是官方评分程序。</p>
    </>}</div></SheetContent></Sheet>
    <Dialog open={panel === 'map'} onOpenChange={open => { if (!open) closePanel() }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{state.route.name}原始路线图</DialogTitle><DialogDescription>对照道路连接、选道与项目位置。关闭后手动继续。</DialogDescription></DialogHeader><RouteMapViewer routeId={routeId} name={state.route.name} /></DialogContent></Dialog>
    <Dialog open={!!confirm} onOpenChange={open => { if (!open) setConfirm(null) }}><DialogContent><DialogHeader><DialogTitle>{confirm === 'restart' ? '重新开始当前路线？' : '结束本次体验？'}</DialogTitle><DialogDescription>{confirm === 'restart' ? '当前进行中的进度将清空，已保存的结果不受影响。' : '结束后可以查看本次完成情况和已有扣分。'}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirm(null)}>暂不结束</Button><Button onClick={() => { const value = confirm; setConfirm(null); if (value === 'restart') onRestart(true, single); else dispatch({ type: 'abort' }) }}>{confirm === 'restart' ? '重新开始' : '结束并查看结果'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }}><DialogContent><DialogHeader><DialogTitle>离开当前路线？</DialogTitle><DialogDescription>进行中的进度不会保存。留在当前页面后，可手动继续。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => blocker.reset?.()}>留在路线</Button><Button onClick={() => blocker.proceed?.()}>结束并离开</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
