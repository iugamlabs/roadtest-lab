import { useEffect, useRef, useState } from 'react'
import { ArrowLeftRight, ArrowRight, Check, ClipboardCheck, Flashlight, LampDesk, Lightbulb, ParkingCircle, Play, RotateCcw, Square, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { usePromptSpeech } from '../use-prompt-speech'
import { answerLightingQuiz, createLightingQuiz, lightingActions, lightingQuizScore, type LightingAction, type LightingQuiz } from './quiz'

const lightingAppearance = {
  '打开大灯': { icon: Lightbulb, kind: 'main' },
  '近光灯': { icon: LampDesk, kind: 'dipped' },
  '远光灯': { icon: Flashlight, kind: 'full' },
  '远近光灯交替': { icon: ArrowLeftRight, kind: 'flash' },
  '示宽灯（小灯）': { icon: ParkingCircle, kind: 'position' },
} satisfies Record<LightingAction, { icon: typeof Lightbulb; kind: string }>

export function LightingExam({ onComplete, suspended = false, voice: simulationVoice }: {
  onComplete?: (quiz: LightingQuiz) => void
  suspended?: boolean
  voice?: boolean
} = {}) {
  const [quiz, setQuiz] = useState<LightingQuiz | null>(null)
  const [index, setIndex] = useState(0)
  const [finished, setFinished] = useState(false)
  const [standaloneVoice, setStandaloneVoice] = useState(true)
  const heading = useRef<HTMLHeadingElement>(null)
  const question = !finished ? quiz?.questions[index] : undefined
  const answered = quiz ? quiz.answers.length > index : false
  const selected = quiz?.answers[index]
  const correct = selected === question?.[1]
  const voice = simulationVoice ?? standaloneVoice
  const speech = usePromptSpeech(answered ? undefined : question?.[0], voice, suspended)

  useEffect(() => {
    if (quiz) heading.current?.focus()
  }, [quiz, index, finished])

  const start = () => {
    setQuiz(createLightingQuiz())
    setIndex(0)
    setFinished(false)
  }

  return <>
    <Card><CardContent className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground">{onComplete ? '随机 5 题 · 不限时' : '随机 5 题 · 每题 20 分 · 不限时'}</p>
        {simulationVoice === undefined && <div className="flex items-center gap-3"><Label htmlFor="lighting-voice">{voice ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}语音播报</Label><Switch id="lighting-voice" checked={voice} onCheckedChange={setStandaloneVoice} /></div>}
      </div>
      {!quiz && <>
        <p className="leading-relaxed">{onComplete ? '听口令或看文字，选择对应的灯光操作。全程结束后统一核对。' : '听口令或看文字，选择对应的灯光操作。答题后查看反馈，再进入下一题。全部答完后查看成绩和错题。'}</p>
        {!onComplete && <p className="text-base text-muted-foreground">这是灯光口令学习考核，不代表官方考试评分。</p>}
        <Button className="lighting-button" data-kind="dipped" onClick={start}><Play className="size-6" aria-hidden />开始灯光考试</Button>
      </>}
      {question && quiz && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold">第 {index + 1} / {quiz.questions.length} 题</p>
          <Button variant="outline" className="lighting-button" data-kind="full" disabled={!voice || answered || suspended} onClick={speech.replay}><Volume2 className="size-6" aria-hidden />重听口令</Button>
        </div>
        <h3 ref={heading} tabIndex={-1} className="rounded-md bg-muted px-4 py-5 text-2xl font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">{question[0]}</h3>
        {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请按文字口令答题，也可点击“重听口令”。</p>}
        <div role="group" aria-label="选择灯光操作" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lightingActions.map(action => {
            const { icon: Icon, kind } = lightingAppearance[action]
            return <Button key={action} variant="outline" data-kind={kind} aria-pressed={selected === action} disabled={answered} className="lighting-button lighting-answer h-auto min-h-16 whitespace-normal py-3 text-lg" onClick={() => setQuiz(current => current ? answerLightingQuiz(current, index, action) : current)}>
              <Icon className="size-7" aria-hidden /><span>{action}</span>
              {selected === action && <span className="inline-flex items-center gap-1 text-sm"><Check className="size-5" aria-hidden />已选</span>}
            </Button>
          })}
        </div>
        {answered && !onComplete && <div role="status" className="flex items-start gap-2 border-t pt-4">
          {correct ? <Check className="mt-1 size-6 shrink-0" aria-hidden /> : <X className="mt-1 size-6 shrink-0" aria-hidden />}
          <p className="leading-relaxed">{correct ? '回答正确，得 20 分。' : `回答错误。你选择了“${selected}”，正确操作是“${question[1]}”。`}</p>
        </div>}
        <div className="flex flex-wrap gap-3">
          {answered && <Button className="lighting-button" data-kind={index + 1 === quiz.questions.length ? 'main' : 'flash'} onClick={() => {
            if (index + 1 < quiz.questions.length) setIndex(index + 1)
            else if (onComplete) onComplete(quiz)
            else setFinished(true)
          }}>{index + 1 === quiz.questions.length && !onComplete ? <ClipboardCheck aria-hidden /> : <ArrowRight aria-hidden />}{index + 1 < quiz.questions.length ? '下一题' : onComplete ? '完成灯光，进入起步' : '查看成绩'}</Button>}
          {!onComplete && <Button variant="outline" className="lighting-button" data-kind="exit" onClick={() => setQuiz(null)}><Square className="size-6" aria-hidden />结束本次考试</Button>}
        </div>
      </>}
      {finished && quiz && <>
        <h3 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">考试完成：{lightingQuizScore(quiz)} 分</h3>
        <p>答对 {lightingQuizScore(quiz) / 20} / {quiz.questions.length} 题。{lightingQuizScore(quiz) === 100 ? '全部正确！' : '对照下面的正确操作，再练一次。'}</p>
        <LightingReview quiz={quiz} />
        <Button className="lighting-button" data-kind="position" onClick={start}><RotateCcw className="size-6" aria-hidden />再考一次</Button>
      </>}
    </CardContent></Card>
  </>
}

export function LightingReview({ quiz }: { quiz: LightingQuiz }) {
  return <ol aria-label="灯光答题回顾" className="divide-y">
    {quiz.questions.map(([command, action], index) => <li key={command} className="space-y-1 py-3">
      <p className="font-semibold">{index + 1}. {command}</p>
      <p className="flex items-start gap-2">{quiz.answers[index] === action ? <Check className="mt-1 size-5 shrink-0" aria-hidden /> : <X className="mt-1 size-5 shrink-0" aria-hidden />}
        <span>{quiz.answers[index] === action ? `正确：${action}` : `答错：${quiz.answers[index]}。正确操作：${action}`}</span>
      </p>
    </li>)}
  </ol>
}
