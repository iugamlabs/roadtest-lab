import { useEffect, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useSidebar } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { roadRoutes } from '@/features/content/queries'
import { loadRouteCourse, summarizeRouteCourse } from '@/features/memory/course/course'
import { CourseResults, RouteCourse, type CourseAnswers } from '@/features/memory/course/workspace'
import type { MemorySource } from '@/features/memory/progress'
import { UNKNOWN_ANSWER } from '@/features/memory/quiz/model'
import { LightingExam, LightingReview } from '../lighting/exam'
import { createLightingQuiz, lightingQuizScore, type LightingQuiz } from '../lighting/quiz'
import { usePromptSpeech } from '../use-prompt-speech'
import { operationSteps, SimulationOperations, type OperationReview } from './operations'

const stages = [
  { id: 'preparation', title: '上车准备' },
  { id: 'lighting', title: '灯光口令' },
  { id: 'start', title: 'C2 起步' },
  { id: 'road', title: '实景路线' },
  { id: 'parking', title: '停车收尾' },
] as const

type ExerciseStage = typeof stages[number]['id']
type Stage = ExerciseStage | 'ready' | 'result'
type OperationStage = keyof typeof operationSteps
const nextOperationStage = {
  preparation: { stage: 'lighting', label: '进入灯光环节' },
  start: { stage: 'road', label: '进入实景路线' },
  parking: { stage: 'result', label: '完成模拟，查看回顾' },
} as const

export function SimulationWorkspace({ source }: { source: MemorySource }) {
  const routeName = roadRoutes.find(route => route.id === source.routeId)!.name
  const [course] = useState(() => loadRouteCourse(source))
  const [stage, setStage] = useState<Stage>('ready')
  const [debugStart, setDebugStart] = useState<number>()
  const [voice, setVoice] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [lighting, setLighting] = useState<LightingQuiz>()
  const [road, setRoad] = useState<CourseAnswers>()
  const [reviews, setReviews] = useState<Partial<Record<OperationStage, OperationReview[]>>>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const startButton = useRef<HTMLButtonElement>(null)
  const beforeDialog = useRef<HTMLElement>(null)
  const current = stages.find(item => item.id === stage)
  const stagePrompt = current ? `第 ${stages.indexOf(current) + 1} 项，${current.title}。` : ''
  const active = current !== undefined
  const blocker = useBlocker({ shouldBlockFn: () => active, withResolver: true, enableBeforeUnload: active })
  const { openMobile } = useSidebar()
  const suspended = exiting || blocker.status === 'blocked' || openMobile
  const routeScore = stage === 'result' && road ? summarizeRouteCourse(road.questions, road.answers) : undefined
  const lightingCorrect = lighting ? lightingQuizScore(lighting) / 20 : 0
  const resultPrompt = routeScore && lighting
    ? `模拟考试结束。路线记忆得分 ${routeScore.points} 分，满分 ${routeScore.maxPoints} 分。灯光口令共 ${lighting.questions.length} 题，答对 ${lightingCorrect} 题。请查看各环节回顾。`
    : undefined
  const resultSpeech = usePromptSpeech(resultPrompt, voice, suspended)

  useEffect(() => {
    if (stage !== 'ready' && stage !== 'road') heading.current?.focus()
  }, [stage])

  function reset(next: Stage) {
    setDebugStart(undefined)
    setLighting(undefined)
    setRoad(undefined)
    setReviews({})
    setExiting(false)
    setStage(next)
  }

  function startDebug(next: ExerciseStage | 'result') {
    if (!import.meta.env.DEV || !course) return
    reset(next)
    const index = next === 'result' ? stages.length : stages.findIndex(item => item.id === next)
    setDebugStart(index)
    if (next === 'start' || next === 'road' || next === 'parking' || next === 'result') {
      const quiz = createLightingQuiz(() => 0)
      setLighting({ ...quiz, answers: quiz.questions.map(([, answer]) => answer) })
    }
    if (next === 'parking' || next === 'result') {
      setRoad({
        questions: course.questions,
        answers: course.questions.map((question, index) => ({
          questionId: question.id,
          selected: index === 0 ? UNKNOWN_ANSWER : question.correct,
          usedHint: false,
        })),
      })
    }
  }

  function completeOperations(id: OperationStage, corrections: OperationReview[]) {
    setReviews(previous => ({ ...previous, [id]: corrections }))
    setStage(nextOperationStage[id].stage)
  }

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="icon" className="size-14 shrink-0">
          <Link to="/exam/simulation" search={{}} aria-label="返回模拟路线选择"><ArrowLeft aria-hidden /></Link>
        </Button>
        <h1 className="page-title">{routeName} · 科目三流程模拟</h1>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="simulation-voice">
          {voice ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          语音播报
        </Label>
        <Switch id="simulation-voice" checked={voice} onCheckedChange={setVoice} />
        {active && <Button variant="outline" onClick={() => setExiting(true)}>退出本轮</Button>}
      </div>
    </header>

    <ol aria-label="模拟进度" className="flex flex-wrap gap-2">
      {stages.map((item, index) => <li key={item.id} aria-current={stage === item.id ? 'step' : undefined}>
        <Badge variant={stage === item.id ? 'default' : 'outline'} className="text-base">{index + 1}. {item.title}</Badge>
      </li>)}
    </ol>

    {stage === 'ready' && <Card><CardContent className="space-y-3">
      <p>从上车准备练到停车下车。灯光随机 5 题，实景路线按顺序走 10 段，不限时。</p>
      <p className="text-base text-muted-foreground">身份核验在页面内模拟。实景环节用短片练路线衔接，结束后查看各环节的练习回顾。</p>
      <Alert><AlertDescription className="text-base">上车流程参考《考试流程》图片。操作顺序用于 C2 学习，实车要求以当地考场和考试车辆为准。{source.routeId === '6' && '六号线跳过一处尚未开放的转弯。'}</AlertDescription></Alert>
      {course ? <Button ref={startButton} onClick={() => reset('preparation')}><Play aria-hidden />开始模拟</Button>
        : <p role="status">路线资料核对后会开放本线路的模拟。</p>}
    </CardContent></Card>}

    {import.meta.env.DEV && stage === 'ready' && course && <Card><CardContent className="space-y-3">
      <h2 className="text-xl font-semibold">快速调试</h2>
      <p className="text-base text-muted-foreground">选择要调试的阶段，或直接试听示例结果。</p>
      <div className="flex flex-wrap gap-2">
        {stages.map(({ id, title }) => <Button key={id} variant="outline" onClick={() => startDebug(id)}>{title}</Button>)}
        <Button variant="outline" onClick={() => startDebug('result')}>试听示例结果</Button>
      </div>
    </CardContent></Card>}
    {import.meta.env.DEV && debugStart !== undefined && <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-base text-muted-foreground">调试轮次。跳过的答题环节使用示例答案。</p>
      <Button variant="outline" onClick={() => reset('ready')}>返回调试选择</Button>
    </div>}

    {current && <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{current.title}</h2>}

    {(stage === 'preparation' || stage === 'start' || stage === 'parking') &&
      <SimulationOperations key={stage} steps={operationSteps[stage]} nextLabel={nextOperationStage[stage].label}
        stagePrompt={stagePrompt} voice={voice} suspended={suspended}
        onComplete={corrections => completeOperations(stage, corrections)} />}
    {stage === 'lighting' && <LightingExam stagePrompt={stagePrompt} voice={voice} suspended={suspended} onComplete={quiz => { setLighting(quiz); setStage('start') }} />}
    {stage === 'road' && course && <RouteCourse source={source} course={course} stagePrompt={stagePrompt} voice={voice} suspended={suspended}
      onComplete={result => { setRoad(result); setStage('parking') }} />}

    {stage === 'result' && road && lighting && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">模拟完成</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!voice || suspended} onClick={resultSpeech.replay}><Volume2 aria-hidden />重听结果</Button>
          <Button variant="outline" onClick={() => reset('preparation')}><RotateCcw aria-hidden />再模拟一次</Button>
        </div>
      </div>
      {resultSpeech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请查看下方结果。</p>}
      <p className="text-base text-muted-foreground">回顾仅在本页查看。路线记忆得分用于复习，正式考试另行评判。</p>
      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer font-semibold">灯光口令 · 答对 {lightingCorrect} / {lighting.questions.length} 题</summary>
        <LightingReview quiz={lighting} />
      </details>
      {stages.map(({ id, title }, index) => {
        if (id === 'lighting' || id === 'road') return null
        if (import.meta.env.DEV && debugStart !== undefined && index < debugStart) {
          return <p key={id} className="rounded-lg border p-4 text-base">{title} · 调试时已跳过</p>
        }
        const entries = reviews[id] ?? []
        return <details key={id} className="rounded-lg border p-4">
          <summary className="cursor-pointer font-semibold">{title} · {entries.length ? `${entries.length} 步需要回顾` : '所有步骤一次选对'}</summary>
          {entries.length ? <ul className="mt-3 space-y-2 text-base">
            {entries.map(entry => <li key={entry.expected}>先选了「{entry.attempted}」，这一步应先做「{entry.expected}」。</li>)}
          </ul> : <p className="mt-3 text-base">已按练习顺序完成全部操作。</p>}
        </details>
      })}
      <h3 className="text-xl font-semibold">实景路线回顾</h3>
      <CourseResults source={source} {...road} />
    </>}

    <Dialog open={exiting || blocker.status === 'blocked'} onOpenChange={open => {
      if (!open) { setExiting(false); blocker.reset?.() }
    }}>
      <DialogContent onOpenAutoFocus={() => {
        beforeDialog.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      }} onCloseAutoFocus={event => {
        event.preventDefault()
        if (beforeDialog.current?.isConnected) beforeDialog.current.focus()
        else startButton.current?.focus()
      }}>
        <DialogHeader><DialogTitle>退出本轮模拟？</DialogTitle>
          <DialogDescription>退出后，本轮作答和操作记录会清除。</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setExiting(false); blocker.reset?.() }}>继续模拟</Button>
          <Button onClick={() => { if (blocker.status === 'blocked') blocker.proceed(); else reset('ready') }}>退出本轮</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
