import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CircleHelp, ClipboardCheck, CornerDownLeft, CornerDownRight, Lightbulb, RotateCcw, Undo2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { roadRoutes } from '@/features/content/queries'
import type { MemorySource } from '../progress'
import { chooseQuizQuestions, scopedQuizQuestions, type QuizBank, type QuizQuestion } from './bank'
import { QuizFrame } from './frame'
import { makeQuizResult, readQuizHistory, saveQuizResult, type RouteQuizResult } from './history'
import { finishedQuizSummary, initialRouteQuizState, quizOutcome, quizOutcomeLabels, routeQuizReducer, summarizeQuiz, UNKNOWN_ANSWER } from './model'

const directionIcons = { left: CornerDownLeft, straight: ArrowUp, right: CornerDownRight, uturn: Undo2 }

export function RouteQuiz({ source, bank, scopeEventIds, onClose, onStudy }: {
  source: MemorySource; bank: QuizBank; scopeEventIds?: string[]; onClose: () => void; onStudy: (eventIds: string[]) => void
}) {
  const route = roadRoutes.find(item => item.id === source.routeId)!
  const pool = useMemo(() => scopedQuizQuestions(bank, scopeEventIds), [bank, scopeEventIds])
  const prepared = useMemo(() => chooseQuizQuestions(pool), [pool])
  const [state, dispatch] = useReducer(routeQuizReducer, initialRouteQuizState)
  const [ending, setEnding] = useState(false)
  const [history, setHistory] = useState(() => {
    try { return readQuizHistory(localStorage, bank) }
    catch { return { results: [], notice: '本机记录暂时不可用，仍可完成本轮小测。' } }
  })
  const historyRef = useRef(history.results)
  const saved = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const questionArea = useRef<HTMLDivElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const live = state.phase === 'answering' || state.phase === 'submitted'
  const blocker = useBlocker({ shouldBlockFn: () => live, withResolver: true, enableBeforeUnload: live })
  const question = state.questions[state.index]
  const summary = finishedQuizSummary(state)
  const needsReview = state.phase === 'finished' ? state.questions.filter(item => quizOutcome(item, state.answers.find(answer => answer.questionId === item.id)) !== 'independent') : []

  useEffect(() => {
    if (state.phase === 'submitted') {
      nextButton.current?.focus({ preventScroll: true })
      nextButton.current?.scrollIntoView({ block: 'nearest' })
      return
    }
    heading.current?.focus({ preventScroll: true })
    if (state.phase !== 'ready' && window.matchMedia('(max-width: 1023px)').matches) {
      const area = state.phase === 'answering' ? questionArea.current : heading.current
      area?.scrollIntoView({ block: 'start' })
    }
  }, [state.phase, state.index])

  useEffect(() => {
    if (state.phase !== 'finished' || !state.answers.length || saved.current) return
    saved.current = true
    const result = makeQuizResult(state.questions.map(item => item.id), state.answers)
    const results = [result, ...historyRef.current].slice(0, 12)
    let ok = false
    try { ok = saveQuizResult(localStorage, bank, historyRef.current, result) } catch { /* Current results remain visible. */ }
    historyRef.current = results
    setHistory({ results, notice: ok ? '' : '本轮结果仍可查看，但未能保存在本机。' })
  }, [state.phase, state.questions, state.answers, bank])

  function start(questions = prepared) {
    saved.current = false
    dispatch({ type: 'start', questions })
  }
  function study(questions: QuizQuestion[]) {
    const ids = new Set(questions.flatMap(item => item.topicEventIds))
    onStudy(source.events.filter(event => ids.has(event.id)).map(event => event.id))
  }

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2"><Button variant="outline" size="icon" className="size-[56px] shrink-0" aria-label="返回记路线" onClick={() => live ? setEnding(true) : onClose()}><ArrowLeft aria-hidden /></Button><h1 className="page-title">{route.name}<span className="inline-block"> · 路线小测</span></h1></div>
      {live && <Button variant="ghost" onClick={() => setEnding(true)}>结束本轮小测</Button>}
    </header>

    {state.phase === 'ready' && <section className="space-y-4 rounded-lg border p-4">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">试试能否自己接起路线</h2>
      <p className="leading-relaxed">{scopeEventIds ? '考一考刚才学习的这一段。' : '从这条路线中抽取走向题和项目顺序题。'}每题选一个答案，整轮结束后再核对。</p>
      <div className="flex flex-wrap gap-2"><Badge variant="secondary">本轮 {prepared.length} 题</Badge><Badge variant="outline">不限时</Badge><Badge variant="outline">首次答案锁定</Badge></div>
      <p className="text-base text-muted-foreground">想不起来可以直接选择，也可看一点提示；提示后答对会单独记录。</p>
      {prepared.length > 0 ? <Button onClick={() => start()}><ClipboardCheck aria-hidden />开始路线小测 · {prepared.length} 题</Button> : <p role="status" className="text-base">{bank.notice || '这一段暂时没有合适的小测题，可以先回忆或选择其他路段。'}</p>}
      {scopeEventIds && prepared.length < 5 && <p className="text-base text-muted-foreground">这段可测 {prepared.length} 题；整条路线的小测每轮最多 5 题。</p>}
      <p className="text-sm text-muted-foreground">一轮只覆盖部分路段，做完后可以换一组继续测。</p>
    </section>}

    {live && question && <div ref={questionArea} className={question.kind === 'direction' ? 'grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]' : 'mx-auto max-w-3xl'}>
      {question.kind === 'direction' && <QuizFrame key={question.id} routeId={source.routeId} question={question} onReady={ready => dispatch({ type: 'frame-ready', questionId: question.id, ready })} />}
      <section className="min-w-0 space-y-4 rounded-lg border p-4" aria-label="小测答题区">
        <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">{question.kind === 'direction' ? '记走向' : '接顺序'}</Badge><span className="text-base text-muted-foreground">第 {state.index + 1} / {state.questions.length} 题</span></div>
        <h2 ref={heading} tabIndex={-1} className="scroll-mt-4 text-xl font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">{question.prompt}</h2>
        <div role="group" aria-label="选择本题答案" className={question.kind === 'direction' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
          {question.options.map(option => {
            const Icon = directionIcons[option.id as keyof typeof directionIcons]
            return <Button key={option.id} variant={state.selected === option.id ? 'secondary' : 'outline'} className={question.kind === 'direction' ? 'h-auto min-h-24 flex-col gap-1 px-2 py-3 text-base sm:min-h-14 sm:flex-row sm:gap-2 sm:px-4 sm:text-left' : 'h-auto min-h-14 justify-start whitespace-normal py-3 text-left text-base'} aria-pressed={state.selected === option.id} disabled={state.phase === 'submitted' || !state.frameReady} onClick={() => dispatch({ type: 'select', selected: option.id })}>
              {Icon && <Icon className="size-6 shrink-0" aria-hidden />}<span className={question.kind === 'direction' ? 'whitespace-nowrap sm:flex-1' : 'flex-1'}>{option.label}</span>{state.selected === option.id && <span className="inline-flex shrink-0 items-center gap-1 text-sm"><Check className="size-4" aria-hidden />已选</span>}
            </Button>
          })}
          <Button variant={state.selected === UNKNOWN_ANSWER ? 'secondary' : 'outline'} className="col-span-full min-h-14 justify-start" aria-pressed={state.selected === UNKNOWN_ANSWER} disabled={state.phase === 'submitted' || !state.frameReady} onClick={() => dispatch({ type: 'select', selected: UNKNOWN_ANSWER })}><CircleHelp aria-hidden />想不起来{state.selected === UNKNOWN_ANSWER && <span className="ml-auto text-sm">已选</span>}</Button>
        </div>
        {state.usedHint && <p role="status" className="rounded-md bg-muted p-3 text-base leading-relaxed">{question.hint}</p>}
        {state.phase === 'answering' ? <>
          <Button className="w-full" disabled={state.selected === null || !state.frameReady} onClick={() => dispatch({ type: 'submit' })}><Check aria-hidden />确定答案</Button>
          <Button variant="ghost" className="w-full" disabled={state.usedHint || !state.frameReady} onClick={() => dispatch({ type: 'hint' })}><Lightbulb aria-hidden />{state.usedHint ? '本题已使用提示' : '给我一点提示'}</Button>
        </> : <>
          <p role="status" className="text-base">答案已提交，整轮结束后统一核对。</p>
          <Button ref={nextButton} className="w-full" onClick={() => dispatch({ type: 'next' })}>{state.index + 1 === state.questions.length ? '查看本轮结果' : '下一题'}<ArrowRight aria-hidden /></Button>
        </>}
      </section>
    </div>}

    {summary && <section className="space-y-4" aria-label="本轮小测结果">
      <div className="space-y-3 rounded-lg border p-4">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">独立答对 {summary.independent} / {state.questions.length} 题</h2>
        <p className="text-base leading-relaxed">提示后答对 {summary.assisted} 题 · 答错 {summary.wrong} 题 · 想不起来 {summary.unknown} 题{summary.unanswered > 0 && ` · 未作答 ${summary.unanswered} 题`}</p>
        {summary.unanswered > 0 && <p className="text-base text-muted-foreground">本轮提前结束，未作答的题目没有记为答错。</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-base">{(['direction', 'sequence'] as const).map(kind => {
          const questions = state.questions.filter(item => item.kind === kind)
          if (!questions.length) return null
          const tally = summarizeQuiz(questions, state.answers)
          return <p key={kind}>{kind === 'direction' ? '走向判断' : '项目顺序'}：独立答对 {tally.independent} / {questions.length}{tally.assisted > 0 && `，提示后答对 ${tally.assisted}`}</p>
        })}</div>
        <p className="text-base text-muted-foreground">这是本轮路线记忆答题的结果，不代表已经掌握整条路线。</p>
        <div className="flex flex-wrap gap-2"><Button onClick={() => start(chooseQuizQuestions(pool))}><RotateCcw aria-hidden />再抽一组小测</Button>{needsReview.length > 0 && <><Button variant="outline" onClick={() => study(needsReview)}><BookOpen aria-hidden />回看没记牢的实景</Button><Button variant="outline" onClick={() => start(chooseQuizQuestions(needsReview))}><ClipboardCheck aria-hidden />只测需要复习的题</Button></>}</div>
      </div>
      <div className="divide-y rounded-lg border px-4">{state.questions.map((item, index) => {
        const answer = state.answers.find(value => value.questionId === item.id)
        const outcome = quizOutcome(item, answer)
        const Icon = outcome === 'independent' ? Check : outcome === 'assisted' ? Lightbulb : outcome === 'wrong' ? X : CircleHelp
        return <article key={item.id} className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-base font-semibold">第 {index + 1} 题 · {item.kind === 'direction' ? '记走向' : '接顺序'}</p><Badge variant="outline"><Icon className="size-4" aria-hidden />{quizOutcomeLabels[outcome]}</Badge></div>
          <p className="leading-relaxed">{item.prompt}</p>
          <p className="text-base text-muted-foreground">你的答案：{!answer ? '未作答' : answer.selected === UNKNOWN_ANSWER ? '想不起来' : item.options.find(option => option.id === answer.selected)?.label}{answer?.usedHint ? '（使用过提示）' : ''}</p>
          <p className="text-base">正确答案：{item.options.find(option => option.id === item.correct)?.label}</p>
          <p className="text-base leading-relaxed">{item.explanation}</p>
          <Button variant="outline" onClick={() => study([item])}><BookOpen aria-hidden />回看这段实景</Button>
        </article>
      })}</div>
      <Button variant="outline" onClick={onClose}><ArrowLeft aria-hidden />返回路线学习</Button>
    </section>}

    {!live && history.results.length > 0 && <details className="rounded-lg border px-4"><summary className="cursor-pointer py-4 text-base font-semibold">本机最近小测 · {history.results.length} 次</summary><div className="divide-y">{history.results.map(result => <HistoryRow key={result.id} result={result} bank={bank} />)}</div><p className="pb-4 text-sm text-muted-foreground">记录只反映各次抽到的题目，不作为整条路线的掌握结论。</p></details>}
    {history.notice && <p role="status" className="text-base text-muted-foreground">{history.notice}</p>}
    <Dialog open={ending} onOpenChange={setEnding}><DialogContent><DialogHeader><DialogTitle>结束这一轮小测？</DialogTitle><DialogDescription>结束后统一核对已提交的答案。未提交的题目不会记为答错。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setEnding(false)}>继续作答</Button><Button onClick={() => { setEnding(false); dispatch({ type: 'finish' }) }}>结束并查看结果</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }}><DialogContent><DialogHeader><DialogTitle>离开当前小测？</DialogTitle><DialogDescription>当前未结束的小测不会保存，已结束的记录会保留。可以留在这里，结束本轮后查看结果。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => blocker.reset?.()}>留在这里</Button><Button onClick={() => blocker.proceed?.()}>离开小测</Button></DialogFooter></DialogContent></Dialog>
    {state.phase === 'ready' && <p className="text-sm text-muted-foreground"><Link to="/memory" className="underline underline-offset-4">选择其他路线</Link></p>}
  </div>
}

function HistoryRow({ result, bank }: { result: RouteQuizResult; bank: QuizBank }) {
  const questions = result.questionIds.map(id => bank.questions.find(question => question.id === id)!).filter(Boolean)
  const tally = summarizeQuiz(questions, result.answers)
  return <div className="space-y-1 py-3 text-base"><p>{new Date(result.at).toLocaleString('zh-CN')} · {result.complete ? '已答完' : '提前结束'}</p><p>独立答对 {tally.independent} / {questions.length}，提示后答对 {tally.assisted}{tally.unanswered > 0 ? `，未作答 ${tally.unanswered}` : ''}</p></div>
}
