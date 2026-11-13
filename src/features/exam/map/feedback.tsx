import { ArrowLeftToLine, ArrowRightToLine, ArrowUpRight, CircleParking, CircleStop, Eye, Info, TriangleAlert } from 'lucide-react'
import { BrakePedal } from './controls'
import type { MapState } from './model'

export function MapFeedback({ state }: { state: MapState }) {
  const action = state.interaction
  const icon = action?.blocked ? TriangleAlert : action?.operation === 'left' ? ArrowLeftToLine : action?.operation === 'right' ? ArrowRightToLine : action?.operation === 'observe' ? Eye : action?.operation === 'slow' ? BrakePedal : action?.operation === 'stop' ? CircleStop : action?.operation === 'go' ? ArrowUpRight : action ? CircleParking : Info
  const Icon = icon
  const label = action?.deducted ? `扣10分 · 当前${state.score}分` : action?.blocked ? '请先完成准备' : action?.operation === 'left' || action?.operation === 'right' ? state.indicator ? `${state.indicator === 'left' ? '左' : '右'}转向灯已开启` : '转向灯已关闭' : action?.operation === 'observe' ? '已展开观察' : action?.operation === 'slow' ? '已踩刹车' : action?.operation === 'stop' ? '本车已停稳' : action?.operation === 'go' ? state.phase === 'moving' || state.phase === 'approach' ? '正在通行' : state.phase === 'decision' ? '到位等待' : state.phase === 'secure' ? '车辆已停稳' : '本项已完成' : action?.operation === 'park-p' ? '已挂P挡' : action?.operation === 'park-brake' ? '驻车制动已拉起' : '操作提示'
  const kind = action?.blocked ? 'stop' : action?.operation === 'left' || action?.operation === 'right' ? 'signal' : action?.operation === 'observe' ? 'observe' : action?.operation === 'slow' ? 'slow' : action?.operation === 'stop' ? 'stop' : 'go'
  return <div key={action?.id ?? 'ready'} className="map-action-feedback flex min-w-0 flex-1 items-center gap-3 px-4 py-2" data-kind={kind} data-blocked={!!action?.blocked} role="status" aria-atomic="true"><Icon className="size-8 shrink-0" aria-hidden /><div className="min-w-0"><p className="font-semibold">{label}</p><p className="text-base text-foreground">{state.feedback}</p></div></div>
}
