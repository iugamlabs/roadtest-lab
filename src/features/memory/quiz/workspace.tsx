import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowUp, Check, CircleHelp, ClipboardCheck, CornerDownLeft, CornerDownRight, Undo2, Volume2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { roadRoutes } from '@/features/content/queries'
import { BrowserSpeech } from '@/features/exam/speech'
import type { MemorySource } from '../progress'
import { chooseQuizQuestions, QUIZ_ROUND_SIZE, quizKindLabels, scopedQuizQuestions, type QuizBank, type QuizQuestion } from './bank'
import { QuizFrame } from './frame'
import { makeQuizResult, readQuizHistory, saveQuizResult, type RouteQuizResult } from './history'
import { initialRouteQuizState, routeQuizReducer, summarizeQuiz, UNKNOWN_ANSWER } from './model'
import { QuizReplay } from './replay'
import { QuizResults } from './results'

const directionIcons = { left: CornerDownLeft, straight: ArrowUp, right: CornerDownRight, uturn: Undo2 }

export function RouteQuiz({ source, bank, scopeEventIds, onClose }: {
  source: MemorySource; bank: QuizBank; scopeEventIds?: string[]; onClose: () => void
}) {
  const route = roadRoutes.find(item => item.id === source.routeId)!
  const pool = useMemo(() => scopedQuizQuestions(bank, scopeEventIds), [bank, scopeEventIds])
  const [state, dispatch] = useReducer(routeQuizReducer, initialRouteQuizState)
  const [ending, setEnding] = useState(false)
  const [history, setHistory] = useState(() => {
    try { return readQuizHistory(localStorage, bank) }
    catch { return { results: [], notice: '本机记录暂时不可用，仍可完成本轮小测。' } }
  })
  const recentIds = useMemo(() => new Set(history.results.slice(0, 2).flatMap(result => result.questionIds)), [history.results])
  const prepared = useMemo(() => chooseQuizQuestions(pool, Math.random, recentIds), [pool, recentIds])
  const [viewedResult, setViewedResult] = useState<RouteQuizResult | null>(null)
  const [replayQuestions, setReplayQuestions] = useState<QuizQuestion[]>([])
  const replayTrigger = useRef<HTMLButtonElement>(null)
  const [voice, setVoice] = useState(true)
  const [voiceError, setVoiceError] = useState(false)
  const [repeat, setRepeat] = useState(0)
  const saved = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const questionArea = useRef<HTMLDivElement>(null)
  const optionGroup = useRef<HTMLDivElement>(null)
  const live = state.phase === 'answering'
  const blocker = useBlocker({ shouldBlockFn: () => live, withResolver: true, enableBeforeUnload: live })
  const question = live ? state.questions[state.index] : undefined
  const showingResult = viewedResult !== null || state.phase === 'finished'
  const speechPaused = ending || blocker.status === 'blocked'

  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    if (live) questionArea.current?.scrollIntoView({ block: 'start' })
    else if (showingResult) window.scrollTo({ top: 0, behavior: 'instant' })
  }, [state.phase, state.index, live, showingResult, viewedResult])

  useEffect(() => {
    if (state.optionsVisible) optionGroup.current?.focus({ preventScroll: true })
  }, [state.optionsVisible])

  useEffect(() => {
    if (!question || !voice || speechPaused || document.hidden) return
    setVoiceError(false)
    const cancel = new BrowserSpeech().speak(`第 ${state.index + 1} 题。${question.prompt}`, {
      end: () => {},
      error: () => setVoiceError(true),
    })
    const stopWhenHidden = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () => {
      cancel()
      document.removeEventListener('visibilitychange', stopWhenHidden)
    }
  }, [question, state.index, voice, repeat, speechPaused])

  useEffect(() => {
    if (state.phase !== 'finished' || !state.answers.length || saved.current) return
    saved.current = true
    const result = makeQuizResult(state.questions.map(item => item.id), state.answers)
    let previous: RouteQuizResult[] | undefined
    let ok = false
    try {
      previous = readQuizHistory(localStorage, bank).results
      ok = saveQuizResult(localStorage, bank, previous, result)
    } catch { /* Current results remain visible. */ }
    setHistory(current => ({
      results: [result, ...(ok && previous ? previous : current.results)].slice(0, 12),
      notice: ok ? '' : '本轮结果仍可查看，但未能保存在本机。',
    }))
  }, [state.phase, state.questions, state.answers, bank])

  function start(questions = prepared) {
    saved.current = false
    setViewedResult(null)
    dispatch({ type: 'start', questions })
  }
  function openReplay(questions: QuizQuestion[], trigger: HTMLButtonElement) {
    replayTrigger.current = trigger
    setReplayQuestions(questions)
  }

  const voiceControls = <div className="flex flex-wrap items-center gap-3">
    <Label htmlFor="route-quiz-voice" className="min-h-14 text-base"><Volume2 className="size-5" aria-hidden />语音读题</Label>
    <Switch id="route-quiz-voice" checked={voice} onCheckedChange={setVoice} />
    {live && voice && <Button variant="outline" onClick={() => setRepeat(value => value + 1)}><Volume2 aria-hidden />重听题目</Button>}
  </div>

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2"><Button variant="outline" size="icon" className="size-[56px] shrink-0" aria-label="返回记路线" onClick={() => live ? setEnding(true) : onClose()}><ArrowLeft aria-hidden /></Button><h1 className="page-title">{route.name}<span className="inline-block"> · 路线小测</span></h1></div>
      {live && <Button variant="ghost" onClick={() => setEnding(true)}>结束本轮小测</Button>}
    </header>

    {state.phase === 'ready' && !viewedResult && <section className="space-y-4 rounded-lg border p-4">
      <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">试试能否自己接起路线</h2>
      <p className="leading-relaxed">{scopeEventIds ? '考一考刚才学习的这一段。' : '看实景认位置，回忆走向和前后的项目。'}不限时，先想一想，再看选项。整轮结束后核对答案。</p>
      {voiceControls}
      {prepared.length > 0 ? <Button onClick={() => start()}><ClipboardCheck aria-hidden />开始路线小测 · {prepared.length} 题</Button> : <p role="status" className="text-base">{bank.notice || '这一段暂时没有合适的小测题，可以先回忆或选择其他路段。'}</p>}
      {scopeEventIds && prepared.length < QUIZ_ROUND_SIZE && <p className="text-base text-muted-foreground">这段可测 {prepared.length} 题。整条路线每轮最多 {QUIZ_ROUND_SIZE} 题。</p>}
      <p className="text-sm text-muted-foreground">一轮只覆盖部分路段，做完后可以换一组继续测。</p>
    </section>}

    {question && <div ref={questionArea} className={question.frame ? 'grid scroll-mt-4 items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]' : 'mx-auto max-w-3xl scroll-mt-4'}>
      {question.frame && <QuizFrame key={question.id} routeId={source.routeId} question={question} onReady={ready => dispatch({ type: 'frame-ready', questionId: question.id, ready })} />}
      <section className="min-w-0 space-y-4 rounded-lg border p-4" aria-label="小测答题区">
        <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">{quizKindLabels[question.kind]}</Badge><span className="text-base text-muted-foreground">第 {state.index + 1} / {state.questions.length} 题</span></div>
        <h2 ref={heading} tabIndex={-1} className="scroll-mt-4 text-xl font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">{question.prompt}</h2>
        {voiceControls}
        {voice && voiceError && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请看题目文字作答。</p>}
        {!state.optionsVisible ? <Button className="w-full" disabled={!state.frameReady} onClick={() => dispatch({ type: 'reveal-options' })}>查看选项</Button> : <>
          <div ref={optionGroup} tabIndex={-1} role="group" aria-label="选择本题答案" className={question.kind === 'direction' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
            {question.options.map(option => {
              const Icon = directionIcons[option.id as keyof typeof directionIcons]
              return <Button key={option.id} variant={state.selected === option.id ? 'secondary' : 'outline'} className={question.kind === 'direction' ? 'h-auto min-h-24 flex-col gap-1 px-2 py-3 text-base sm:min-h-14 sm:flex-row sm:gap-2 sm:px-4 sm:text-left' : 'h-auto min-h-14 justify-start whitespace-normal py-3 text-left text-base'} aria-pressed={state.selected === option.id} disabled={!state.frameReady} onClick={() => dispatch({ type: 'select', selected: option.id })}>
                {Icon && <Icon className="size-6 shrink-0" aria-hidden />}<span className={question.kind === 'direction' ? 'whitespace-nowrap sm:flex-1' : 'flex-1'}>{option.label}</span>{state.selected === option.id && <span className="inline-flex shrink-0 items-center gap-1 text-sm"><Check className="size-4" aria-hidden />已选</span>}
              </Button>
            })}
            <Button variant={state.selected === UNKNOWN_ANSWER ? 'secondary' : 'outline'} className="col-span-full min-h-14 justify-start" aria-pressed={state.selected === UNKNOWN_ANSWER} disabled={!state.frameReady} onClick={() => dispatch({ type: 'select', selected: UNKNOWN_ANSWER })}><CircleHelp aria-hidden />想不起来{state.selected === UNKNOWN_ANSWER && <span className="ml-auto text-sm">已选</span>}</Button>
          </div>
          <Button className="w-full" disabled={state.selected === null || !state.frameReady} onClick={() => dispatch({ type: 'submit' })}><Check aria-hidden />确定答案</Button>
        </>}
      </section>
    </div>}

    {showingResult && <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{viewedResult ? '历史小测结果' : '本轮小测结果'}</h2>
        <Button variant="outline" onClick={viewedResult ? () => setViewedResult(null) : onClose}><ArrowLeft aria-hidden />{viewedResult ? '返回小测' : '返回路线学习'}</Button>
      </div>
      <QuizResults questions={viewedResult ? questionsForResult(viewedResult, bank) : state.questions}
        answers={viewedResult?.answers ?? state.answers} date={viewedResult ? resultDate(viewedResult) : undefined}
        onRetry={questions => {
          const seen = new Set([...recentIds, ...(viewedResult?.questionIds ?? state.questions.map(item => item.id))])
          start(questions ? chooseQuizQuestions(questions) : chooseQuizQuestions(pool, Math.random, seen))
        }} onReplay={openReplay} />
      <QuizReplay source={source} questions={replayQuestions} trigger={replayTrigger.current} onClose={() => setReplayQuestions([])} />
    </>}

    {!live && !viewedResult && history.results.length > 0 && <details className="rounded-lg border px-4">
      <summary className="min-h-14 cursor-pointer py-4 text-base font-semibold">本机最近小测 · {history.results.length} 次</summary>
      <div className="divide-y">{history.results.map(result => <HistoryRow key={result.id} result={result} bank={bank} onView={() => setViewedResult(result)} />)}</div>
    </details>}
    {history.notice && <p role="status" className="text-base text-muted-foreground">{history.notice}</p>}
    <Dialog open={ending} onOpenChange={setEnding}><DialogContent><DialogHeader><DialogTitle>结束这一轮小测？</DialogTitle><DialogDescription>结束后统一核对已提交的答案。未提交的题目不会记为答错。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setEnding(false)}>继续作答</Button><Button onClick={() => { setEnding(false); dispatch({ type: 'finish' }) }}>结束并查看结果</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }}><DialogContent><DialogHeader><DialogTitle>离开当前小测？</DialogTitle><DialogDescription>当前未结束的小测不会保存，已结束的记录会保留。可以留在这里，结束本轮后查看结果。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => blocker.reset?.()}>留在这里</Button><Button onClick={() => blocker.proceed?.()}>离开小测</Button></DialogFooter></DialogContent></Dialog>
    {state.phase === 'ready' && !viewedResult && <p className="text-sm text-muted-foreground"><Link to="/memory" className="underline underline-offset-4">选择其他路线</Link></p>}
  </div>
}

function questionsForResult(result: RouteQuizResult, bank: QuizBank) {
  return result.questionIds.flatMap(id => bank.questions.find(question => question.id === id) ?? [])
}

function resultDate(result: RouteQuizResult) {
  return `${new Date(result.at).toLocaleString('zh-CN')} · ${result.complete ? '已答完' : '提前结束'}`
}

function HistoryRow({ result, bank, onView }: { result: RouteQuizResult; bank: QuizBank; onView: () => void }) {
  const questions = questionsForResult(result, bank)
  const tally = summarizeQuiz(questions, result.answers)
  return <div className="flex flex-wrap items-center justify-between gap-2 py-3 text-base">
    <div className="space-y-1"><p>{resultDate(result)}</p><p className="text-muted-foreground">答对 {tally.independent + tally.assisted} / {questions.length} 题 · 答错 {tally.wrong} 题</p></div>
    <Button variant="outline" onClick={onView}>查看结果<span className="sr-only">，{resultDate(result)}</span></Button>
  </div>
}
