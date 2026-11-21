import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { shuffle } from '@/features/memory/quiz/bank'
import { usePromptSpeech } from '../use-prompt-speech'

const walkaround = '绕车检查'

export const operationSteps = {
  preparation: [
    '上车并调整座椅',
    '确认身份核验已完成（模拟）',
    '观察后下车，关好车门',
    walkaround,
    '回到车内，关好车门',
    '系好安全带',
    '确认车辆状态，启动车辆',
  ],
  start: [
    '打开左转向灯',
    '踩住制动，挂 D 挡',
    '观察后方和侧方，确认可以安全起步',
    '松开驻车制动，平稳起步',
  ],
  parking: [
    '打开右转向灯',
    '观察右后方，确认可以安全靠边',
    '平顺减速，靠边停车',
    '确认车辆已停稳',
    '关闭右转向灯',
    '完成驻车制动和 P 挡操作',
    '按结束提示，解开安全带',
    '观察车外，确认安全后下车并关门',
  ],
} as const

export type OperationReview = { attempted: string; expected: string }

export function SimulationOperations({ steps, nextLabel, voice, suspended, onComplete }: {
  steps: readonly string[]
  nextLabel: string
  voice: boolean
  suspended: boolean
  onComplete: (corrections: OperationReview[]) => void
}) {
  const [choices] = useState(() => shuffle([...steps], Math.random))
  const [completed, setCompleted] = useState(0)
  const [corrections, setCorrections] = useState<OperationReview[]>([])
  const [message, setMessage] = useState('')
  const [checkpoints, setCheckpoints] = useState<number[] | null>(null)
  const group = useRef<HTMLDivElement>(null)
  const checkpointGroup = useRef<HTMLDivElement>(null)
  const next = useRef<HTMLButtonElement>(null)
  const done = completed === steps.length
  const checking = checkpoints !== null
  const prompt = checking ? '模拟绕车检查，请确认四处检查点。'
    : done ? '本环节操作已完成。'
      : `第 ${completed + 1} 步，接下来要做什么？`
  const speech = usePromptSpeech(prompt, voice, suspended)

  useEffect(() => {
    if (completed === 0) return
    if (done) next.current?.focus()
    else group.current?.focus()
  }, [completed, done])

  useEffect(() => {
    if (checking) checkpointGroup.current?.focus()
  }, [checking])

  function complete(action: string) {
    setCompleted(completed + 1)
    setMessage(`已完成：${action}`)
  }

  function choose(action: string) {
    const expected = steps[completed]
    if (action === expected) {
      if (action === walkaround) {
        setCheckpoints([])
        setMessage('')
      } else complete(action)
      return
    }
    setCorrections(current => current.some(entry => entry.expected === expected)
      ? current : [...current, { attempted: action, expected }])
    setMessage(`已选「${action}」。还有一步要先完成，请再想一想。`)
  }

  return <Card><CardContent className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p>{prompt}</p>
      <Button variant="outline" disabled={!voice || suspended} onClick={speech.replay}><Volume2 aria-hidden />重听提示</Button>
    </div>
    {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请看文字提示。</p>}
    {checkpoints ? <div ref={checkpointGroup} tabIndex={-1} role="group" aria-label="绕车检查点" className="grid gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-2">
      {[1, 2, 3, 4].map(point => <Button key={point} variant={checkpoints.includes(point) ? 'secondary' : 'outline'}
        aria-pressed={checkpoints.includes(point)} onClick={() => setCheckpoints(current => current?.includes(point) ? current : [...(current ?? []), point])}>
        {checkpoints.includes(point) && <Check aria-hidden />}检查点 {point}
      </Button>)}
      <Button className="sm:col-span-2" disabled={checkpoints.length < 4} onClick={() => { setCheckpoints(null); complete(walkaround) }}>
        完成绕车检查<ArrowRight aria-hidden />
      </Button>
    </div> : <div ref={group} tabIndex={-1} role="group" aria-label="模拟操作" className="grid gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring sm:grid-cols-2">
      {choices.map(action => {
        const checked = steps.slice(0, completed).includes(action)
        return <Button key={action} variant={checked ? 'secondary' : 'outline'} disabled={checked}
          className="h-auto min-h-14 justify-start whitespace-normal py-3 text-left" onClick={() => choose(action)}>
          {checked && <Check aria-hidden />}<span>{action}{checked && <span className="sr-only">，已完成</span>}</span>
        </Button>
      })}
    </div>}
    <p role="status" className="min-h-6 text-base text-muted-foreground">{message}</p>
    {done && <Button ref={next} onClick={() => onComplete(corrections)}>{nextLabel}<ArrowRight aria-hidden /></Button>}
  </CardContent></Card>
}
