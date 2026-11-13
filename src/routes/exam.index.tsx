import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, ArrowLeftRight, ClipboardCheck, History } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { scenarioRoutes, scenarioRoute } from '@/features/exam/routes'
import { readHistory, type ExamResult } from '@/features/exam/storage'
import { ExamReport, outcomeLabels } from '@/features/exam/report'

export const Route = createFileRoute('/exam/')({ component: ExamHome })
function ExamHome() {
  const [history] = useState(() => { try { return readHistory(localStorage) } catch { return [] } })
  const [review, setReview] = useState<ExamResult | null>(null)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="page-title">场景考试</h1><p className="muted mt-2">看路况、听口令，在正确时机完成操作。</p></div><Badge variant="outline">C2 自动挡</Badge></div>
    <Alert><ClipboardCheck aria-hidden /><AlertTitle>自动行驶，关键操作由你决定</AlertTitle><AlertDescription>按三条路线的项目顺序编排独立场景，随机安排来车、行人和信号灯。满分100分，低于90分立即结束。采用教学评分，距离与交通为示意，不代表官方考试系统。</AlertDescription></Alert>
    <div className="grid gap-4 xl:grid-cols-3">{scenarioRoutes.map(route => <Card key={route.id}><CardHeader><div className="mb-2 flex items-center justify-between"><span className="text-3xl font-semibold tabular-nums">{route.id.padStart(2, '0')}</span><Badge variant="outline">{route.scenes.length}项</Badge></div><CardTitle><h2>{route.name}</h2></CardTitle><CardDescription className="text-base leading-relaxed">{route.description}</CardDescription></CardHeader><CardContent className="flex flex-1 flex-wrap items-start gap-2">{route.highlights.map(item => <Badge key={item} variant="secondary">{item}</Badge>)}</CardContent><CardFooter><Button asChild className="w-full justify-between"><Link to="/exam/$routeId" params={{ routeId: route.id }}>准备考试<ArrowRight aria-hidden /></Link></Button></CardFooter></Card>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-y py-4"><p className="flex items-center gap-2 text-base text-muted-foreground"><ArrowLeftRight className="size-5 shrink-0" aria-hidden />想先看熟真实路口？可回到实景视频练习。</p><Button asChild variant="outline"><Link to="/train">进入视频练习</Link></Button></div>
    <section aria-label="最近考试"><h2 className="mb-3 flex items-center gap-2 font-semibold"><History className="size-5" aria-hidden />最近考试</h2>{history.length ? <ol className="divide-y rounded-lg border px-4">{history.map(result => <li key={result.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div><p className="font-medium">{scenarioRoute(result.routeId).name} · {result.score}分 · {outcomeLabels[result.outcome]}</p><p className="mt-1 text-base text-muted-foreground">{new Date(result.finishedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} · 场景 {result.seed}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setReview(result)}>查看回顾</Button><Button asChild variant="outline"><Link to="/exam/$routeId" params={{ routeId: result.routeId }} search={{ seed: result.seed }}>相同场景重考</Link></Button></div></li>)}</ol> : <p className="rounded-lg border p-4 text-base text-muted-foreground">考试结束后，最近12次结果会保存在本机。</p>}</section>
    <Dialog open={!!review} onOpenChange={open => { if (!open) setReview(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl"><DialogHeader><DialogTitle>考试回顾</DialogTitle><DialogDescription>查看本次扣分、操作记录和当时的路况。</DialogDescription></DialogHeader>{review && <ExamReport result={review} />}</DialogContent></Dialog>
  </div>
}
