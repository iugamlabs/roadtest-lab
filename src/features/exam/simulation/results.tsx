import { useEffect, useRef, type ReactNode } from 'react'
import { Trophy, Volume2 } from 'lucide-react'
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
  const correct = course ? summarizeRouteCourse(course.questions, course.answers).correct : 0
  const title = completed.length === 0 ? '模拟结果预览' : '本次模拟已完成'
  const encouragement = !course ? '每一次练习，都在为上考场做准备。'
    : correct === course.questions.length ? '太棒了，整条路线都接上了！'
    : '做得好，你走完了整条路线！回看第一次没接上的路段，下次练习就从这里开始。'
  const wish = '祝你科目三一次通过！'
  const routeResult = course ? `实景路线共 ${course.questions.length} 段，你答对了 ${correct} 段。` : ''
  const prompt = `${title}。${routeResult}${encouragement}${wish}`
  const speech = usePromptSpeech(prompt, voice, suspended)
  useEffect(() => { heading.current?.focus() }, [])

  const needsReview = lightAnswers.filter(answer => answer.checks.some(check => check.violated)).length
  const unassessed = lightAnswers.filter(answer => answer.checks.length === 0).length

  return <>
    <Card className="bg-muted/40"><CardContent className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Trophy className="size-7 shrink-0 text-primary" aria-hidden />
          <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!voice || suspended} onClick={speech.replay}><Volume2 aria-hidden />重听结果</Button>
          {restart}
        </div>
      </div>
      <p>{encouragement}</p>
      <p className="text-xl font-semibold text-primary">{wish}</p>
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
