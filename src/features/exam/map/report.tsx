import { useMemo, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatTime } from '../../content/queries'
import type { MapResult } from './history'
import type { MapFault, MapOperation } from './model'
import { mapRoute } from './routes'
import { MapRoadView } from './road-map'

export const mapOutcomeLabels = { passed: '操作考核合格', failed: '操作考核不合格', aborted: '考核已中止' }
export const mapOperationLabels: Record<MapOperation, string> = { left: '左灯', right: '右灯', observe: '观察', slow: '减速', stop: '停车', go: '通行', 'park-p': '挂P挡', 'park-brake': '拉驻车制动' }
export function MapReport({ result, onRetry, onReplay }: { result: MapResult; onRetry?: () => void; onReplay?: (id: string) => void }) {
  const [fault, setFault] = useState<MapFault | null>(null)
  const route = useMemo(() => mapRoute(result.routeId), [result.routeId])
  return <section className="prototype-workspace space-y-4" aria-label="2D考核结果">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5"><div><h2 className="text-xl font-semibold">{mapOutcomeLabels[result.outcome]}</h2><p className="mt-2 text-base text-muted-foreground">完成 {result.completed.length} / {route.scenes.length} 项 · 有效用时 {formatTime(result.elapsedMs / 1000)}</p></div><div className="text-right"><p className="text-4xl font-semibold tabular-nums">{result.score}<span className="text-lg"> 分</span></p><p className="mt-1 text-base text-muted-foreground">教学评分 · 90分合格</p></div></div>
    <div className="flex flex-wrap items-center gap-3"><Badge variant="outline">路况编号 {result.seed}</Badge>{onRetry && <Button variant="outline" onClick={onRetry}><RotateCcw aria-hidden />相同路况重考</Button>}</div>
    {result.faults.length ? <ol className="divide-y rounded-lg border px-4">{result.faults.map(item => <li key={item.id} className="space-y-2 py-4"><div className="flex justify-between gap-3"><p className="font-medium">{item.title}</p><Badge variant="outline" className="shrink-0">−10分</Badge></div><p className="text-base">{item.reason}</p><p className="text-base text-muted-foreground">{item.advice}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setFault(item)}>查看当时路况</Button>{onReplay && <Button variant="outline" onClick={() => onReplay(item.sceneId)}>重练本项</Button>}</div></li>)}</ol> : <p className="flex items-center gap-2 rounded-lg border p-4"><Check className="size-5 shrink-0" aria-hidden />本次没有记录到扣分。</p>}
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">操作记录（{result.operations.length}次）</summary><ol className="mt-3 max-h-72 space-y-2 overflow-auto text-base">{result.operations.map((entry, i) => <li key={i} className="flex flex-wrap gap-x-3"><span className="tabular-nums text-muted-foreground">{formatTime(entry.atMs / 1000)}</span><span>{route.scenes.find(scene => scene.id === entry.sceneId)?.title}</span><span>{mapOperationLabels[entry.operation]}</span></li>)}</ol></details>
    <Dialog open={!!fault} onOpenChange={open => { if (!open) setFault(null) }}><DialogContent className="prototype-workspace max-h-[90dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>扣分时的2D路况</DialogTitle><DialogDescription>显示当时的车道位置、交通和车辆状态。</DialogDescription></DialogHeader>{fault && <><MapRoadView route={route} seed={result.seed} frame={{ ...fault.snapshot, observed: true }} replay /><p>{fault.reason}</p><p className="text-base text-muted-foreground">{fault.advice}</p></>}</DialogContent></Dialog>
  </section>
}
