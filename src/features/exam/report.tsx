import { useState } from 'react'
import { Check, ClipboardList, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatTime } from '../content/queries'
import { hazardActive, makePlan, type ExamFault } from './engine'
import type { ExamResult } from './storage'
import { SceneView } from './scene'

export const outcomeLabels = { passed: '考试合格', failed: '考试不合格', aborted: '考试已中止' }
export function ExamReport({ result, onRetry, onPractice }: { result: ExamResult; onRetry?: () => void; onPractice?: (sceneId: string) => void }) {
  const [fault, setFault] = useState<ExamFault | null>(null)
  const plan = makePlan(result.routeId, result.seed)
  const scene = fault ? plan.find(scene => scene.id === fault.sceneId) : undefined
  const hazard = fault && scene ? hazardActive(scene, fault.snapshot) : 'clear'
  const replayObservation = hazard === 'rear-left' || fault?.operation === 'left' ? 'left' : hazard === 'rear-right' || fault?.operation === 'right' ? 'right' : undefined
  return <section className="space-y-4" aria-label="考试结果">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-5">
      <div><h2 className="text-xl font-semibold">{outcomeLabels[result.outcome]}</h2><p className="mt-2 text-base text-muted-foreground">完成 {result.completed.length} 项 · 有效用时 {formatTime(result.elapsedMs / 1000)}</p></div>
      <div className="text-right"><p className="text-4xl font-semibold tabular-nums">{result.score}<span className="ml-1 text-lg">分</span></p><p className="mt-1 text-base text-muted-foreground">教学评分 · 90分合格</p></div>
    </div>
    <div className="flex flex-wrap items-center gap-3"><Badge variant="outline">场景编号 {result.seed}</Badge>{onRetry && <Button variant="outline" onClick={onRetry}><RotateCcw aria-hidden />相同场景重考</Button>}</div>
    {result.faults.length ? <div><h3 className="mb-2 flex items-center gap-2 font-semibold"><ClipboardList className="size-5" aria-hidden />扣分回顾</h3><ol className="divide-y rounded-lg border px-4">{result.faults.map(item => <li key={item.id} className="space-y-2 py-4">
      <div className="flex items-start justify-between gap-3"><p className="font-medium">{item.title}</p><Badge variant="outline" className="shrink-0">−{item.cost}分</Badge></div>
      <p className="text-base">{item.reason}</p><p className="text-base text-muted-foreground">{item.advice}</p>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setFault(item)}>查看当时路况</Button>{onPractice && <Button variant="outline" onClick={() => onPractice(item.sceneId)}>重练本项</Button>}</div>
    </li>)}</ol></div> : <p className="flex items-center gap-2 rounded-lg border p-4"><Check className="size-5" aria-hidden />{result.outcome === 'aborted' ? '中止前没有记录到扣分。' : '本次没有记录到扣分。'}</p>}
    <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">操作记录（{result.operations.length}次）</summary><ol className="mt-3 max-h-72 space-y-2 overflow-auto text-base">{result.operations.map((entry, index) => <li key={index} className="flex flex-wrap gap-x-3"><span className="tabular-nums text-muted-foreground">{formatTime(entry.atMs / 1000)}</span><span>{plan.find(scene => scene.id === entry.sceneId)?.title}</span><span>{operationLabels[entry.operation]}</span></li>)}</ol></details>
    <Dialog open={!!fault} onOpenChange={open => { if (!open) setFault(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>扣分时的路况</DialogTitle><DialogDescription>保留当时的位置、交通情况和车辆状态，方便回顾判断。</DialogDescription></DialogHeader>{fault && scene && <><SceneView scene={scene} frame={fault.snapshot} observation={replayObservation} replay /><p>{fault.reason}</p><p className="text-base text-muted-foreground">{fault.advice}</p><p className="text-base">转向灯：{fault.snapshot.vehicle.indicator === 'off' ? '关闭' : fault.snapshot.vehicle.indicator === 'left' ? '左' : '右'} · {fault.snapshot.vehicle.speed === 0 ? '停稳' : fault.snapshot.vehicle.speed === 4 ? '慢行' : '行驶中'} · {fault.snapshot.vehicle.gear}挡</p></>}</DialogContent></Dialog>
  </section>
}
export const operationLabels = {
  'signal-left': '左转向灯', 'signal-right': '右转向灯', 'signal-off': '关闭转向灯',
  'observe-front': '观察前方', 'observe-left': '观察左侧及后方', 'observe-right': '观察右侧及后方',
  brake: '减速', stop: '停车', resume: '恢复行驶', left: '向左执行', right: '向右执行', proceed: '直行通过',
  'gear-p': '挂P挡', 'gear-d': '挂D挡', 'handbrake-on': '拉驻车制动', 'handbrake-off': '松驻车制动',
}
