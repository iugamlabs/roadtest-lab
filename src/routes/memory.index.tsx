import { createFileRoute, Link } from '@tanstack/react-router'
import { BookOpen, ClipboardCheck, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapRouteCards } from '@/features/exam/map/route-cards'

export const Route = createFileRoute('/memory/')({ component: MemoryHome })

function MemoryHome() {
  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="page-title">路线记忆</h1><p className="mt-2 text-base text-muted-foreground">把路认熟，把前后项目连起来，在脑子里走一遍。</p></div><Badge variant="secondary">C2 自动挡</Badge></header>
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-base"><p className="flex items-center gap-2"><BookOpen className="size-5" aria-hidden />跟着学：看实景，串起路线</p><p className="flex items-center gap-2"><Lightbulb className="size-5" aria-hidden />自己回忆：先说出来，再核对</p><p className="flex items-center gap-2"><ClipboardCheck className="size-5" aria-hidden />路线小测：选答案，查遗漏</p></div>
    <MapRouteCards destination="memory" />
    <p className="text-base text-muted-foreground">默认先连练 5 处，也能选择起点、整条路线或需要提示的路段。回忆自评仅保存在这台设备。</p>
    <Button asChild variant="outline"><Link to="/exam/lighting"><Lightbulb aria-hidden />灯光口令考核</Link></Button>
  </div>
}
