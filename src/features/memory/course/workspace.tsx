import { useEffect, useReducer, useRef, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, Play, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSidebar } from '@/components/ui/sidebar'
import { roadRoutes } from '@/features/content/queries'
import type { MemorySource } from '../progress'
import type { QuizQuestion } from '../quiz/bank'
import { QuizClip } from '../quiz/clip'
import { initialRouteQuizState, quizOutcome, routeQuizReducer, UNKNOWN_ANSWER, type QuizAnswer } from '../quiz/model'
import { RouteEventReplay } from '../quiz/replay'
import { prepareRouteCourse, type RouteCourseContent } from './course'

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

function CourseResults({ source, questions, answers }: { source: MemorySource; questions: QuizQuestion[]; answers: QuizAnswer[] }) {
  const [replay, setReplay] = useState<string[]>([])
  const trigger = useRef<HTMLButtonElement>(null)
  const outcomes = questions.map((question, index) => quizOutcome(question, answers[index]))
  const correct = outcomes.filter(outcome => outcome === 'independent').length
  const firstGap = outcomes.findIndex(outcome => outcome === 'wrong' || outcome === 'unknown')
  const gapStart = firstGap < 0 ? undefined : source.events[questions[firstGap].topicStartIndex]
  const labels = { independent: '接对了', assisted: '接对了', wrong: '接错了', unknown: '想不起来', unanswered: '未作答' }
  return <>
    <p role="status">接对 {correct} / {questions.length} 段。
      {gapStart && `第一次没接上的是第 ${firstGap + 1} 段，从「${gapStart.title}」开始。`}
      {correct === questions.length && '从起点到终点，每一段都接上了。'}
      {answers.length === 0 && '本轮还没有提交答案。'}
    </p>
    <ol className="divide-y rounded-lg border px-4">
      {questions.map((question, index) => {
        const answer = answers[index]?.selected
        const covered = source.events.filter(event => question.topicEventIds.includes(event.id))
        const first = source.events[question.topicStartIndex - 1]
        return <li key={question.id} className="space-y-2 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">第 {index + 1} 段</h3>
            <Badge variant={outcomes[index] === 'independent' ? 'secondary' : 'outline'}>{labels[outcomes[index]]}</Badge>
          </div>
          <p className="text-base">{covered[0]?.title} 至 {covered.at(-1)?.title}</p>
          {answer && answer !== UNKNOWN_ANSWER && answer !== question.correct &&
            <p className="text-base text-muted-foreground">你选了 {question.options.find(option => option.id === answer)?.label}</p>}
          <p className="text-base"><span className="font-medium">正确走法</span> {question.explanation}</p>
          <Button variant="outline" onClick={event => {
            trigger.current = event.currentTarget
            setReplay(first ? [first.id, ...question.topicEventIds] : question.topicEventIds)
          }}>回看这段实景<span className="sr-only">，第 {index + 1} 段</span></Button>
        </li>
      })}
    </ol>
    <RouteEventReplay source={source} eventIds={replay} trigger={trigger.current} onClose={() => setReplay([])} returnLabel="返回路线回顾" />
  </>
}
