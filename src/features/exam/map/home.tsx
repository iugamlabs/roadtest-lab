import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { scenarioRoutes } from '../routes'
import { readHistory, type ExamResult } from '../storage'
import { ExamReport } from '../report'
import { readMapHistory, type MapResult } from './history'
import { MapReport, mapOutcomeLabels } from './report'
import { mapRoute } from './routes'
import { pathData, roadRects } from './geometry'

export function MapExamHome() {
  const [history] = useState(() => { try { return readMapHistory(localStorage) } catch { return [] } })
  const [legacy] = useState(() => { try { return readHistory(localStorage) } catch { return [] } })
  const [review, setReview] = useState<MapResult | null>(null)
  const [oldReview, setOldReview] = useState<ExamResult | null>(null)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="page-title">2D路线练习与考核</h1><p className="muted mt-2">六个固定操作，到位置等你准备。先慢慢练，再试操作考核。</p></div><Badge variant="outline">C2 自动挡</Badge></div>
    <div className="grid gap-4 xl:grid-cols-3">{scenarioRoutes.map(route => {
      const world = mapRoute(route.id)
      return <Card key={route.id} className="gap-3"><CardHeader className="pb-0"><div className="flex items-center justify-between"><CardTitle><h2>{route.name}</h2></CardTitle><Badge variant="outline">{route.scenes.length}项</Badge></div><CardDescription className="text-base leading-relaxed">{route.description}</CardDescription></CardHeader><CardContent className="prototype-workspace flex-1"><div className="map-route-thumbnail overflow-hidden rounded-md border bg-muted/20"><svg viewBox="0 0 1070 1900" className="h-44 w-full" role="img" aria-label={`${route.name}行驶轨迹示意`}>{roadRects.map((road, i) => <rect key={i} x={road.x} y={road.y} width={road.width} height={road.height} fill="var(--border)" />)}<path d={pathData(world.trace)} fill="none" stroke="var(--prototype-car)" strokeWidth="15" /><circle cx={world.trace[0].x} cy={world.trace[0].y} r="26" fill="var(--prototype-stop)" /><circle cx={world.trace.at(-1)!.x} cy={world.trace.at(-1)!.y} r="26" fill="var(--prototype-go)" /></svg></div><div className="mt-3 flex flex-wrap gap-2">{route.highlights.map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</div></CardContent><CardFooter><Button asChild className="w-full justify-between"><Link to="/exam/$routeId" params={{ routeId: route.id }}>进入2D路线<ArrowRight aria-hidden /></Link></Button></CardFooter></Card>
    })}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4"><p className="text-base text-muted-foreground">想先对照真实道路？实景视频练习继续保留。</p><Button asChild variant="outline"><Link to="/train">进入视频练习</Link></Button></div>
    <section aria-label="最近2D考核"><h2 className="mb-3 flex items-center gap-2 font-semibold"><History className="size-5" aria-hidden />最近操作考核</h2>{history.length ? <ol className="divide-y rounded-lg border px-4">{history.map(result => <li key={result.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{scenarioRoutes.find(route => route.id === result.routeId)?.name} · {result.score}分 · {mapOutcomeLabels[result.outcome]}</p><p className="mt-1 text-base text-muted-foreground">{new Date(result.finishedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 路况 {result.seed}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setReview(result)}>查看回顾</Button><Button asChild variant="outline"><Link to="/exam/$routeId" params={{ routeId: result.routeId }} search={{ seed: result.seed, mode: 'assessment' }}>相同路况重考</Link></Button></div></li>)}</ol> : <p className="rounded-lg border p-4 text-base text-muted-foreground">操作考核结束后，最近12次结果保存在本机。舒缓练习不计分。</p>}</section>
    <div className="flex flex-wrap items-center justify-between gap-3 text-base text-muted-foreground"><p>道路、距离和交通为示意，采用教学规则。</p><Button asChild variant="link"><Link to="/exam/prototype">回到两个片段原型</Link></Button></div>
    {!!legacy.length && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-base">早期版本考试记录（{legacy.length}次）</summary><p className="mt-3 text-base text-muted-foreground">这些记录保留原来的透视场景及规则，与2D操作考核分别保存。</p><ol className="mt-3 divide-y">{legacy.map(record => <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><p className="text-base">{scenarioRoutes.find(route => route.id === record.routeId)?.name} · {record.score}分</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setOldReview(record)}>查看旧版回顾</Button><Button asChild variant="outline"><Link to="/exam/legacy/$routeId" params={{ routeId: record.routeId }} search={{ seed: record.seed }}>进入对应旧版</Link></Button></div></li>)}</ol></details>}
    <Dialog open={!!review} onOpenChange={open => { if (!open) setReview(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle>2D操作考核回顾</DialogTitle><DialogDescription>查看扣分、操作记录与当时的地图路况。</DialogDescription></DialogHeader>{review && <MapReport result={review} />}</DialogContent></Dialog>
    <Dialog open={!!oldReview} onOpenChange={open => { if (!open) setOldReview(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>早期版本回顾</DialogTitle><DialogDescription>保留原来场景与规则下的记录。</DialogDescription></DialogHeader>{oldReview && <ExamReport result={oldReview} />}</DialogContent></Dialog>
  </div>
}
