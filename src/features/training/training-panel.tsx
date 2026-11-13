import { ArrowUpLeft, ArrowUpRight, CircleOff, Eye, Footprints, Pause, Play, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { activeEvent, currentStep, isOperating, signalRemainingMs, stepsFor, type Operation, type TrainingState, type Suspension } from './engine'
import type { TrainingController } from './controller'
import { formatTime } from '../content/queries'

const suspensionLabels: Record<Suspension, string> = { user: '已暂停，点击继续练习', buffering: '正在等待视频缓冲', hidden: '页面已在后台暂停', map: '查看路线图时暂停', 'media-error': '请先重新加载视频' }

export function TrainingPanel({ state, controller, mediaReady }: { state: TrainingState; controller: TrainingController | null; mediaReady: boolean }) {
  const event = activeEvent(state)
  const step = currentStep(state)
  const operating = isOperating(state) && mediaReady
  const executeStep = event ? stepsFor(event).slice(state.stepIndex).find(value => ['execute', 'stop', 'gear-p', 'handbrake-on'].includes(value.operation)) : undefined
  function control(operation: Operation) { controller?.operate(operation) }
  return <Card className="gap-0 min-w-0"><CardContent className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-bold">关键操作练习</h2><Badge variant="secondary">暂停练习 · 不计分</Badge></div>
    {!state.enabled ? <><p className="muted text-base">视频会在关键位置暂停，按步骤练习打灯、观察与制动。也可在下方选择单项。</p><Button className="w-full" disabled={!controller || !mediaReady} onClick={() => controller?.start()}>开始全程练习</Button></>
      : <>
        <div className="flex flex-wrap gap-3 text-base"><span>完成 {Object.values(state.progress).filter(value => value === 'completed').length} / {state.events.length} 项</span><span>跳过 {Object.values(state.progress).filter(value => value === 'skipped').length} 项</span></div>
        {event ? <>
          <h3 className="text-xl font-semibold break-words">{event.title}</h3><p className="muted text-base">{event.guidance}</p>
          <div className="flex flex-wrap gap-3 text-base tabular-nums"><span>操作用时 {formatTime(state.elapsedMs / 1000)}</span><span>纠正 {state.corrections} 次</span></div>
          {state.phase === 'practice' && <><p className="rounded-md border p-3 text-lg font-semibold">第 {state.stepIndex + 1} / {stepsFor(event).length} 步：{step?.label}</p><details><summary className="cursor-pointer py-2 text-base">查看全部步骤</summary><ol aria-label="本项操作步骤" className="space-y-2 text-base">{stepsFor(event).map((value, index) => <li key={value.id} aria-current={index === state.stepIndex ? 'step' : undefined} className={index === state.stepIndex ? 'p-2 font-semibold' : 'p-2 text-muted-foreground'}><span className="mr-2">{index < state.stepIndex ? '✓' : `${index + 1}.`}</span>{value.label}</li>)}</ol></details></>}
          {state.phase === 'practice' && step?.operation === 'wait' && <p className="text-base tabular-nums">转向灯还需保持 {(signalRemainingMs(state) / 1000).toFixed(1)} 秒</p>}
        </> : <p className="muted text-base">{state.phase === 'finished' ? '本次练习结束。可在项目列表中选择重练。' : '留意道路，视频到练习位置时会暂停。'}</p>}
        {state.phase === 'practice' && <>
          <p className="text-base">{state.seeking ? '正在定位视频，操作计时已暂停。' : state.suspensions.length ? suspensionLabels[state.suspensions.find(reason => reason !== 'user') ?? 'user'] : '视频暂停供你操作，操作计时继续。'}</p>
          <Button variant="outline" className="w-full" disabled={state.seeking || state.suspensions.some(reason => reason !== 'user')} onClick={() => controller?.toggle()}>{state.suspensions.includes('user') ? <Play aria-hidden /> : <Pause aria-hidden />}{state.suspensions.includes('user') ? '继续练习' : '暂停练习'}</Button>
        </>}
      </>}
    <div className="grid grid-cols-2 gap-3">
      <Button disabled={!operating} variant={state.vehicle.indicator === 'left' ? 'default' : 'outline'} className="control-button" aria-pressed={state.vehicle.indicator === 'left'} onClick={() => control('signal-left')}><ArrowUpLeft aria-hidden />左转向灯</Button>
      <Button disabled={!operating} variant={state.vehicle.indicator === 'right' ? 'default' : 'outline'} className="control-button" aria-pressed={state.vehicle.indicator === 'right'} onClick={() => control('signal-right')}><ArrowUpRight aria-hidden />右转向灯</Button>
      <Button disabled={!operating} variant="outline" className="control-button" onClick={() => control('observe-left')}><Eye aria-hidden />{event?.kind === 'stop-and-observe' ? '观察左侧' : '观察左后方'}</Button>
      <Button disabled={!operating} variant="outline" className="control-button" onClick={() => control('observe-right')}><Eye aria-hidden />{event?.kind === 'stop-and-observe' ? '观察右侧' : '观察右后方'}</Button>
      {event && ['brake', 'straight'].includes(event.kind) && <Button disabled={!operating} variant="outline" className="control-button" onClick={() => control('observe-front')}><Eye aria-hidden />观察前方</Button>}
      <Button disabled={!operating} variant="outline" className="control-button" aria-pressed={state.vehicle.brake} onClick={() => control('brake')}><Footprints aria-hidden />踩刹车</Button>
      <Button disabled={!operating} variant="outline" className="control-button" onClick={() => control('signal-off')}><CircleOff aria-hidden />关闭转向灯</Button>
      {event?.kind === 'stop-and-observe' && <Button disabled={!operating} variant="outline" className="control-button" onClick={() => control('stop')}>确认停稳</Button>}
    </div>
    <div className="flex flex-wrap gap-3 text-base" aria-label="车辆状态"><span>转向灯：{state.vehicle.indicator === 'off' ? '关闭' : state.vehicle.indicator === 'left' ? '左' : '右'}</span><span>挡位：{state.vehicle.gear}</span><span>驻车制动：{state.vehicle.handbrake ? '已拉起' : '已松开'}</span><span>{state.vehicle.motion === 'stopped' ? '已停稳' : '行驶状态'}</span>{state.vehicle.lane === 'passing' && <span>位于超车道</span>}</div>
    {state.phase === 'practice' && <>
      {event?.kind === 'parking' && <div className="grid grid-cols-2 gap-3"><Button variant="outline" disabled={!operating} onClick={() => control('gear-p')}>挂 P 挡</Button><Button variant="outline" disabled={!operating} onClick={() => control('handbrake-on')}>拉驻车制动</Button></div>}
      {executeStep?.operation === 'execute' && <Button className="w-full whitespace-normal" disabled={!operating} onClick={() => control('execute')}>{executeStep.label}</Button>}
    </>}
    <p role="status" className="rounded-md bg-secondary p-3 text-base leading-relaxed">{state.feedback}</p>
    {event && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={state.seeking || !mediaReady || state.suspensions.some(reason => reason !== 'user')} onClick={() => controller?.retry(event.id)}><RotateCcw aria-hidden />重练本项</Button><Button variant="outline" disabled={state.seeking || !mediaReady || state.suspensions.some(reason => reason !== 'user')} onClick={() => controller?.retry(event.id, true)}>回看本项</Button>{state.phase === 'review' && <Button disabled={state.seeking || !mediaReady || state.suspensions.some(reason => reason !== 'user')} onClick={() => controller?.continue()}>{state.scope ? '结束单项练习' : '继续路线'}</Button>}</div>}
    {state.enabled && <Button variant="outline" className="w-full" onClick={() => controller?.stop()}>结束练习，观看视频</Button>}
    <p className="muted text-base">步骤和转向灯等待 {state.signalWaitMs / 1000} 秒用于动作记忆练习，实际驾驶仍需亲自观察与判断。</p>
  </CardContent></Card>
}

export function TrainingEventList({ state, controller, mediaReady }: { state: TrainingState; controller: TrainingController | null; mediaReady: boolean }) {
  return <Card className="mt-5 gap-0 min-w-0"><CardContent><details><summary className="cursor-pointer py-2 text-lg font-semibold">练习项目（{state.events.length} 项）</summary><p className="muted my-3 text-base">可选择单项练习。拖动视频跳过的项目不会记作完成，回到较早位置会重新开放后面的项目。</p><ol className="divide-y">{state.events.map(event => <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="text-base font-medium break-words">{event.title}</p><p className="muted text-base">{formatTime(event.practicePauseMs / 1000)} · {state.progress[event.id] === 'completed' ? '已完成' : state.progress[event.id] === 'skipped' ? '已跳过' : state.activeId === event.id ? '练习中' : '待练习'}</p></div><Button variant="outline" disabled={!controller || !mediaReady || state.seeking || state.suspensions.some(reason => reason !== 'user')} aria-label={`练习${event.title}`} onClick={() => controller?.retry(event.id, false, true)}>练习本项</Button></li>)}</ol></details></CardContent></Card>
}
