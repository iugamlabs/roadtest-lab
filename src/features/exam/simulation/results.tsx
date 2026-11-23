import { useEffect, useRef, type ReactNode } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { summarizeRouteCourse } from '@/features/memory/course/course'
import { CourseResults } from '@/features/memory/course/workspace'
import type { MemorySource } from '@/features/memory/progress'
import { usePromptSpeech } from '../use-prompt-speech'
import type { SimulationAttempt } from './model'
import { examRule } from './rules'
import { simulationStages } from './scenarios'

export function SimulationResults({ attempt, source, voice, suspended, restart }: {
  attempt: SimulationAttempt
  source: MemorySource
  voice: boolean
  suspended: boolean
  restart: ReactNode
}) {
  const heading = useRef<HTMLHeadingElement>(null)
  const { course, lightAnswers, completed } = attempt
  const correct = course && summarizeRouteCourse(course.questions, course.answers).correct
  const title = '本次模拟已完成'
  const prompt = course ? `${title}。实景路线答对 ${correct} 段，共 ${course.questions.length} 段。` : `${title}。`
  const speech = usePromptSpeech(prompt, voice, suspended)
  useEffect(() => { heading.current?.focus() }, [])

  const needsReview = lightAnswers.filter(answer => answer.checks.some(check => check.violated)).length
  const unassessed = lightAnswers.filter(answer => answer.checks.length === 0).length

  return <>
    <Card><CardContent className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{title}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!voice || suspended} onClick={speech.replay}><Volume2 aria-hidden />重听结果</Button>
          {restart}
        </div>
      </div>
      {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请查看下方结果。</p>}
      {completed.length < simulationStages.length && <ul className="flex flex-wrap gap-2" aria-label="各阶段结果">
        {simulationStages.map(stage => <li key={stage.id} className="rounded-md border p-2 text-base">
          {stage.title} · {completed.includes(stage.id) ? '已完成' : '未进行'}
        </li>)}
      </ul>}
    </CardContent></Card>

    {course && <CourseResults source={source} {...course} />}

    {lightAnswers.length > 0 && <details className="rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">
        灯光回顾 · {needsReview} 题需复习{unassessed > 0 && ` · ${unassessed} 题未评判`}
      </summary>
      <ol className="mt-2 divide-y">
        {lightAnswers.map((answer, index) => {
          const faults = answer.checks.filter(check => check.violated)
          const status = faults.length ? '需复习' : answer.checks.length ? '已评操作符合要求' : '操作组合暂未评判'
          return <li key={answer.scenario.id} className="space-y-1 py-2 text-base">
            <p className="font-medium">{index + 1}. {answer.scenario.prompt} · {status}</p>
            <p>{answer.status}</p>
            <p>参考操作 · {answer.scenario.expected}</p>
            {faults.map(({ clause }) => <p key={clause} className="text-muted-foreground">§{clause}　{examRule(clause).text}</p>)}
          </li>
        })}
      </ol>
    </details>}
  </>
}
