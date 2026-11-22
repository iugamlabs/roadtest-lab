import { ArrowRight, ArrowUpLeft, ArrowUpRight, CarFront, CircleOff, CircleStop, Eye, Footprints, ListChecks, ParkingCircle, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Control, StatePanel, type StatusItem } from '@/components/vehicle-operation-ui'
import { activeEvent, currentStep, isOperating, signalRemainingMs, stepsFor, type Operation, type TrainingState, type Suspension } from './engine'
import type { TrainingController } from './controller'
import { formatTime } from '../content/queries'
import { pauseTimeMs } from './practice-events'

const suspensionLabels: Record<Suspension, string> = { user: '已暂停，点击继续练习', buffering: '正在等待视频缓冲', hidden: '页面已在后台暂停', map: '查看路线图时暂停', 'media-error': '请先重新加载视频' }
type PanelProps = { state: TrainingState; controller: TrainingController | null; mediaReady: boolean }

export function TrainingPanel({ state, controller, mediaReady }: PanelProps) {
  const event = activeEvent(state)
  const step = currentStep(state)
  const operating = isOperating(state) && mediaReady
  const completed = Object.values(state.progress).filter(value => value === 'completed').length
  const blocked = state.seeking || !mediaReady || state.suspensions.some(reason => reason !== 'user')
  const executeStep = event ? stepsFor(event).slice(state.stepIndex).find(value => value.operation === 'execute') : undefined
  const frontObservation = event && ['brake', 'straight'].includes(event.kind)
  const { vehicle } = state
  const indicatorIcon = vehicle.indicator === 'off' ? CircleOff : vehicle.indicator === 'left' ? ArrowUpLeft : ArrowUpRight
  const observationLabels = { left: '左侧', right: '右侧', front: '前方' }
  const vehicleStatus: StatusItem[] = [
    { label: '转向灯', value: vehicle.indicator === 'off' ? '关闭' : vehicle.indicator === 'left' ? '左灯开启' : '右灯开启',
      icon: indicatorIcon, purpose: 'signal', active: vehicle.indicator !== 'off' },
    { label: '挡位', value: `${vehicle.gear} 挡`, icon: ListChecks, purpose: 'gear' },
    { label: '脚刹', value: vehicle.brake ? '已踩下' : '未踩下', icon: Footprints, purpose: 'brake', active: vehicle.brake },
    { label: '驻车制动', value: vehicle.handbrake ? '已拉紧' : '已松开', icon: ParkingCircle, purpose: 'brake', active: vehicle.handbrake },
    { label: '行驶状态', value: state.enabled ? (vehicle.motion === 'stopped' ? '已停稳' : '行驶中') : '待开始', icon: CarFront, purpose: 'move', active: state.enabled },
    { label: '观察记录', value: vehicle.observed.map(direction => observationLabels[direction]).join('、') || '未观察',
      icon: Eye, purpose: 'observe', active: vehicle.observed.length > 0 },
  ]
  if (vehicle.lane === 'passing') vehicleStatus.push({ label: '当前车道', value: '超车道', icon: ArrowRight, purpose: 'move' })
  const controls: { operation: Operation; label: string; icon: typeof Eye; pressed?: boolean }[] = [
    { operation: 'signal-left', label: '左转向灯', icon: ArrowUpLeft, pressed: state.vehicle.indicator === 'left' },
    { operation: 'signal-right', label: '右转向灯', icon: ArrowUpRight, pressed: state.vehicle.indicator === 'right' },
    ...(frontObservation ? [{ operation: 'observe-front' as const, label: '观察前方', icon: Eye, pressed: state.vehicle.observed.includes('front') }] : [
      { operation: 'observe-left' as const, label: event?.kind === 'stop-and-observe' ? '观察左侧' : '观察左后方', icon: Eye, pressed: state.vehicle.observed.includes('left') },
      { operation: 'observe-right' as const, label: event?.kind === 'stop-and-observe' ? '观察右侧' : '观察右后方', icon: Eye, pressed: state.vehicle.observed.includes('right') },
    ]),
    { operation: 'brake', label: '踩刹车', icon: Footprints, pressed: state.vehicle.brake },
    { operation: 'signal-off', label: '关闭转向灯', icon: CircleOff, pressed: vehicle.indicator === 'off' },
  ]
  return <section className="practice-panel min-w-0 rounded-lg border bg-card p-4" aria-label="关键操作练习">
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">关键操作</h2><Badge variant="secondary">{state.enabled ? `${completed} / ${state.events.length} 项完成` : '暂停练习 · 不计分'}</Badge></div>
    <div className="practice-instruction" aria-label="当前步骤">
      <div className="flex items-start justify-between gap-2"><h3 className="font-semibold">{event?.title ?? (state.phase === 'finished' ? '本次练习结束' : state.enabled ? '留意道路，准备下一项' : '准备好，就开始吧')}</h3>{event && <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{formatTime(state.elapsedMs / 1000)}</span>}</div>
      {state.phase === 'practice' && event ? <><p className="mt-2 text-lg font-semibold">{step?.operation === 'wait' ? `保持转向灯，还需 ${(signalRemainingMs(state) / 1000).toFixed(1)} 秒` : step?.label}</p><progress className="mt-2 h-1.5 w-full accent-primary" aria-label="本项操作进度" max={stepsFor(event).length} value={state.stepIndex} /><p className="mt-1 text-sm text-muted-foreground">第 {state.stepIndex + 1} / {stepsFor(event).length} 步 · 纠正 {state.corrections} 次</p></> : <p className="muted mt-2 text-base">{state.phase === 'review' ? '本项已完成。可以继续路线，也可以再练一次。' : state.phase === 'finished' ? '可打开项目列表，选择想再练的项目。' : state.enabled ? '视频到关键位置会自动暂停。' : '视频自动行驶，到关键位置暂停，跟着提示点击操作。'}</p>}
      {state.seeking ? <p className="mt-2 text-base">正在定位视频…</p> : state.enabled && state.suspensions.length > 0 && <p className="mt-2 text-base">{suspensionLabels[state.suspensions.find(reason => reason !== 'user') ?? 'user']}</p>}
    </div>
    <p role="status" aria-atomic="true" className="practice-feedback">{state.feedback}</p>
    {state.phase === 'practice' && <Button variant="outline" className="w-full lg:hidden" disabled={blocked} onClick={() => controller?.toggle()}>{state.suspensions.includes('user') ? <Play aria-hidden /> : <Pause aria-hidden />}{state.suspensions.includes('user') ? '继续练习' : '暂停练习'}</Button>}
    {!state.enabled && <Button className="w-full" disabled={!controller || !mediaReady} onClick={() => controller?.start()}><Play aria-hidden />开始全程练习</Button>}
    <StatePanel title="车辆状态" items={vehicleStatus} compact />
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="车辆操作台">
      {controls.map(control => <Control key={control.operation} icon={control.icon} disabled={!operating}
        purpose={control.operation === 'brake' ? 'brake' : control.operation.startsWith('signal') ? 'signal' : 'observe'}
        className={`control-button ${control.operation === 'observe-front' ? 'col-span-2' : ''} ${step?.operation === control.operation && operating ? 'ring-2 ring-primary' : ''}`}
        selected={control.pressed} onClick={() => controller?.operate(control.operation)}>{control.label}</Control>)}
    </div>
    {state.phase === 'practice' && executeStep && <Control icon={step?.operation === 'stop' ? CircleStop : ArrowRight}
      purpose={step?.operation === 'stop' ? 'brake' : 'move'} primary disabled={!operating}
      onClick={() => controller?.operate(step?.operation === 'stop' ? 'stop' : 'execute')}>{step?.operation === 'stop' ? '确认车辆停稳' : executeStep.label}</Control>}
    {state.phase === 'practice' && event?.kind === 'parking' && !executeStep && <div className="grid grid-cols-2 gap-2" role="group" aria-label="停车收尾">
      <Control icon={ListChecks} purpose="gear" disabled={!operating} selected={vehicle.gear === 'P'} onClick={() => controller?.operate('gear-p')}>挂 P 挡</Control>
      <Control icon={ParkingCircle} purpose="brake" disabled={!operating} selected={vehicle.handbrake} onClick={() => controller?.operate('handbrake-on')}>拉驻车制动</Control>
    </div>}
    {event && <div className="flex flex-wrap gap-2"><Button variant="outline" className="flex-1" disabled={blocked} onClick={() => controller?.retry(event.id)}><RotateCcw aria-hidden />重练</Button><Button variant="outline" className="flex-1" disabled={blocked} onClick={() => controller?.retry(event.id, true)}>回看</Button>{state.phase === 'review' && <Button className="flex-1" disabled={blocked} onClick={() => controller?.continue()}>{state.scope ? '结束单项' : '继续路线'}</Button>}</div>}
  </section>
}

export function TrainingEventList({ state, controller, mediaReady, onSelect }: PanelProps & { onSelect?: () => void }) {
  return <div className="min-w-0"><p className="muted mb-3 text-base">选择一项开始练习。拖动视频跳过的项目不会记作完成。</p><ol className="divide-y">{state.events.map((event, index) => <li key={event.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-base font-medium break-words">{index + 1}. {event.title}</p><p className="muted text-sm">{formatTime(pauseTimeMs(event) / 1000)}{event.manualPauseMs !== undefined ? ' · 人工校准' : ''} · {state.progress[event.id] === 'completed' ? '已完成' : state.progress[event.id] === 'skipped' ? '已跳过' : state.activeId === event.id ? '练习中' : '待练习'}</p></div><Button variant="outline" disabled={!controller || !mediaReady || state.seeking || state.suspensions.some(reason => reason !== 'user')} aria-label={`练习${event.title}`} onClick={() => { controller?.retry(event.id, false, true); onSelect?.() }}>练习</Button></li>)}</ol></div>
}
