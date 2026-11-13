import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Check, MapPin, Play } from 'lucide-react'
import * as m from 'motion/react-m'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { roadRoutes } from '@/features/content/queries'

export const Route = createFileRoute('/')({ component: HomePage })
function HomePage() {
  return <>
    <section className="mb-9 grid items-end gap-6 md:grid-cols-[1.6fr_1fr]">
      <div><p className="eyebrow mb-3">实景路线学习</p><h1 className="page-title">先看熟路线，<br />再一步一步练操作。</h1><p className="muted mt-4 max-w-2xl">选择一条路线开始。车辆跟随视频前进，<br className="hidden lg:block" />你可以暂停、回看，慢慢记住沿途的位置。</p></div>
      <div className="rounded-2xl bg-[#e8eee2] p-6"><p className="mb-3 font-semibold">按自己的节奏来</p><p className="muted flex items-center gap-2 text-base"><Check size={20} aria-hidden />不用控制油门和方向盘</p><p className="muted flex items-center gap-2 text-base"><Check size={20} aria-hidden />支持慢放与重复观看</p></div>
    </section>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">今天练哪条路线？</h2><span className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground">三条路线 · C2 自动挡</span></div>
    <div className="grid gap-5 md:grid-cols-3">
      {roadRoutes.map((route, index) => <m.article key={route.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * .06 }} className="panel flex flex-col">
        <div className="mb-6 flex items-start justify-between"><span className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-3xl font-bold">{route.id}</span><span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin size={16} aria-hidden />大学路考场</span></div>
        <h3 className="text-2xl font-bold">{route.name}</h3><p className="muted mb-6 mt-3 flex-1 text-base">{route.description}</p>
        <Link to="/train/$routeId" params={{ routeId: route.id }} className={cn(buttonVariants(), 'min-h-14 w-full text-base')}><Play size={20} aria-hidden />进入路线<ArrowRight size={20} aria-hidden /></Link>
      </m.article>)}
    </div>
    <p className="muted mt-6 text-base">当前可观看实景视频、查看原始字幕并熟悉操作按钮。考试节点核对后，再开放完整模拟训练。</p>
  </>
}
