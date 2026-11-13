import { useEffect, useReducer, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowLeftToLine, ArrowRightToLine, ArrowUpRight, CircleStop, Eye, Map, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { RouteMapViewer } from '@/components/route-map'
import { BrowserSpeech } from '../speech'
import { PrototypeMap } from './map'
import { createPrototype, fragments, prototypeReducer, trafficBusy, type Fragment, type PrototypeOperation } from './model'

function BrakePedal({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 20 L14 12" /><rect x="5" y="3" width="13" height="11" rx="2" transform="rotate(18 12 8)" /><path d="M9 6 L8 10 M12 7 L11 11 M15 8 L14 12" /></svg>
}
export function PrototypeWorkspace() {
  const [fragment, setFragment] = useState<Fragment>('turn')
  const [revision, setRevision] = useState(0)
  // Reset by remounting the small session; no existing exam/history state is used.
  return <PrototypeSession key={`${fragment}-${revision}`} fragment={fragment} onFragment={setFragment} onRestart={() => setRevision(value => value + 1)} />
}
function PrototypeSession({ fragment, onFragment, onRestart }: { fragment: Fragment; onFragment: (value: Fragment) => void; onRestart: () => void }) {
  const [state, dispatch] = useReducer(prototypeReducer, fragment, createPrototype)
  const [mapOpen, setMapOpen] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  const cancelSpeech = useRef<(() => void) | null>(null)
  const content = fragments[fragment]
  useEffect(() => {
    if (state.phase === 'ready' || state.phase === 'complete') return
    let last = performance.now()
    const timer = window.setInterval(() => { const now = performance.now(); dispatch({ type: 'tick', deltaMs: now - last }); last = now }, 100)
    const visibility = () => { if (document.hidden) dispatch({ type: 'pause', value: true }) }
    document.addEventListener('visibilitychange', visibility)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visibility) }
  }, [state.phase])
  useEffect(() => () => cancelSpeech.current?.(), [])
  useEffect(() => { if (state.paused) cancelSpeech.current?.() }, [state.paused])
  const operate = (operation: PrototypeOperation) => { setVoiceNote(''); dispatch({ type: 'operate', operation }) }
  const active = state.phase !== 'ready' && !state.paused
  const controls = [
    { operation: 'left' as const, label: '左灯', description: '左转向灯，再按关闭', icon: ArrowLeftToLine, kind: 'signal', pressed: state.indicator === 'left' },
    { operation: 'right' as const, label: '右灯', description: '右转向灯，再按关闭', icon: ArrowRightToLine, kind: 'signal', pressed: state.indicator === 'right' },
    { operation: 'observe' as const, label: '观察', description: '观察相关方向交通', icon: Eye, kind: 'observe', pressed: state.observed },
    { operation: 'slow' as const, label: '减速', description: '踩刹车减速', icon: BrakePedal, kind: 'slow', pressed: state.slow && !state.stopped },
    { operation: 'stop' as const, label: '停车', description: '停车等待', icon: CircleStop, kind: 'stop', pressed: state.stopped },
    { operation: 'go' as const, label: '通行', description: '确认安全通行', icon: ArrowUpRight, kind: 'go', pressed: false },
  ]
  return <div className="prototype-workspace space-y-3">
    <header className="flex flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><Button asChild variant="outline" size="icon" className="size-[56px] shrink-0" aria-label="返回场景考试"><Link to="/exam"><ArrowLeft aria-hidden /></Link></Button><h1 className="text-xl font-semibold md:text-2xl">五号线 · 2D 体验</h1><Badge variant="outline" className="hidden sm:inline-flex">不计分</Badge></div><div className="flex gap-2"><Button variant="ghost" onClick={() => { dispatch({ type: 'pause', value: true }); setMapOpen(true) }}><Map aria-hidden />路线图</Button><Button variant="ghost" onClick={onRestart} aria-label="重新体验当前片段"><RotateCcw aria-hidden /><span className="hidden sm:inline">重来</span></Button></div></header>
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2" role="group" aria-label="选择体验片段">{(['turn', 'lane'] as const).map(value => <Button key={value} variant={fragment === value ? 'secondary' : 'ghost'} aria-pressed={fragment === value} onClick={() => onFragment(value)}>{value === 'turn' ? '右转进入工业区' : '大学路向左变道'}</Button>)}</div><span className="text-base text-muted-foreground">可以慢慢操作，没有反应时限</span></div>
    <section className="overflow-hidden rounded-lg border" aria-label="2D路线交互体验">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2"><p className="font-semibold">{content.command}</p><div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="size-[48px]" aria-label="朗读当前口令" onClick={() => { cancelSpeech.current?.(); setVoiceNote(''); cancelSpeech.current = new BrowserSpeech().speak(content.command, { end: () => {}, error: () => setVoiceNote('当前语音不可用，可按文字口令体验。') }) }}><Volume2 aria-hidden /></Button><Button variant="outline" disabled={state.phase === 'ready' || state.phase === 'complete'} onClick={() => dispatch({ type: 'pause', value: !state.paused })}>{state.paused ? <Play aria-hidden /> : <Pause aria-hidden />}{state.paused ? '继续体验' : '暂停'}</Button></div></div>
      <div className="prototype-map-wrap relative"><PrototypeMap state={state} />
        {state.phase === 'ready' && <div className="absolute inset-0 flex items-end justify-center pb-7"><Button className="min-h-[64px] gap-3 px-8 text-lg" onClick={() => dispatch({ type: 'start' })}><Play aria-hidden />开始体验</Button></div>}
        {state.paused && state.phase !== 'ready' && <div className="absolute inset-0 grid place-items-center bg-background/45"><Button onClick={() => dispatch({ type: 'pause', value: false })}><Play aria-hidden />继续体验</Button></div>}
        <div className="absolute top-3 left-3 flex items-center gap-2 rounded-md border bg-background/95 px-3 py-2 text-base"><span className={`prototype-status-dot ${state.phase === 'moving' ? 'is-moving' : ''}`} aria-hidden /><span>{state.phase === 'ready' ? '准备出发' : state.paused ? '已暂停' : state.phase === 'complete' ? '动作完成' : state.phase === 'moving' ? state.stopped ? '车辆停稳' : '正在通行' : state.phase === 'decision' ? '到达操作位置，等你准备' : state.stopped ? '停车等待中' : state.slow ? '车辆慢行中' : '缓慢驶近操作位置'}</span></div>
        {state.observed && active && state.phase !== 'complete' && <div className="prototype-look absolute top-3 right-3 max-w-[45%] rounded-md border bg-background/95 px-3 py-2 text-base"><p className="flex items-center gap-2 font-medium"><Eye className="size-5 shrink-0" aria-hidden />{fragment === 'turn' ? '路口观察' : '左侧观察'}</p><p className="mt-1">{trafficBusy(state) ? fragment === 'turn' ? '有行人正在通过' : '有车辆从左侧驶来' : '当前可见范围内无冲突'}</p></div>}
      </div>
      <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-2 border-t px-4 py-2"><p role="status" aria-atomic="true" className="text-base">{voiceNote || state.feedback}</p>{state.phase === 'complete' && <Button variant="outline" onClick={() => onFragment(fragment === 'turn' ? 'lane' : 'turn')}>{fragment === 'turn' ? '试试向左变道' : '再试试右转'}<ArrowUpRight aria-hidden /></Button>}</div>
    </section>
    <div className="prototype-controls grid grid-cols-3 gap-2 md:grid-cols-6" role="group" aria-label="六个固定操作">{controls.map(control => <Button key={control.operation} variant="outline" className="prototype-control" data-kind={control.kind} data-selected={control.pressed} aria-label={control.description} aria-pressed={control.pressed} disabled={!active || (state.phase === 'complete' && !['left', 'right'].includes(control.operation))} onClick={() => operate(control.operation)}><control.icon className="!size-7 shrink-0" /><span>{control.label}</span></Button>)}</div>
    <p className="text-sm text-muted-foreground">五号线的两个独立片段 · 道路依据路线图简化，距离为示意。左右灯再次点击关闭，车辆自动完成行驶轨迹。</p>
    <Dialog open={mapOpen} onOpenChange={setMapOpen}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>五号线路线图</DialogTitle><DialogDescription>对照两个片段在路线中的位置。关闭后手动继续体验。</DialogDescription></DialogHeader><RouteMapViewer routeId="5" name="五号线" /></DialogContent></Dialog>
  </div>
}
