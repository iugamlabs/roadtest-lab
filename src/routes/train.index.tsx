import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Info, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { roadRoutes } from '@/features/content/queries'

export const Route = createFileRoute('/train/')({ component: HomePage })
function HomePage() {
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="page-title">路线选择</h1><p className="muted mt-2">选一条路线开始，按自己的节奏观看和练习。</p></div><Badge variant="secondary">C2 自动挡</Badge></div>
    <div className="grid gap-4 xl:grid-cols-3">
      {roadRoutes.map(route => <Card key={route.id}>
        <CardHeader><div className="mb-3 flex items-center justify-between"><span className="text-3xl font-semibold tabular-nums">{route.id.padStart(2, '0')}</span><Badge variant="outline"><MapPin aria-hidden />大学路考场</Badge></div><CardTitle className="text-xl"><h2>{route.name}</h2></CardTitle><CardDescription className="text-base leading-relaxed">{route.description}</CardDescription></CardHeader>
        <CardContent className="flex-1 text-base text-muted-foreground">实景视频 · 支持慢放和回看</CardContent>
        <CardFooter><Button asChild className="w-full justify-between"><Link to="/train/$routeId" params={{ routeId: route.id }}>进入路线<ArrowRight aria-hidden /></Link></Button></CardFooter>
      </Card>)}
    </div>
    <Alert><Info aria-hidden /><AlertTitle>先看熟路线，再练关键操作</AlertTitle><AlertDescription>不用控制油门和方向盘。进入路线后，可以观看教学，也可以开始全程或单项练习。视频会在关键位置暂停，帮助记住操作步骤。</AlertDescription></Alert>
  </div>
}
