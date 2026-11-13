import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, CarFront, Check, ClipboardCheck, Map, MousePointer2, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/')({ component: HomePage })
function HomePage() {
  return <div className="mx-auto max-w-6xl space-y-8 py-3 md:py-6">
    <div className="flex items-center gap-3"><CarFront className="size-8" aria-hidden /><span className="text-xl font-semibold">路考练习室</span><Badge variant="secondary">C2 自动挡</Badge></div>
    <section className="grid items-center gap-6 border-y py-8 lg:grid-cols-[1.2fr_1fr] lg:gap-12" aria-labelledby="welcome-title">
      <div><p className="mb-3 text-base text-muted-foreground">汕头大学路 · 五、六、七号线</p><h1 id="welcome-title" className="text-3xl font-semibold leading-snug md:text-4xl">看熟路线，<br />一步一步练操作。</h1><p className="muted mt-4 max-w-xl">跟着真实行车视频，练习打灯、观察和刹车。可以随时暂停，也可以反复练习同一项。</p><div className="mt-6 flex flex-wrap gap-3"><Button asChild><Link to="/train">开始路线练习<ArrowRight aria-hidden /></Link></Button><Button asChild variant="outline"><Link to="/materials"><Map aria-hidden />先看路线图</Link></Button></div></div>
      <Card className="gap-0 py-0"><CardContent className="divide-y px-5">{[
        { icon: Play, title: '先看一遍，熟悉沿途位置', text: '播放教学视频，听教练讲解；看不清时可以慢放。' },
        { icon: MousePointer2, title: '再动手，记住关键步骤', text: '视频到关键位置自动暂停，按提示点击操作。' },
        { icon: Check, title: '多练几次，按自己的节奏来', text: '不计分、不限时，没记住的项目可以单独重练。' },
      ].map(item => <div key={item.title} className="flex gap-3 py-5"><item.icon className="mt-1 size-6 shrink-0" aria-hidden /><div><h2 className="font-semibold">{item.title}</h2><p className="muted mt-1 text-base">{item.text}</p></div></div>)}</CardContent></Card>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-start gap-3"><BookOpen className="mt-1 size-6 shrink-0" aria-hidden /><div><h2 className="font-semibold">想回顾某个位置？</h2><p className="muted mt-1 text-base">路线资料里有路线图和可搜索的教学字幕。</p></div></div><Button asChild variant="outline"><Link to="/materials">查看路线资料<ArrowRight aria-hidden /></Link></Button></div>
    <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-5"><div className="flex items-start gap-3"><ClipboardCheck className="mt-1 size-6 shrink-0" aria-hidden /><div><h2 className="font-semibold">路线熟悉了，试试场景考试</h2><p className="muted mt-1 text-base">跟随五、六、七号线的项目顺序，观察随机交通，自己决定操作时机。</p></div></div><Button asChild variant="outline"><Link to="/exam">进入场景考试<ArrowRight aria-hidden /></Link></Button></div>
    <p className="border-t pt-4 text-base text-muted-foreground">本工具帮助记忆路线和操作步骤，实际驾驶请结合道路情况亲自观察、判断。</p>
  </div>
}
