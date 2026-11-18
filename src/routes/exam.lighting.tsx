import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LightingExam } from '@/features/exam/lighting/exam'

export const Route = createFileRoute('/exam/lighting')({ component: LightingExamPage })

function LightingExamPage() {
  return <div className="space-y-4">
    <header className="flex items-center gap-3">
      <Button asChild variant="outline" size="icon"><Link to="/" aria-label="返回首页"><ArrowLeft aria-hidden /></Link></Button>
      <h1 className="page-title">模拟灯光考试</h1>
    </header>
    <LightingExam />
  </div>
}
