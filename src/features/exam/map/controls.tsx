import { ArrowLeftToLine, ArrowRightToLine, ArrowUpRight, CircleStop, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { canMapOperate, type MapOperation, type MapState } from './model'

export function BrakePedal({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M10 20 L14 12" /><rect x="5" y="3" width="13" height="11" rx="2" transform="rotate(18 12 8)" /><path d="M9 6 L8 10 M12 7 L11 11 M15 8 L14 12" /></svg>
}
export function MapControls({ state, operate }: { state: MapState; operate: (operation: MapOperation) => void }) {
  const moving = ['approach', 'moving'].includes(state.phase) && !state.stopped && !state.pauses.length
  const controls = [
    { operation: 'left' as const, label: '左灯', description: '左转向灯，再按关闭', icon: ArrowLeftToLine, kind: 'signal', pressed: state.indicator === 'left' },
    { operation: 'right' as const, label: '右灯', description: '右转向灯，再按关闭', icon: ArrowRightToLine, kind: 'signal', pressed: state.indicator === 'right' },
    { operation: 'observe' as const, label: '观察', description: '观察相关方向交通', icon: Eye, kind: 'observe', pressed: state.observed },
    { operation: 'slow' as const, label: '减速', description: '踩刹车减速', icon: BrakePedal, kind: 'slow', pressed: state.slow && !state.stopped },
    { operation: 'stop' as const, label: '停车', description: '停车等待', icon: CircleStop, kind: 'stop', pressed: state.stopped },
    { operation: 'go' as const, label: '通行', description: '确认安全通行', icon: ArrowUpRight, kind: 'go', pressed: moving },
  ]
  const caption = (operation: MapOperation, selected: boolean) => state.phase === 'ready' ? '准备开始' : operation === 'left' || operation === 'right' ? selected ? '已开启' : '已关闭' : operation === 'observe' ? selected ? '已观察' : '查看路况' : operation === 'slow' ? selected ? '减速中' : state.stopped ? '已停稳' : '踩下刹车' : operation === 'stop' ? selected ? '已停稳' : '停车等待' : moving ? '行驶中' : state.phase === 'review' ? '继续下一项' : '确认安全'
  return <div className="prototype-controls grid grid-cols-3 gap-2 md:grid-cols-6" role="group" aria-label="六个固定操作">{controls.map(control => <Button key={control.operation} variant="outline" className="prototype-control map-control" data-kind={control.kind} data-selected={control.pressed} aria-label={control.description} aria-pressed={control.pressed} disabled={!canMapOperate(state) || (['review','secure'].includes(state.phase) && !['left','right','go'].includes(control.operation))} onClick={() => operate(control.operation)}><control.icon className="!size-8 shrink-0" aria-hidden /><span className="grid gap-0.5 text-left"><span className="font-semibold">{control.label}</span><span className="text-sm font-normal">{caption(control.operation, control.pressed)}</span></span></Button>)}</div>
}
