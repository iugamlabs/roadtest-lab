import { useReducer, useRef, useState } from 'react'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useSidebar } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { roadRoutes } from '@/features/content/queries'
import { loadRouteCourse } from '@/features/memory/course/course'
import { RouteCourse } from '@/features/memory/course/workspace'
import type { MemorySource } from '@/features/memory/progress'
import { SimulationLighting, StageGuide } from './controls'
import { checkpointKey, newSimulationAttempt, simulationReducer, type Operation } from './model'
import { SimulationResults } from './results'
import { selectLightingScenarios, simulationStages, type SimulationStage } from './scenarios'

export function SimulationWorkspace({ source }: { source: MemorySource }) {
  const routeName = roadRoutes.find(route => route.id === source.routeId)!.name
  const [course] = useState(() => loadRouteCourse(source))
  const [voice, setVoice] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [debug, setDebug] = useState(false)
  const [attempt, dispatch] = useReducer(simulationReducer, null)
  const startButton = useRef<HTMLButtonElement>(null)
  const beforeDialog = useRef<HTMLElement>(null)
  const stage = attempt?.step.id ?? 'ready'
  const stageIndex = simulationStages.findIndex(item => item.id === stage)
  const current = simulationStages[stageIndex]
  const active = stageIndex >= 0
  const blocker = useBlocker({ shouldBlockFn: () => active, withResolver: true, enableBeforeUnload: active })
  const { openMobile } = useSidebar()
  const suspended = exiting || blocker.status === 'blocked' || openMobile

  function start(debugStage?: SimulationStage | 'result') {
    if (!course) return
    setDebug(debugStage !== undefined)
    dispatch({ type: 'begin', attempt: newSimulationAttempt(selectLightingScenarios(), debugStage) })
  }

  function clear() {
    setExiting(false)
    setDebug(false)
    dispatch({ type: 'clear' })
  }

  function operate(operation: Operation) {
    if (!attempt || !active || suspended || document.hidden) return
    dispatch({ type: 'operate', checkpoint: checkpointKey(attempt.step), operation })
  }

  const stagePrompt = current ? `第 ${stageIndex + 1} 项，${current.title}。` : ''
  const speechProps = { voice, suspended, stagePrompt }
  const guideStage = stage === 'preparation' || stage === 'start' || stage === 'parking' ? stage : null

  return <div className="mx-auto max-w-6xl space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
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
      {simulationStages.map((item, index) => <li key={item.id} aria-current={stage === item.id ? 'step' : undefined}>
        <Badge variant={stage === item.id ? 'default' : 'outline'} className="text-base">
          {index + 1}. {item.title}
        </Badge>
      </li>)}
    </ol>

    {stage === 'ready' && <Card><CardContent className="space-y-3">
      <p>听流程、练灯光，再看 10 段实景短片回答路线题。</p>
      {source.routeId === '6' && <p className="text-base text-muted-foreground">六号线略过一处待核实转弯。</p>}
      {course ? <Button ref={startButton} onClick={() => start()}><Play aria-hidden />开始模拟考试</Button>
        : <p role="status">路线资料核对后会开放本线路的模拟。</p>}
    </CardContent></Card>}

    {import.meta.env.DEV && stage === 'ready' && course && <details className="space-y-3 rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">快速调试</summary>
      <div className="flex flex-wrap gap-2">
        {simulationStages.map(({ id, title }) => <Button key={id} variant="outline" onClick={() => start(id)}>{title}</Button>)}
        <Button variant="outline" onClick={() => start('result')}>试听示例结果</Button>
      </div>
    </details>}
    {debug && <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-base text-muted-foreground">调试轮次</p>
      <Button variant="outline" onClick={clear}>返回调试选择</Button>
    </div>}

    {current && (guideStage
      ? <StageGuide stage={guideStage} title={current.title} {...speechProps} onConfirm={() => operate({ type: 'confirm-guide' })} />
      : <h2 className="text-xl font-semibold">{current.title}</h2>)}
    {attempt?.step.id === 'lighting' && <SimulationLighting step={attempt.step} lighting={attempt.lighting} operate={operate} {...speechProps} />}
    {stage === 'road' && course && <RouteCourse source={source} course={course} {...speechProps}
      onComplete={answers => operate({ type: 'road-finish', course: answers })} />}

    {attempt && stage === 'result' && <SimulationResults attempt={attempt} source={source} voice={voice} suspended={suspended}
      restart={<Button variant="outline" onClick={() => start()}><RotateCcw aria-hidden />再模拟一次</Button>} />}

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
          <Button onClick={() => { if (blocker.status === 'blocked') blocker.proceed(); else clear() }}>退出本轮</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
}
