import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, BookOpen, ClipboardCheck, Lightbulb } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { MapRouteCards } from '@/features/exam/map/route-cards'

export const Route = createFileRoute('/')({ component: HomePage })

const shortcuts = [
  { to: '/exam', icon: ClipboardCheck, title: '场景考试', description: '在路线图上练操作，检验学习成果。' },
  { to: '/exam/lighting', icon: Lightbulb, title: '灯光考试', description: '听口令选灯光，随机 5 题。' },
  { to: '/materials', icon: BookOpen, title: '学习资料', description: '查路线图、字幕和考试流程。' },
] as const

function HomePage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 py-2 md:py-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">开始练习</h1>
          <p className="mt-1 text-base text-muted-foreground">汕头大学路</p>
        </div>
        <Badge variant="secondary">C2 自动挡</Badge>
      </header>

      <section aria-label="路线视频练习">
        <MapRouteCards destination="video" />
      </section>

      <nav aria-label="其他学习入口" className="grid gap-3 lg:grid-cols-3">
        {shortcuts.map(item => (
          <Button key={item.to} asChild variant="outline" className="h-auto min-w-0 justify-start whitespace-normal p-5 text-left">
            <Link to={item.to}>
              <div className="w-full min-w-0">
                <div className="flex items-center gap-3">
                  <item.icon className="size-6 shrink-0" aria-hidden />
                  <h2 className="flex-1 text-lg font-semibold">{item.title}</h2>
                  <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <p className="mt-3 text-base font-normal leading-relaxed text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          </Button>
        ))}
      </nav>

      <p className="text-base text-muted-foreground">路线考核为教学自测，不代表正式考试。</p>
    </div>
  )
}
