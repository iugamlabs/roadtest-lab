import { useEffect, useRef } from 'react'
import { ArrowLeftRight, ArrowRight, CircleCheck, Flashlight, LampDesk, Lightbulb, ParkingCircle, TriangleAlert, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ActionGrid, Control, StatePanel } from '@/components/vehicle-operation-ui'
import { usePromptSpeech } from '../use-prompt-speech'
import { checkpointKey, type GuideStage, type Operation, type SimulationAttempt } from './model'
import { lampNames } from './scenarios'

const guides = {
  preparation: {
    steps: [
      '首次上车，调整座椅和后视镜，按提示完成身份核验。',
      '下车关门，逆时针绕车一周，按考车要求完成检查。',
      '回到驾驶门，观察后方。确认安全后开门上车。',
      '关好车门、系好安全带，确认挡位和驻车制动，启动发动机。',
    ],
    next: '确认，进入灯光口令',
  },
  start: {
    steps: [
      '确认车门关牢、安全带已系，检查仪表，踩住脚刹。',
      '打左转向灯，观察内外后视镜，回头观察左后方。',
      '确认安全后挂 D 挡、松开驻车制动，平稳起步。驶入车道后关闭转向灯。',
    ],
    next: '确认，进入实景路线',
  },
  parking: {
    steps: [
      '听到靠边停车指令后，打右转向灯，观察右后方，确认安全后减速靠边。',
      '踩脚刹停稳，拉紧驻车制动，挂 P 挡，关闭转向灯并熄火。',
      '解开安全带，开门前回头观察左后方。确认安全后下车并关好车门。',
    ],
    next: '确认，完成考试',
  },
} satisfies Record<GuideStage, { steps: string[]; next: string }>

const lamps = [
  { lamp: 'off', icon: Lightbulb, theme: 'main' },
  { lamp: 'position', icon: ParkingCircle, theme: 'position' },
  { lamp: 'low', icon: LampDesk, theme: 'dipped' },
  { lamp: 'high', icon: Flashlight, theme: 'full' },
] as const

type SpeechProps = { voice: boolean; suspended: boolean; stagePrompt: string }

export function StageGuide({ stage, title, voice, suspended, stagePrompt, onConfirm }: SpeechProps & {
  stage: GuideStage
  title: string
  onConfirm: () => void
}) {
  const { steps, next } = guides[stage]
  const heading = useRef<HTMLHeadingElement>(null)
  const speech = usePromptSpeech(stagePrompt + steps.join(''), voice, suspended)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [stage])

  return <Card><CardContent className="space-y-4">
    <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">{title}</h2>
    <ol className="list-decimal space-y-3 pl-7 leading-relaxed">
      {steps.map(step => <li key={step} className="pl-1">{step}</li>)}
    </ol>
    {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请看文字流程。</p>}
    <Button className="h-auto min-h-14 max-w-full whitespace-normal" disabled={suspended} onClick={onConfirm}>
      <ArrowRight aria-hidden />{next}
    </Button>
  </CardContent></Card>
}

export function SimulationLighting({ step, lighting, operate, voice, suspended, stagePrompt }: SpeechProps & {
  step: Extract<SimulationAttempt['step'], { id: 'lighting' }>
  lighting: SimulationAttempt['lighting']
  operate: (operation: Operation) => void
}) {
  const { index, hazards, flash } = step
  const heading = useRef<HTMLHeadingElement>(null)
  const turnKey = checkpointKey(step)
  const shuttingDown = step.phase === 'shutdown'
  const prompt = shuttingDown ? '灯光考试完成，请关闭所有灯光' : lighting[index].prompt
  const speech = usePromptSpeech((!shuttingDown && index === 0 ? stagePrompt : '') + prompt, voice, suspended)
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [turnKey])
  const activeLamp = lamps.find(item => item.lamp === step.lamp)!

  return <Card className="min-w-0"><CardContent className="@container space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 ref={heading} tabIndex={-1} className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        {shuttingDown ? prompt : `第 ${index + 1} / ${lighting.length} 题`}
      </h3>
      <Button variant="outline" disabled={!voice || suspended} onClick={speech.replay}><Volume2 aria-hidden />重听提示</Button>
    </div>
    {!shuttingDown && <p>{prompt}</p>}
    {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请看文字提示。</p>}
    <div className="grid items-start gap-4 @min-[680px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <StatePanel title="灯光状态" items={[
        { label: '当前灯光', value: lampNames[step.lamp], icon: activeLamp.icon, purpose: 'signal', accent: activeLamp.theme, active: step.lamp !== 'off' },
        { label: '双闪', value: hazards ? '开启' : '关闭', icon: TriangleAlert, purpose: 'brake', active: hazards },
        ...(!shuttingDown ? [{
          label: '近远光交替', value: flash ? '已操作' : '未操作', icon: ArrowLeftRight,
          purpose: 'signal' as const, accent: 'flash' as const, active: flash,
        }] : []),
      ]} />
      <fieldset disabled={suspended} className="min-w-0 space-y-4">
        <ActionGrid label="模拟灯光">
          {lamps.filter(({ lamp }) => !shuttingDown || lamp === 'off').map(({ lamp, icon, theme }) => <Control key={lamp} icon={icon} accent={theme}
            selected={step.lamp === lamp} onClick={() => operate({ type: 'lamp', lamp })}>
            {lamp === 'off' ? '关闭灯光' : lampNames[lamp]}
          </Control>)}
          {!shuttingDown && <Control icon={ArrowLeftRight} accent="flash" selected={flash} onClick={() => operate({ type: 'flash' })}>交替使用远近光</Control>}
          {(!shuttingDown || hazards) && <Control icon={TriangleAlert} purpose="brake" selected={hazards} onClick={() => operate({ type: 'hazards' })}>
            {shuttingDown ? '关闭双闪' : '危险报警闪光灯'}
          </Control>}
        </ActionGrid>
        {!shuttingDown && <Control icon={CircleCheck} purpose="signal" primary onClick={() => operate({ type: 'lighting-submit' })}>确认灯光操作</Control>}
      </fieldset>
    </div>
  </CardContent></Card>
}
