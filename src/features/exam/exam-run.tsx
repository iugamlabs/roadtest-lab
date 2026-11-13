import { useEffect, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { ArrowUpLeft, ArrowUpRight, Check, CircleOff, Eye, Footprints, List, Pause, Play, RotateCcw, Square, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RouteMapViewer } from '@/components/route-map'
import type { RouteId } from '../content/schema'
import { formatTime } from '../content/queries'
import { activeScene, canOperate, signalRemaining, type ExamOperation } from './engine'
import { scenarioRoute } from './routes'
import { resultFrom } from './storage'
import { SceneView } from './scene'
import { ExamReport } from './report'
import { useExam } from './use-exam'
import { ExamRules } from './rules'

export function ExamRun({ routeId, seed, voice, single, onRetry, onNew, onPractice, onSetup }: { routeId: RouteId; seed: number; voice: boolean; single?: string; onRetry: () => void; onNew: () => void; onPractice: (id: string) => void; onSetup: () => void }) {
  const { state, send, operate, saved } = useExam(routeId, seed, voice, single)
  const [panel, setPanel] = useState<'route' | 'rules' | null>(null)
  const [ending, setEnding] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)
  const scene = activeScene(state)
  const operating = canOperate(state)
  const blocker = useBlocker({ shouldBlockFn: () => { if (state.phase === 'running') { send({ type: 'suspend', reason: 'user', value: true }); return true }; return false }, withResolver: true, enableBeforeUnload: state.phase === 'running' })
  useEffect(() => { send({ type: 'start' }) }, [send])
  useEffect(() => { if (state.phase === 'finished') { resultRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' }); resultRef.current?.focus() } }, [state.phase])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented || (event.target instanceof Element && event.target.closest('input, button, a, textarea, select, [role="dialog"], [role="combobox"], [contenteditable="true"]'))) return
      const operation = shortcuts[event.key.toLowerCase()]
      if (operation) { event.preventDefault(); operate(operation) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [operate])
  const pauseForPanel = () => { send({ type: 'suspend', reason: 'user', value: true }); send({ type: 'suspend', reason: 'dialog', value: true }) }
  const closePanel = () => { setPanel(null); send({ type: 'suspend', reason: 'dialog', value: false }) }
  const pauseLabel = state.suspensions.includes('voice-error') ? '语音播放失败，已暂停' : state.suspensions.some(reason => reason !== 'speech') ? '已暂停，请手动继续' : state.suspensions.includes('speech') ? '正在播报口令' : state.vehicle.speed === 0 ? '车辆已停稳' : '考试进行中'
  const controls: { operation: ExamOperation; label: string; icon: typeof Eye; pressed?: boolean }[] = [
    { operation: 'signal-left', label: '左转向灯', icon: ArrowUpLeft, pressed: state.vehicle.indicator === 'left' },
    { operation: 'signal-right', label: '右转向灯', icon: ArrowUpRight, pressed: state.vehicle.indicator === 'right' },
    { operation: 'observe-left', label: scene.kind === 'look' ? '观察左侧' : '观察左后方', icon: Eye },
    { operation: 'observe-right', label: scene.kind === 'look' ? '观察右侧' : '观察右后方', icon: Eye },
    { operation: 'observe-front', label: '观察前方', icon: Eye },
    { operation: 'signal-off', label: '关闭转向灯', icon: CircleOff },
    { operation: 'brake', label: '踩刹车减速', icon: Footprints },
    { operation: 'stop', label: '停车等待', icon: Square },
  ]
  const showResult = state.phase === 'finished'
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1"><p className="text-xl font-semibold tabular-nums">{state.score}<span className="ml-1 text-base font-normal">分</span></p><span className="text-base">{Math.min(state.sceneIndex + 1, state.scenes.length)} / {state.scenes.length} 项</span><span className="text-base tabular-nums text-muted-foreground">{formatTime(state.elapsedMs / 1000)}</span></div>
      <div className="flex flex-wrap gap-2">{!showResult && <Button variant="outline" onClick={() => send({ type: 'suspend', reason: 'user', value: !state.suspensions.includes('user') })}>{state.suspensions.includes('user') ? <Play aria-hidden /> : <Pause aria-hidden />}{state.suspensions.includes('user') ? '继续考试' : '暂停考试'}</Button>}<Button variant="outline" onClick={() => { pauseForPanel(); setPanel('route') }}><List aria-hidden />路线</Button><Button variant="outline" onClick={() => { pauseForPanel(); setPanel('rules') }}>操作说明</Button>{!showResult && <Button variant="outline" onClick={() => { pauseForPanel(); setEnding(true) }}>结束本次</Button>}</div>
    </div>
    {showResult ? <div ref={resultRef} tabIndex={-1} className="space-y-4 outline-none"><ExamReport result={resultFrom(state, 'current')} onRetry={onRetry} onPractice={onPractice} />{saved === false && <p role="alert" className="text-base">本机存储不可用，本次结果未保存。当前仍可查看扣分回顾。</p>}{single && <p className="text-base text-muted-foreground">这是单项演练，不计入整条路线的考试记录。</p>}<div className="flex flex-wrap gap-3"><Button onClick={onNew}><RotateCcw aria-hidden />换一组，考整条路线</Button><Button variant="outline" onClick={onSetup}>返回考试设置</Button></div></div> : <div className="exam-grid grid min-w-0 items-start gap-4">
      <div className="min-w-0 space-y-3"><div className="rounded-lg border px-4 py-3" aria-label="考试口令"><p className="text-sm text-muted-foreground">{state.voice ? '考试口令' : '文字口令'} · {pauseLabel}</p><p className="mt-1 min-h-7 font-semibold">{state.lastCommand || '请自主观察道路标志与交通情况。'}</p></div><SceneView scene={scene} frame={state} maneuver={state.maneuver} observation={state.lastObservation} stopped={state.suspensions.some(reason => reason !== 'speech')} /><p className="text-base text-muted-foreground">场景编号 {seed} · 路线示意，交通随机变化</p></div>
      <section className="min-w-0 space-y-3 rounded-lg border p-4" aria-label="考试操作台">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">车辆操作台</h2><Badge variant="secondary">{state.vehicle.speed === 0 ? '已停稳' : state.vehicle.speed === 4 ? '慢行' : '行驶中'} · {['左', '中', '右'][state.vehicle.lane]}车道</Badge></div>
        <p className="min-h-14 rounded-md bg-secondary px-3 py-2 text-base" role="status" aria-atomic="true">{state.feedback}</p>
        {state.suspensions.includes('voice-error') && <Alert><Volume2 aria-hidden /><AlertTitle>语音暂时不可用</AlertTitle><AlertDescription>考试已暂停，不会因此扣分。<div className="mt-2 flex flex-wrap gap-2"><Button variant="outline" onClick={() => send({ type: 'retry-speech' })}>重试语音</Button><Button variant="outline" onClick={() => send({ type: 'text-only' })}>改用文字继续</Button></div></AlertDescription></Alert>}
        {state.suspensions.includes('user') && <Button className="w-full" disabled={state.suspensions.includes('hidden') || state.suspensions.includes('dialog')} onClick={() => send({ type: 'suspend', reason: 'user', value: false })}><Play aria-hidden />继续考试</Button>}
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">{controls.map(control => <Button key={control.operation} className="control-button" disabled={!operating} variant={control.pressed ? 'secondary' : 'outline'} aria-pressed={control.pressed} onClick={() => operate(control.operation)}><control.icon className="!size-5" aria-hidden />{control.label}{control.pressed && <Check className="!size-4" aria-hidden />}</Button>)}</div>
        <div className="border-y py-2 text-base" aria-label="转向灯计时">{state.vehicle.indicator === 'off' ? '转向灯关闭' : `${state.vehicle.indicator === 'left' ? '左' : '右'}转向灯 · ${signalRemaining(state) ? `还需保持 ${(signalRemaining(state) / 1000).toFixed(1)} 秒` : '已保持3秒'}`}</div>
        <div className="grid grid-cols-2 gap-2"><Button className="control-button" disabled={!operating} variant="outline" onClick={() => operate('left')}><ArrowUpLeft aria-hidden />向左执行</Button><Button className="control-button" disabled={!operating} variant="outline" onClick={() => operate('right')}><ArrowUpRight aria-hidden />向右执行</Button><Button className="control-button" disabled={!operating} variant="outline" onClick={() => operate('proceed')}>直行通过 / 确认</Button><Button className="control-button" disabled={!operating} onClick={() => operate('resume')}><Play aria-hidden />恢复行驶</Button></div>
        <details className="rounded-md border p-3" open={state.leg === 'secure'}><summary className="cursor-pointer text-base font-medium">挡位与驻车制动 · {state.vehicle.gear}挡</summary><div className="mt-3 grid grid-cols-2 gap-2"><Button variant="outline" disabled={!operating} aria-pressed={state.vehicle.gear === 'P'} onClick={() => operate('gear-p')}>挂P挡</Button><Button variant="outline" disabled={!operating} aria-pressed={state.vehicle.gear === 'D'} onClick={() => operate('gear-d')}>挂D挡</Button><Button className="control-button" variant="outline" disabled={!operating} onClick={() => operate(state.vehicle.handbrake ? 'handbrake-off' : 'handbrake-on')}>{state.vehicle.handbrake ? '松驻车制动' : '拉驻车制动'}</Button><span className="self-center text-base text-muted-foreground">{state.vehicle.handbrake ? '驻车制动已拉起' : '驻车制动已松开'}</span></div></details>
      </section>
    </div>}
    <Sheet open={!!panel} onOpenChange={open => { if (!open) closePanel() }}><SheetContent className="w-full overflow-y-auto sm:max-w-2xl"><SheetHeader><SheetTitle>{panel === 'route' ? '路线与项目' : '考试操作说明'}</SheetTitle><SheetDescription>查看期间考试暂停，关闭后请手动继续。</SheetDescription></SheetHeader><div className="space-y-4 px-4 pb-5">{panel === 'route' ? <><RouteMapViewer routeId={routeId} name={scenarioRoute(routeId).name} /><ol className="divide-y">{state.scenes.map((item, index) => <li key={item.id} className="flex items-start justify-between gap-2 py-3 text-base"><span>{index + 1}. {item.title}</span><Badge variant="outline" className="shrink-0">{state.completed.includes(item.id) ? '已完成' : state.skipped.includes(item.id) ? '未完成' : state.sceneIndex === index ? '当前' : '待考'}</Badge></li>)}</ol></> : <><ExamRules /><div className="rounded-lg border p-4"><h3 className="mb-3 font-semibold">可选键盘操作</h3><p className="text-base leading-relaxed">Q / E：左右灯；X：关灯；A / D：观察左右；W：观察前方；空格：减速；S：停车；R：恢复行驶；← / →：向左 / 右执行。按钮和弹窗有焦点时，保留原有键盘操作。</p></div></>}</div></SheetContent></Sheet>
    <Dialog open={ending} onOpenChange={open => { setEnding(open); if (!open) send({ type: 'suspend', reason: 'dialog', value: false }) }}><DialogContent><DialogHeader><DialogTitle>结束本次考试？</DialogTitle><DialogDescription>可以保留本次已有的操作和扣分记录，结束后查看回顾。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => { setEnding(false); send({ type: 'suspend', reason: 'dialog', value: false }) }}>暂不结束</Button><Button onClick={() => { setEnding(false); send({ type: 'abort' }) }}>结束并查看结果</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }}><DialogContent><DialogHeader><DialogTitle>离开当前考试？</DialogTitle><DialogDescription>考试已暂停。离开后当前进度不会保存，已结束的历史考试不受影响。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => blocker.reset?.()}>留在考试</Button><Button onClick={() => blocker.proceed?.()}>结束并离开</Button></DialogFooter></DialogContent></Dialog>
  </>
}
const shortcuts: Record<string, ExamOperation> = { q: 'signal-left', e: 'signal-right', x: 'signal-off', a: 'observe-left', d: 'observe-right', w: 'observe-front', ' ': 'brake', s: 'stop', r: 'resume', arrowleft: 'left', arrowright: 'right' }
