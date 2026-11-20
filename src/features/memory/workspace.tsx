import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, BookOpen, Check, ClipboardCheck, Eye, Lightbulb, List, Play, RotateCcw, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { roadRoutes } from '@/features/content/queries'
import { subtitleText, type CalibratedEvent, type ReviewedSubtitleCue } from '@/features/content/schema'
import { useSettings } from '@/features/settings/settings'
import { LearningSettings } from '@/features/settings/learning-settings'
import { useSidebar } from '@/components/ui/sidebar'
import { TrainingVideoPlayer } from '@/features/training/video-player'
import { initialMemoryState, memoryActions, memoryReducer, ratingLabels, type MemoryAnswer, type MemoryMode, type MemoryRating } from './model'
import { readMemoryProgress, recordMemoryAnswer, saveMemoryProgress, type MemorySource } from './progress'
import { useMemoryPlayback } from './use-memory-playback'
import { loadQuizBank, scopedQuizQuestions, type QuizBank } from './quiz/bank'
import { RouteQuiz } from './quiz/workspace'

type WorkspaceProps = { source: MemorySource; subtitles: { cues: ReviewedSubtitleCue[] } }
export function MemoryWorkspace({ source, subtitles, closeDirectQuiz }: WorkspaceProps & { closeDirectQuiz?: () => void }) {
  const [quiz, setQuiz] = useState<{ scopeEventIds?: string[] } | null>(null)
  const bank = useMemo(() => loadQuizBank(source), [source])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [quiz])
  if (quiz || closeDirectQuiz) return <RouteQuiz source={source} bank={bank} scopeEventIds={quiz?.scopeEventIds}
    onClose={closeDirectQuiz ?? (() => setQuiz(null))} />
  return <MemoryStudy source={source} subtitles={subtitles} bank={bank} onQuiz={scopeEventIds => setQuiz({ scopeEventIds })} />
}

function MemoryStudy({ source, subtitles, bank, onQuiz }: WorkspaceProps & { bank: QuizBank; onQuiz: (eventIds?: string[]) => void }) {
  const route = roadRoutes.find(item => item.id === source.routeId)!
  const [state, dispatch] = useReducer(memoryReducer, initialMemoryState)
  const [mode, setMode] = useState<MemoryMode>('learn')
  const [scope, setScope] = useState('short')
  const [startIndex, setStartIndex] = useState(0)
  const [stored, setStored] = useState(() => {
    try { return readMemoryProgress(localStorage, source) }
    catch { return { entries: [], notice: '本机记录暂时不可用，仍可完成本次练习。' } }
  })
  const entriesRef = useRef(stored.entries)
  const savedAnswer = useRef<MemoryAnswer | undefined>(undefined)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ending, setEnding] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const { settings } = useSettings()
  const { openMobile } = useSidebar()
  const playback = useMemoryPlayback(state, dispatch, source.events)
  playback.originalAudio.current = settings.originalAudio
  const { video, time, duration, playing, mediaError } = playback
  const active = state.targets[state.index]
  const live = state.phase !== 'ready' && state.phase !== 'finished'
  const blocker = useBlocker({ shouldBlockFn: () => { if (live) { playback.pause(); return true }; return false }, withResolver: true, enableBeforeUnload: live })
  const concealed = state.mode === 'recall' && live && state.phase !== 'revealed'
  const ready = duration > 0 && !mediaError
  const weak = source.events.filter(event => stored.entries.some(entry => entry.eventId === event.id && entry.rating !== 'independent'))
  const targets = scope === 'weak' ? weak : scope === 'all' ? source.events.slice(startIndex) : source.events.slice(startIndex, startIndex + 5)
  const completedIds = state.mode === 'learn' ? state.learned : state.answers.map(answer => answer.eventId)
  const segmentQuizAvailable = scopedQuizQuestions(bank, completedIds).length > 0
  const currentCue = subtitles.cues.find(cue => cue.startMs <= time * 1000 && cue.endMs > time * 1000)
  const previous = active ? source.events[source.events.findIndex(event => event.id === active.id) - 1] : undefined
  const next = active ? source.events[source.events.findIndex(event => event.id === active.id) + 1] : undefined
  const recalled = state.answers.filter(answer => answer.rating === 'independent').length
  const prompted = state.answers.filter(answer => answer.rating === 'prompted').length
  const again = state.answers.filter(answer => answer.rating === 'again').length

  useEffect(() => {
    const answer = state.answers.at(-1)
    if (!answer || answer === savedAnswer.current) return
    savedAnswer.current = answer
    const entries = recordMemoryAnswer(entriesRef.current, answer)
    entriesRef.current = entries
    let saved = false
    try { saved = saveMemoryProgress(localStorage, source, entries) } catch { /* Keep the current session usable. */ }
    setStored({ entries, notice: saved ? '' : '本次回忆仍可查看，但未能保存在本机。' })
  }, [state.answers, source])

  useEffect(() => {
    if (state.phase === 'question' || state.phase === 'revealed' || state.phase === 'finished') {
      heading.current?.focus({ preventScroll: true })
      if (window.matchMedia('(max-width: 1023px)').matches) heading.current?.scrollIntoView({ block: 'start' })
    }
  }, [state.phase, state.index])

  useEffect(() => { if (openMobile) playback.pause() }, [openMobile])
  function start(nextMode: MemoryMode, nextTargets: CalibratedEvent[]) {
    if (!ready || !nextTargets.length) return
    setMode(nextMode)
    playback.start(nextMode, nextTargets)
  }
  const phaseLabel = state.phase === 'travelling' ? '看看沿途，想想接下来到哪里。'
    : state.phase === 'question' ? '到了回忆位置，请先自己想一想。'
      : state.phase === 'revealed' ? '对照讲解，看看有没有遗漏。' : null

  return <div className="memory-workspace space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Button asChild variant="outline" size="icon" className="size-[56px] shrink-0"><Link to="/memory" aria-label="返回路线记忆"><ArrowLeft aria-hidden /></Link></Button>
        <h1 className="page-title">{route.name} · 记路线</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {!live && <Button disabled={!bank.questions.length} onClick={() => onQuiz()}><ClipboardCheck aria-hidden />路线小测</Button>}
        {!live && <Button asChild variant="outline"><Link to="/exam/simulation" search={{ routeId: source.routeId }}><ArrowRight aria-hidden />科目三流程模拟</Link></Button>}
        {live && <Button variant="ghost" onClick={() => { playback.pause(); setEnding(true) }}>结束本轮</Button>}
        <Sheet open={settingsOpen} onOpenChange={open => { if (open) playback.pause(); setSettingsOpen(open) }}>
          <SheetTrigger asChild><Button variant="outline"><Settings2 aria-hidden />学习设置</Button></SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>学习设置</SheetTitle><SheetDescription>可调整原片字幕遮罩。关闭后，请手动继续播放。</SheetDescription></SheetHeader><div className="p-4"><LearningSettings /></div></SheetContent>
        </Sheet>
        {!live && <Button asChild variant="ghost"><Link to="/train/$routeId" params={{ routeId: source.routeId }}><BookOpen aria-hidden />视频操作练习</Link></Button>}
      </div>
    </header>

    {state.phase === 'ready' && <section className="space-y-4 rounded-lg border p-4" aria-label="选择记忆方式">
      <p className="text-xl font-semibold">先跟着看熟，再试着自己说出下一步。</p>
      <Tabs value={mode} onValueChange={value => setMode(value as MemoryMode)}><TabsList className="h-auto w-full sm:w-auto" aria-label="记忆方式"><TabsTrigger value="learn" className="min-h-14 px-5 text-base"><BookOpen aria-hidden />跟着学</TabsTrigger><TabsTrigger value="recall" className="min-h-14 px-5 text-base"><Lightbulb aria-hidden />自己回忆</TabsTrigger></TabsList></Tabs>
      <p className="text-base text-muted-foreground">{mode === 'learn' ? '沿真实视频走一段，到关键位置看讲解，串起前后的路线。' : '先看道路，口头说出位置、接下来的走向和动作，再查看讲解。回忆时静音并遮住字幕。'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="memory-scope">这次练多少</Label><Select value={scope} onValueChange={setScope}><SelectTrigger id="memory-scope" className="min-h-14 w-full text-base"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="short">先连练 5 处</SelectItem><SelectItem value="all">连练到终点</SelectItem><SelectItem value="weak" disabled={!weak.length}>重练需要提示的 {weak.length} 处</SelectItem></SelectContent></Select></div>
        {scope !== 'weak' && <div className="space-y-2"><Label htmlFor="memory-start">从哪里开始</Label><Select value={String(startIndex)} onValueChange={value => setStartIndex(Number(value))}><SelectTrigger id="memory-start" className="min-h-14 w-full text-base"><SelectValue /></SelectTrigger><SelectContent>{source.events.map((event, index) => <SelectItem key={event.id} value={String(index)}>{index + 1}. {event.title}</SelectItem>)}</SelectContent></Select></div>}
      </div>
      <Button className="w-full sm:w-auto" disabled={!ready || !targets.length} onClick={() => start(mode, targets)}><Play aria-hidden />{mode === 'learn' ? '开始跟着学' : '开始自己回忆'} · {targets.length} 处</Button>
      {bank.notice && <p role="status" className="text-base text-muted-foreground">{bank.notice}</p>}
      <p className="text-sm text-muted-foreground">{!ready ? mediaError ? '请先重新加载下方视频。' : '正在准备实景视频…' : '可以直接说出来，不用操作虚拟车辆，也不需要录音。'}</p>
    </section>}

    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(18rem,1fr)]">
      <div className="min-w-0 space-y-3">
        <TrainingVideoPlayer routeId={source.routeId} name={route.name} video={video} time={time} duration={duration} playing={playing}
          playbackLabel={playing ? '暂停视频' : state.phase === 'question' ? '先回忆，再看讲解' : '播放视频'}
          playbackDisabled={!ready || !live || state.phase === 'question' || settingsOpen || openMobile}
          pauseControl={playing} mediaReady={ready && live} mediaError={mediaError}
          requiresOperations={state.phase === 'question' || state.phase === 'revealed'} practiceNotice={phaseLabel}
          subtitle={currentCue ? subtitleText(currentCue) : null} concealAnswers={concealed}
          controller={playback.controller} onSeek={playback.seek} onTime={playback.onTime} onDuration={playback.setDuration}
          onPlaying={playback.setPlaying} onError={value => { if (value) playback.pause(); playback.setMediaError(value) }} />
        {concealed && <p className="text-base text-muted-foreground">回忆时已关闭原声和教学字幕，并遮住原片字幕；可在学习设置中调整遮罩位置。</p>}
        {playback.notice && <p role="status" className="text-base">{playback.notice}</p>}
      </div>

      <section className="min-w-0 space-y-4 rounded-lg border p-4" aria-label="路线回忆区">
        {live && <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="secondary">{state.mode === 'learn' ? '跟着学' : '自己回忆'}</Badge><span className="text-base text-muted-foreground">第 {state.index + 1} / {state.targets.length} 处</span></div>}
        {state.phase === 'ready' && <><h2 className="text-xl font-semibold">记住一段连续的路线</h2><ol className="list-decimal space-y-3 pl-6 text-base leading-relaxed"><li>看道路，认出自己到了哪里。</li><li>想起接下来往哪里走。</li><li>说出这里需要准备的动作。</li><li>把这一段接到下一段。</li></ol><p className="text-base text-muted-foreground">{stored.entries.length ? `已自评 ${stored.entries.length} 处，其中 ${weak.length} 处需要提示或重练。` : '先练一小段，熟悉后再连起来回忆。'}</p></>}
        {state.phase === 'travelling' && <><h2 className="text-xl font-semibold">看看沿途的道路</h2><p className="leading-relaxed">留意路口和道路特征，想想下一处在哪里、需要做什么。</p><p className="text-base text-muted-foreground">到回忆位置会停住，不限时。暂停后点击播放器继续。</p></>}
        {state.phase === 'question' && active && <>
          <h2 ref={heading} tabIndex={-1} className="scroll-mt-4 text-2xl font-semibold leading-relaxed focus-visible:outline-2 focus-visible:outline-ring">这里是什么地方？接下来怎么走？</h2>
          <p className="leading-relaxed">先自己说一遍：这里需要准备哪些动作？做完后，下一段去哪里？</p>
          {state.hint >= 1 && <p role="status" className="rounded-md bg-muted p-3 text-base">{previous ? `前一处是「${previous.title}」。试着接着往下想。` : '这是路线开始后的第一处，看看出场道路。'}</p>}
          {state.hint >= 2 && <p role="status" className="rounded-md bg-muted p-3 text-base">这里是：{active.title}</p>}
          <Button className="w-full" onClick={() => { playback.pause(); dispatch({ type: 'reveal' }) }}><Eye aria-hidden />想好了，查看讲解</Button>
          <Button variant="outline" className="w-full" disabled={state.hint >= 2} onClick={() => dispatch({ type: 'hint' })}><Lightbulb aria-hidden />{state.hint === 0 ? '给我一点提示' : state.hint === 1 ? '再提示项目名称' : '已显示两次提示'}</Button>
        </>}
        {state.phase === 'revealed' && active && <>
          <h2 ref={heading} tabIndex={-1} className="scroll-mt-4 text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{active.title}</h2>
          <p className="leading-relaxed">{active.kind === 'straight' ? '保持视野开阔，观察前方，保持直线行驶。' : active.kind === 'parking' ? '观察右后方，打右转向灯，平顺减速并确认安全后靠边停稳。' : active.guidance}</p>
          <ul className="list-disc space-y-2 pl-5 text-base leading-relaxed">{memoryActions(active).map(action => <li key={action}>{action}</li>)}</ul>
          <p className="border-t pt-3 text-base"><span className="text-muted-foreground">接下来：</span>{next?.title ?? '这条路线的收尾。把前面的路段连起来回想一遍。'}</p>
          <Button variant="outline" className="w-full" disabled={!ready} onClick={playback.replay}><RotateCcw aria-hidden />回看这段实景和原声</Button>
          {state.mode === 'learn' ? <Button className="w-full" disabled={!ready} onClick={() => playback.advance({ type: 'next' })}>{state.index + 1 === state.targets.length ? '完成这段学习' : '记住了，继续下一段'}<ArrowRight aria-hidden /></Button> : <div className="space-y-2 border-t pt-3"><p className="text-base">对照刚才揭晓前的回答，你记得怎么样？</p>{(['independent', 'prompted', 'again'] as MemoryRating[]).map(rating => <Button key={rating} className="w-full whitespace-normal" variant={rating === 'independent' ? 'default' : 'outline'} disabled={!ready || rating === 'independent' && state.hint > 0} onClick={() => playback.advance({ type: 'rate', rating })}>{rating === 'independent' ? <Check aria-hidden /> : rating === 'prompted' ? <Lightbulb aria-hidden /> : <RotateCcw aria-hidden />}{ratingLabels[rating]}</Button>)}{state.hint > 0 && <p className="text-sm text-muted-foreground">本处使用过提示，可以记为“提示后想起来了”或再练。</p>}</div>}
          <p className="text-sm leading-relaxed text-muted-foreground">这是动作记忆的教学对照，按实际交通情况判断；要点不代表唯一操作顺序。</p>
        </>}
        {state.phase === 'finished' && <>
          <h2 ref={heading} tabIndex={-1} className="text-2xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{(state.mode === 'learn' ? state.learned.length : state.answers.length) < state.targets.length ? '本轮已结束' : state.mode === 'learn' ? '这一段看完了' : '这一轮回忆完成'}</h2>
          {state.mode === 'learn' ? <p>跟着学了 {state.learned.length} 处，试试撤掉提示，自己回忆。</p> : <><p className="leading-relaxed">自己想起 {recalled} 处，提示后想起 {prompted} 处，再练 {again} 处。</p><p className="text-base text-muted-foreground">这是本次口头回忆的自评，不是考试成绩。</p></>}
          {segmentQuizAvailable && <Button className="w-full" onClick={() => onQuiz(completedIds)}><ClipboardCheck aria-hidden />考考刚才这一段</Button>}
          <Button className="w-full" disabled={!ready} onClick={() => start('recall', state.targets)}><Lightbulb aria-hidden />{state.mode === 'learn' ? '试着自己回忆这一段' : '再回忆这一段'}</Button>
          {state.mode === 'recall' && state.answers.some(answer => answer.rating !== 'independent') && <Button className="w-full" variant="outline" disabled={!ready} onClick={() => start('recall', state.targets.filter(event => state.answers.some(answer => answer.eventId === event.id && answer.rating !== 'independent')))}><RotateCcw aria-hidden />只重练需要提示的路段</Button>}
          {(state.mode === 'learn' ? state.learned.length : state.answers.length) === state.targets.length && source.events.indexOf(state.targets.at(-1)!) + 1 < source.events.length && <Button className="w-full" variant="outline" disabled={!ready} onClick={() => start(state.mode, source.events.slice(source.events.indexOf(state.targets.at(-1)!) + 1, source.events.indexOf(state.targets.at(-1)!) + 6))}>接着练后面 5 处<ArrowRight aria-hidden /></Button>}
          <div className="space-y-2 border-t pt-3">{state.targets.map(event => { const answer = state.answers.find(item => item.eventId === event.id); return <div key={event.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-base"><div><p>{event.title}</p><p className="text-muted-foreground">{answer ? ratingLabels[answer.rating] : state.learned.includes(event.id) ? '已跟着学' : '尚未完成'}</p></div><Button variant="ghost" disabled={!ready} onClick={() => start('recall', [event])} aria-label={`重新回忆${event.title}`}><RotateCcw aria-hidden />重练</Button></div> })}</div>
          <Button className="w-full" variant="outline" onClick={() => { playback.pause(); dispatch({ type: 'reset' }) }}><List aria-hidden />重新选择学习范围</Button>
        </>}
      </section>
    </div>
    {stored.notice && <p role="status" className="text-base text-muted-foreground">{stored.notice}</p>}
    <p className="text-sm leading-relaxed text-muted-foreground">沿用教学视频的关键位置与动作说明。现场路况仍需自主观察，记熟路线不代替实际驾驶判断。</p>
    <Dialog open={ending} onOpenChange={setEnding}><DialogContent><DialogHeader><DialogTitle>结束这一轮？</DialogTitle><DialogDescription>已完成的回忆自评会保留，可以查看回顾后再练。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setEnding(false)}>留在这里</Button><Button onClick={() => { setEnding(false); dispatch({ type: 'finish' }) }}>结束并查看回顾</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={blocker.status === 'blocked'} onOpenChange={open => { if (!open) blocker.reset?.() }}><DialogContent><DialogHeader><DialogTitle>离开当前路线？</DialogTitle><DialogDescription>已完成的自评会保留，当前播放位置不保存。留在这里后，请手动继续。</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => blocker.reset?.()}>留在这里</Button><Button onClick={() => blocker.proceed?.()}>离开路线</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
