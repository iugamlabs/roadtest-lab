import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, ClipboardCheck, Play, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapRouteCards } from '@/features/exam/map/route-cards'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/')({ component: HomePage })

const shortcuts = [
  { to: '/exam/simulation', icon: ClipboardCheck, title: '科目三流程模拟', description: '听流程、练灯光，看实景短片答路线题。' },
  { to: '/train', icon: Play, title: '视频操作练习', description: '观看完整教学，按步骤练关键动作。' },
  { to: '/exam/lighting', icon: Lightbulb, title: '灯光口令考核', description: '听口令选灯光，随机 5 题。' },
  { to: '/materials', icon: BookOpen, title: '学习资料', description: '查路线图、字幕和考试流程。' },
] as const

function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-2 md:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">把路线记熟</h1>
          <p className="mt-1 text-base text-muted-foreground">看实景认路，试着自己说出下一步。</p>
        </div>
        <Badge variant="secondary">C2 自动挡</Badge>
      </header>

      <section aria-label="选择路线开始记忆">
        <MapRouteCards showQuiz />
      </section>

      <nav aria-label="其他学习入口" className="grid gap-3 sm:grid-cols-2">
        {shortcuts.map(item => (
          <Button
            key={item.to}
            asChild
            variant="outline"
            className={cn(
              'h-auto min-w-0 justify-start whitespace-normal p-5 text-left',
              item.to === '/exam/lighting' && 'border-(--lighting-main)/45 dark:border-(--lighting-main)/45',
            )}
          >
            <Link to={item.to}>
              <div className="w-full min-w-0">
                <div className={cn('flex items-center gap-3', item.to === '/exam/lighting' && 'text-(--lighting-main)')}>
                  <item.icon className="size-6 shrink-0" aria-hidden />
                  <h2 className="flex-1 text-lg font-semibold">{item.title}</h2>
                  <ArrowRight className="size-5 opacity-80" aria-hidden />
                </div>
                <p className="mt-3 text-base font-normal leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          </Button>
        ))}
      </nav>

      <p className="text-base text-muted-foreground">先跟着学，再自己回忆；一次练一小段，逐渐把整条路线连起来。</p>
    </div>
  )
}
