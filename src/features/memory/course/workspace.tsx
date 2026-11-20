import { useEffect, useReducer, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, CircleHelp, Minus, Play, RotateCcw, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSidebar } from '@/components/ui/sidebar'
import { roadRoutes } from '@/features/content/queries'
import type { MemorySource } from '../progress'
import type { QuizQuestion } from '../quiz/bank'
import { QuizClip } from '../quiz/clip'
import { initialRouteQuizState, quizOutcome, routeQuizReducer, summarizeQuiz, UNKNOWN_ANSWER, type QuizAnswer } from '../quiz/model'
import { RouteEventReplay } from '../quiz/replay'
import { outcomeStyles } from '../quiz/results'
import { COURSE_POINTS_PER_SEGMENT, prepareRouteCourse, type RouteCourseContent } from './course'

export function RouteCourse({ source, course, onClose }: {
  source: MemorySource
  course: RouteCourseContent | null
  onClose: () => void
}) {
  const routeName = roadRoutes.find(route => route.id === source.routeId)!.name
  const questions = course?.questions ?? []
  const [state, dispatch] = useReducer(routeQuizReducer, initialRouteQuizState)
  const [ending, setEnding] = useState(false)
  const [arrivalReady, setArrivalReady] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const options = useRef<HTMLDivElement>(null)
  const question = state.phase === 'answering' ? state.questions[state.index] : undefined
  const arrival = state.phase === 'finished' && state.answers.length === questions.length && !reviewing
  const showResult = state.phase === 'finished' && !arrival
  const live = Boolean(question) || arrival
  const blocker = useBlocker({ shouldBlockFn: () => live, withResolver: true, enableBeforeUnload: live })
  const { openMobile } = useSidebar()
  const suspended = ending || blocker.status === 'blocked' || openMobile

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    if (live) stage.current?.scrollIntoView({ block: 'start' })
    else window.scrollTo({ top: 0, behavior: 'instant' })
  }, [state.phase, state.index, live])

  useEffect(() => {
    if (state.optionsVisible) options.current?.focus({ preventScroll: true })
  }, [state.optionsVisible])

  function start() {
    setArrivalReady(false)
    setReviewing(false)
    dispatch({ type: 'start', questions: prepareRouteCourse(questions) })
  }

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="size-14 shrink-0" aria-label="返回上一页" onClick={() => live ? setEnding(true) : onClose()}><ArrowLeft aria-hidden /></Button>
        <h1 className="page-title">{routeName} <span className="inline-block">· 从头走一遍</span></h1>
      </div>
      {live && <Button variant="ghost" onClick={() => setEnding(true)}>结束本轮</Button>}
    </header>

    {state.phase === 'ready' && <section className="space-y-4 rounded-lg border p-4">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">试试能不能把{routeName}一路接到终点</h2>
      {questions.length ? <>
        <p>先看实景认位置，自己想下一段的顺序和走向，再看选项。提交后继续往前走，到终点统一核对。不限时。</p>
        <p className="text-base text-muted-foreground">想先自查的话，可以在看视频前，从出场到停车口头讲一遍。</p>
        <Button onClick={start}><Play aria-hidden />从起点开始 · {questions.length} 段</Button>
      </> : <p role="status">路线资料核对后会开放这一考程，可以先返回学习。</p>}
    </section>}

    {live && <div ref={stage} className="grid scroll-mt-4 items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      {question?.clip && <QuizClip key={question.id} routeId={source.routeId} clip={question.clip} suspended={suspended}
        onReady={ready => dispatch({ type: 'frame-ready', questionId: question.id, ready })} />}
      {arrival && course && <QuizClip key="arrival" routeId={source.routeId} clip={course.arrivalClip} suspended={suspended} onReady={setArrivalReady} />}
      <section className="min-w-0 space-y-4 rounded-lg border p-4" aria-label="路线接续答题区">
        <Badge variant="secondary">{arrival ? '终点' : `第 ${state.index + 1} / ${state.questions.length} 段`}</Badge>
        <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">
          {arrival ? '看完终点短片，就可以核对答案。' : question?.prompt}
        </h2>
        {question && <>
          {state.optionsVisible ? <>
            <div ref={options} tabIndex={-1} role="group" aria-label="选择这段的走法" className="grid gap-2">
              {question.options.map(option => <Button key={option.id}
                variant={state.selected === option.id ? 'secondary' : 'outline'} aria-pressed={state.selected === option.id}
                className="h-auto min-h-14 justify-start whitespace-normal py-3 text-left text-base"
                disabled={!state.frameReady} onClick={() => dispatch({ type: 'select', selected: option.id })}>
                <span className="flex-1">{option.label}</span>
                {state.selected === option.id && <span className="inline-flex shrink-0 items-center gap-1 text-sm"><Check aria-hidden />已选</span>}
              </Button>)}
            </div>
            <Button className="w-full" disabled={!state.frameReady || state.selected === null}
              onClick={() => dispatch({ type: 'submit' })}>确定并继续<ArrowRight aria-hidden /></Button>
          </> : <Button className="w-full" disabled={!state.frameReady} onClick={() => dispatch({ type: 'reveal-options' })}>查看选项</Button>}
          <Button variant="outline" className="w-full" disabled={!state.frameReady}
            onClick={() => dispatch({ type: 'submit', unknown: true })}>想不起来，继续走</Button>
        </>}
        {arrival && <Button disabled={!arrivalReady} onClick={() => setReviewing(true)}>查看本轮结果<ArrowRight aria-hidden /></Button>}
      </section>
    </div>}

    {showResult && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">本轮路线回顾</h2>
        <Button variant="outline" onClick={start}><RotateCcw aria-hidden />再从头走一遍</Button>
      </div>
      <CourseResults source={source} questions={state.questions} answers={state.answers} />
    </>}

    <Dialog open={ending} onOpenChange={setEnding}>
      <DialogContent>
        <DialogHeader><DialogTitle>现在结束本轮？</DialogTitle><DialogDescription>可以查看已经提交的答案。尚未提交的路段会标为未作答。</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEnding(false)}>接着走</Button>
          <Button onClick={() => { setEnding(false); setReviewing(true); dispatch({ type: 'finish' }) }}>结束并查看结果</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>离开这轮考程？</DialogTitle><DialogDescription>本轮答案仅在当前页面查看。离开前可以结束并查看结果。</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => blocker.reset?.()}>留下接着走</Button>
          <Button onClick={() => blocker.proceed?.()}>离开考程</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}

const segmentLabels = { independent: '答对', assisted: '答对', wrong: '答错', unknown: '想不起来', unanswered: '未作答' }
const segmentIcons = { independent: Check, assisted: Check, wrong: X, unknown: CircleHelp, unanswered: Minus }

function CourseResults({ source, questions, answers }: { source: MemorySource; questions: QuizQuestion[]; answers: QuizAnswer[] }) {
  const [replay, setReplay] = useState<string[]>([])
  const trigger = useRef<HTMLButtonElement>(null)
  const answersById = new Map(answers.map(answer => [answer.questionId, answer]))
  const outcomes = questions.map(question => quizOutcome(question, answersById.get(question.id)))
  const tally = summarizeQuiz(questions, answers)
  const correct = tally.independent + tally.assisted
  const totals = { independent: correct, wrong: tally.wrong, unknown: tally.unknown, unanswered: tally.unanswered }
  const firstGap = outcomes.findIndex(outcome => outcome === 'wrong' || outcome === 'unknown')
  const gapStart = firstGap < 0 ? undefined : source.events[questions[firstGap].topicStartIndex]

  return <>
    <section aria-label="本轮得分和各段结果" className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-medium">路线记忆得分</p>
          <p className="font-semibold tabular-nums"><span className="text-4xl">{correct * COURSE_POINTS_PER_SEGMENT}</span>
            <span className="ml-2 text-base text-muted-foreground">/ {questions.length * COURSE_POINTS_PER_SEGMENT} 分</span></p>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-base text-muted-foreground">
          {tally.unanswered > 0 && <span>提前结束</span>}
          <span>答对一段得 {COURSE_POINTS_PER_SEGMENT} 分</span>
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(['independent', 'wrong', 'unknown', 'unanswered'] as const).map(outcome => {
          const Icon = segmentIcons[outcome]
          return <div key={outcome} className={`rounded-md border p-2 sm:p-2.5 ${outcomeStyles[outcome]}`}>
            <dt className="flex items-center gap-1 text-sm font-medium sm:gap-1.5 sm:text-base"><Icon className="size-4 shrink-0 sm:size-5" aria-hidden />{segmentLabels[outcome]}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{totals[outcome]} <span className="text-base font-normal">段</span></dd>
          </div>
        })}
      </dl>
      {gapStart && <p className="text-base">第一次没接上的是第 {firstGap + 1} 段，从「{gapStart.title}」开始。</p>}
      <div role="group" aria-label="按段查看解析" className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {questions.map((question, index) => {
          const outcome = outcomes[index]
          const Icon = segmentIcons[outcome]
          return <Button key={question.id} variant="ghost" size="icon"
            className={`min-h-14 w-full flex-col gap-0.5 border text-base hover:underline ${outcomeStyles[outcome]}`}
            aria-label={`第 ${index + 1} 段，${segmentLabels[outcome]}，查看解析`}
            onClick={() => {
              const heading = document.getElementById(question.id)
              heading?.focus({ preventScroll: true })
              heading?.scrollIntoView({ block: 'start' })
            }}>
            <Icon className="size-5" aria-hidden />
            {index + 1}
          </Button>
        })}
      </div>
    </section>
    <ol className="divide-y rounded-lg border px-4">
      {questions.map((question, index) => {
        const outcome = outcomes[index]
        const Icon = segmentIcons[outcome]
        const answer = answersById.get(question.id)?.selected
        const chosen = answer === UNKNOWN_ANSWER ? segmentLabels.unknown : question.options.find(option => option.id === answer)?.label ?? segmentLabels.unanswered
        const start = source.events[question.topicStartIndex]
        const end = source.events[question.topicStartIndex + question.topicEventIds.length - 1]
        const previous = source.events[question.topicStartIndex - 1]
        return <li key={question.id} className="space-y-3 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={question.id} tabIndex={-1} className="scroll-mt-20 font-semibold focus-visible:outline-2 focus-visible:outline-ring">第 {index + 1} 段</h3>
            <Badge variant="outline" className={`text-sm ${outcomeStyles[outcome]}`}><Icon className="size-4" aria-hidden />{segmentLabels[outcome]}</Badge>
          </div>
          <p className="text-base text-muted-foreground">{start.title}{end !== start && ` 至 ${end.title}`}</p>
          <p className="font-medium">{question.prompt}</p>
          <dl className="grid gap-2 text-base sm:grid-cols-2">
            <div className={`rounded-md border p-3 ${outcomeStyles[outcome]}`}><dt>你的答案</dt><dd className="font-semibold">{chosen}</dd></div>
            <div className="rounded-md border p-3"><dt className="text-muted-foreground">正确答案</dt><dd className="font-semibold">{question.explanation}</dd></div>
          </dl>
          <Button variant="outline" onClick={event => {
            trigger.current = event.currentTarget
            setReplay(previous ? [previous.id, ...question.topicEventIds] : question.topicEventIds)
          }}>回看这段实景<span className="sr-only">，第 {index + 1} 段</span></Button>
        </li>
      })}
    </ol>
    <RouteEventReplay source={source} eventIds={replay} trigger={trigger.current} onClose={() => setReplay([])} returnLabel="返回路线回顾" />
  </>
}
