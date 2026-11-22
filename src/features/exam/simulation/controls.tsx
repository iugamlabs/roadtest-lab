import { useEffect, useRef, type ReactNode } from 'react'
import {
  Armchair, ArrowDown, ArrowDownToLine, ArrowLeft, ArrowLeftRight, ArrowRight, ArrowUp, ArrowUpRight,
  Ban, CarFront, CircleCheck, CircleStop, DoorClosed, DoorOpen, Eye, Flashlight, Footprints, Gauge,
  LampDesk, Lightbulb, ListChecks, MapPin, ParkingCircle, Power, ScanFace, ShieldCheck, TriangleAlert, Volume2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ActionGrid, Control, StatePanel, type StatusItem } from '@/components/vehicle-operation-ui'
import type { CourseAnswers } from '@/features/memory/course/course'
import { usePromptSpeech } from '../use-prompt-speech'
import { checkpointKey, roadDirection, walkOrder, type Operation, type ScoredAttempt } from './model'
import { lampNames, type Direction, type RoadScenario } from './scenarios'

type PanelProps = {
  attempt: ScoredAttempt
  operate: (operation: Operation) => void
  voice: boolean
  suspended: boolean
  stagePrompt: string
  course?: CourseAnswers
}

const lamps = [
  { lamp: 'off', icon: Lightbulb, theme: 'main' },
  { lamp: 'position', icon: ParkingCircle, theme: 'position' },
  { lamp: 'low', icon: LampDesk, theme: 'dipped' },
  { lamp: 'high', icon: Flashlight, theme: 'full' },
] as const

const flag = (label: string, active: boolean, yes: string, no: string, icon: StatusItem['icon'], purpose: StatusItem['purpose']): StatusItem =>
  ({ label, value: active ? yes : no, icon, purpose, active })

const observation = (label: string, active: boolean) => flag(label, active, '已记录', '未记录', Eye, 'observe')
const gearStatus = (gear: string): StatusItem => ({ label: '挡位', value: gear + ' 挡', icon: ListChecks, purpose: 'gear' })
const engineStatus = (running: boolean) => flag('发动机', running, '运行中', '已关闭', Power, 'power')
const doorStatus = (closed: boolean) => flag('车门', !closed, '开启', '关闭', closed ? DoorClosed : DoorOpen, 'access')
const beltStatus = (fastened: boolean) => flag('安全带', fastened, '已系好', '未系', ShieldCheck, 'access')
const footBrakeStatus = (pressed: boolean) => flag('脚刹', pressed, '已踩住', '已松开', Footprints, 'brake')
const parkingBrakeStatus = (engaged: boolean) => flag('驻车制动', engaged, '已拉紧', '已松开', ParkingCircle, 'brake')
const signalStatus = (direction: Direction | undefined): StatusItem => ({
  label: '转向灯', value: direction === 'left' ? '左灯开启' : direction === 'right' ? '右灯开启' : '关闭',
  icon: direction === 'left' ? ArrowLeft : direction === 'right' ? ArrowRight : Ban, purpose: 'signal', active: !!direction,
})

function SignalControls({ direction, operate }: { direction: Direction | undefined; operate: PanelProps['operate'] }) {
  return <div role="group" aria-label="转向灯" className="grid grid-cols-3 gap-2">
    <Control icon={ArrowLeft} purpose="signal" className="flex-col gap-1 px-1 py-1" selected={direction === 'left'} onClick={() => operate({ type: 'signal', direction: 'left' })}>左灯</Control>
    <Control icon={Ban} purpose="signal" className="flex-col gap-1 px-1 py-1" selected={!direction} onClick={() => operate({ type: 'signal', direction: null })}>关灯</Control>
    <Control icon={ArrowRight} purpose="signal" className="flex-col gap-1 px-1 py-1" selected={direction === 'right'} onClick={() => operate({ type: 'signal', direction: 'right' })}>右灯</Control>
  </div>
}

const gearIcons = { P: ParkingCircle, R: ArrowDown, N: Ban, D: ArrowUp }

function GearControls({ gear, operate, parking = false }: { gear: string; operate: PanelProps['operate']; parking?: boolean }) {
  return <div role="group" aria-label="选择挡位" className={parking ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-4 gap-2'}>
    {(parking ? ['P', 'N', 'D'] as const : ['P', 'R', 'N', 'D'] as const).map(option =>
      <Control key={option} icon={gearIcons[option]} purpose="gear" className="flex-col gap-1 px-1 py-1" selected={gear === option}
        onClick={() => operate({ type: 'gear', gear: option })}>{option} 挡</Control>)}
  </div>
}

function roadPrompt(scenario: RoadScenario, phase: 'approach' | 'return' | 'complete') {
  if (phase === 'complete') return '已驶过本项目，请确认完成。'
  if (scenario.kind === 'meeting') return '前方路段无中心隔离设施，对向有来车，请完成会车。'
  if (scenario.kind === 'overtake') return phase === 'return' ? '已超过前车，确认安全后驶回原车道。' : '前方有车辆，确认安全后超车。'
  const direction = roadDirection(scenario, phase) === 'left' ? '左' : '右'
  if (scenario.kind === 'lane') return `请向${direction}变更车道。`
  if (scenario.kind === 'turn') return `请在前方路口${direction}转。`
  if (scenario.kind === 'uturn') return '请在前方允许掉头处掉头。'
  if (scenario.kind === 'crosswalk') return '前方有人正在通过人行横道。'
  if (scenario.kind === 'school') return '前方进入学校区域，有学生正在横穿。'
  if (scenario.kind === 'straight') return '请保持直线行驶。'
  return scenario.kind === 'bus' ? '前方是公共汽车站，请安全通过。' : '请直行通过前方路口。'
}

export function ScoredControls({ attempt, operate, voice, suspended, stagePrompt, course }: PanelProps) {
  const { step } = attempt
  const scenario = step.id === 'road' ? attempt.roads[step.index] : undefined
  const light = step.id === 'lighting' ? attempt.lighting[step.index] : undefined
  const title = useRef<HTMLHeadingElement>(null)
  const turnKey = checkpointKey(step)
  let prompt = ''
  let controls: ReactNode
  let status: ReactNode
  const toggle = (field: Extract<Operation, { type: 'toggle' }>['field']) => () => operate({ type: 'toggle', field })
  const command = (type: 'board' | 'confirm-identity' | 'exit-before-walk' | 'begin-lighting' |
    'lighting-submit' | 'ignition' | 'depart' | 'begin-parking' | 'stop' | 'alight' | 'finish') => () => operate({ type })

  if (step.id === 'preparation') {
    const { phase, cabin } = step
    const position = step.path.at(-1) ?? walkOrder[0]
    const atDoor = position === walkOrder[0]
    const adjustSeatAndMirrors = <ActionGrid label="驾驶位置">
      <Control icon={Armchair} purpose="access" selected={cabin.seat} onClick={toggle('seat')}>检查调整座椅</Control>
      <Control icon={Eye} purpose="observe" selected={cabin.mirrors} onClick={toggle('mirrors')}>检查调整后视镜</Control>
    </ActionGrid>
    prompt = {
      arrival: '请先上车做身份核验。',
      identity: '你已首次上车，请确认身份。',
      verified: '身份核验已通过。请下车完成车外检查。',
      outside: '你已下车，车门仍开着。',
      walk: '请完成车外检查，再开门上车。',
      reboarded: '你已再次上车。请完成车内准备。',
    }[phase]
    if (phase === 'arrival') controls = <Control icon={DoorOpen} purpose="access" primary onClick={command('board')}>首次上车</Control>
    if (phase === 'identity' || phase === 'verified') controls = <>
      {adjustSeatAndMirrors}
      {phase === 'identity' ? <Control icon={ScanFace} purpose="access" primary onClick={command('confirm-identity')}>确认身份核验通过（模拟）</Control>
        : <Control icon={DoorOpen} purpose="access" primary onClick={command('exit-before-walk')}>下车</Control>}
    </>
    if (phase === 'outside') controls = <Control icon={DoorClosed} purpose="access" primary onClick={toggle('doorClosed')}>关好车门</Control>
    if (phase === 'identity' || phase === 'verified') status = <StatePanel title="车内准备" items={[
      flag('身份核验', phase === 'verified', '已确认', '待确认', ScanFace, 'access'),
      flag('座椅', cabin.seat, '已检查', '未检查', Armchair, 'access'),
      flag('后视镜', cabin.mirrors, '已检查', '未检查', Eye, 'observe'),
    ]} />
    if (phase === 'walk') {
      status = <StatePanel title="绕车状态" items={[
        { label: '当前位置', value: position, icon: MapPin, purpose: 'access' },
        observation('后方观察', step.observed),
        doorStatus(true),
      ]}><p className="break-words text-base"><span className="font-medium">检查记录</span> {step.path.join(' → ') || '暂无'}</p></StatePanel>
      controls = <>
        <p className="text-base text-muted-foreground">点击车身周围的按钮移动并检查。左前是驾驶门位置。</p>
        <div className="mx-auto grid w-full max-w-md grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-center" aria-label="车辆俯视示意">
          {([['左前', '右前'], ['左后', '右后']] as const).map(([left, right], index) => <div className="contents" key={left}>
            <Control icon={MapPin} purpose="observe" className="flex-col gap-1 px-1 py-1" selected={position === left} onClick={() => operate({ type: 'corner', corner: left })}>检查{left}</Control>
            {index === 0 && <div className="row-span-2 grid h-full min-h-28 w-16 place-content-center rounded-lg border bg-muted text-base">
              <CarFront aria-hidden className="mx-auto size-7" />车头
            </div>}
            <Control icon={MapPin} purpose="observe" className="flex-col gap-1 px-1 py-1" selected={position === right} onClick={() => operate({ type: 'corner', corner: right })}>检查{right}</Control>
          </div>)}
        </div>
        <ActionGrid label="上车准备">
          <Control icon={Footprints} purpose="access" disabled={atDoor} onClick={() => operate({ type: 'corner', corner: walkOrder[0] })}>回到左前车门</Control>
          <Control icon={Eye} purpose="observe" selected={step.observed} disabled={!atDoor} onClick={toggle('rear')}>观察后方交通</Control>
        </ActionGrid>
        <Control icon={DoorOpen} purpose="access" primary disabled={!atDoor} onClick={command('board')}>再次开门上车</Control>
      </>
    }
    if (phase === 'reboarded') {
      status = <StatePanel title="车辆状态" items={[
        doorStatus(cabin.doorClosed), beltStatus(cabin.belt), gearStatus(cabin.gear), engineStatus(cabin.running),
        flag('座椅 / 后视镜', cabin.seat && cabin.mirrors, '均已检查',
          cabin.seat ? '仅座椅已检查' : cabin.mirrors ? '仅后视镜已检查' : '均未检查', Armchair, 'access'),
        flag('仪表', cabin.instruments, '已检查', '未检查', Gauge, 'observe'),
      ]} />
      controls = <>
        <ActionGrid label="车内准备">
          <Control icon={cabin.doorClosed ? DoorOpen : DoorClosed} purpose="access" selected={cabin.doorClosed} onClick={toggle('doorClosed')}>{cabin.doorClosed ? '打开车门' : '关闭车门'}</Control>
          <Control icon={ShieldCheck} purpose="access" selected={cabin.belt} onClick={toggle('belt')}>{cabin.belt ? '解开安全带' : '系安全带'}</Control>
        </ActionGrid>
        {adjustSeatAndMirrors}
        {!cabin.running && <GearControls gear={cabin.gear} operate={operate} />}
        <ActionGrid label="发动机和仪表">
          <Control icon={Power} purpose="power" selected={cabin.running} disabled={cabin.running} onClick={command('ignition')}>{cabin.running ? '发动机已启动' : '启动发动机'}</Control>
          <Control icon={Gauge} purpose="observe" selected={cabin.instruments} disabled={!cabin.running} onClick={toggle('instruments')}>检查仪表</Control>
        </ActionGrid>
        <Control icon={Lightbulb} purpose="signal" primary disabled={!cabin.running} onClick={command('begin-lighting')}>进入灯光考试</Control>
      </>
    }
  } else if (step.id === 'lighting' && light) {
    prompt = light.prompt
    const lamp = lamps.find(item => item.lamp === step.lamp)!
    status = <StatePanel title="灯光状态" items={[
      { label: '当前灯光', value: lampNames[step.lamp], icon: lamp.icon, purpose: 'signal', accent: lamp.theme, active: step.lamp !== 'off' },
      flag('双闪', step.hazards, '开启', '关闭', TriangleAlert, 'brake'),
      { ...flag('近远光交替', step.flash, '已操作', '未操作', ArrowLeftRight, 'signal'), accent: 'flash' },
    ]} />
    controls = <>
      <ActionGrid label="模拟灯光">
        {lamps.map(({ lamp, icon, theme }) => <Control key={lamp} icon={icon} accent={theme}
          selected={step.lamp === lamp} onClick={() => operate({ type: 'lamp', lamp })}>
          {lamp === 'off' ? '关闭灯光' : lampNames[lamp]}
        </Control>)}
        <Control icon={ArrowLeftRight} accent="flash" selected={step.flash} onClick={toggle('flash')}>交替使用远近光</Control>
        <Control icon={TriangleAlert} purpose="brake" selected={step.hazards} onClick={toggle('hazards')}>危险报警闪光灯</Control>
      </ActionGrid>
      <Control icon={CircleCheck} purpose="signal" primary onClick={command('lighting-submit')}>确认灯光操作</Control>
    </>
  } else if (step.id === 'start') {
    prompt = { ready: '请完成起步并驶出。', 'brake-engaged': '车辆尚未正常驶出。', moving: '车辆已驶出，请确认起步完成。' }[step.phase]
    status = <StatePanel title="车辆状态" items={[
      { label: '行驶状态', value: { ready: '静止', 'brake-engaged': '尚未正常驶出', moving: '已驶出' }[step.phase], icon: CarFront, purpose: 'move' },
      gearStatus(step.gear), engineStatus(step.running), signalStatus(step.signal?.direction),
      footBrakeStatus(step.footBrake), parkingBrakeStatus(step.parkingBrake), doorStatus(step.doorClosed), beltStatus(step.belt),
      flag('仪表', step.instruments, '已检查', '未检查', Gauge, 'observe'),
      observation('后视镜观察', step.rear), observation('回头观察', step.shoulder),
    ]} />
    controls = step.phase === 'moving' ? <>
      <SignalControls direction={step.signal?.direction} operate={operate} />
      <Control icon={CircleCheck} purpose="move" primary onClick={command('finish')}>确认起步完成，进入实景路线</Control>
    </> : step.phase === 'brake-engaged' ? <ActionGrid label="起步操作">
      <Control icon={ParkingCircle} purpose="brake" onClick={toggle('parkingBrake')}>松开驻车制动</Control>
      <Control icon={ArrowUp} purpose="move" primary onClick={command('depart')}>继续驶出</Control>
    </ActionGrid> : <>
      <ActionGrid label="车内准备">
        <Control icon={step.doorClosed ? DoorOpen : DoorClosed} purpose="access" selected={step.doorClosed} onClick={toggle('doorClosed')}>{step.doorClosed ? '打开车门' : '关闭车门'}</Control>
        <Control icon={ShieldCheck} purpose="access" selected={step.belt} onClick={toggle('belt')}>{step.belt ? '解开安全带' : '系安全带'}</Control>
        <Control icon={Gauge} purpose="observe" selected={step.instruments} disabled={!step.running} onClick={toggle('instruments')}>检查仪表</Control>
      </ActionGrid>
      <SignalControls direction={step.signal?.direction} operate={operate} />
      <ActionGrid label="起步前观察">
        <Control icon={Eye} purpose="observe" selected={step.rear} onClick={toggle('rear')}>观察内、外后视镜</Control>
        <Control icon={Eye} purpose="observe" selected={step.shoulder} onClick={toggle('shoulder')}>回头观察左后方</Control>
      </ActionGrid>
      <GearControls gear={step.gear} operate={operate} />
      <ActionGrid label="制动">
        <Control icon={Footprints} purpose="brake" selected={step.footBrake} onClick={toggle('footBrake')}>{step.footBrake ? '松开脚刹' : '踩住脚刹'}</Control>
        <Control icon={ParkingCircle} purpose="brake" selected={step.parkingBrake} onClick={toggle('parkingBrake')}>{step.parkingBrake ? '松开驻车制动' : '拉紧驻车制动'}</Control>
      </ActionGrid>
      <Control icon={ArrowUp} purpose="move" primary disabled={!step.running || step.gear !== 'D' || !step.footBrake} onClick={command('depart')}>松脚刹起步</Control>
    </>
  } else if (step.id === 'road' && scenario && course) {
    prompt = roadPrompt(scenario, step.phase)
    const direction = roadDirection(scenario, step.phase)
    const observeRear = scenario.kind === 'lane' || scenario.kind === 'overtake' || scenario.kind === 'straight' || scenario.kind === 'uturn'
    const pedestrians = scenario.kind === 'crosswalk' || scenario.kind === 'school'
    const observeTraffic = pedestrians || scenario.kind === 'bus' || scenario.kind === 'turn' || scenario.kind === 'junction' || scenario.kind === 'uturn'
    const slow = observeTraffic || scenario.kind === 'meeting'
    const items: StatusItem[] = [
      { label: '行驶状态', value: step.phase === 'complete' ? '已通过' : step.phase === 'return' ? '已超越前车' : step.yielded ? '已停车等待' : '接近项目', icon: CarFront, purpose: 'move' },
    ]
    if (direction) items.push(signalStatus(step.signal?.direction))
    if (observeRear) items.push(observation('后视镜观察', step.rear))
    if (scenario.kind === 'lane' || scenario.kind === 'overtake') items.push(observation('回头观察', step.shoulder))
    if (observeTraffic) items.push(observation('交通观察', step.traffic))
    if (scenario.kind === 'school') items.push({
      label: '当前车速', value: (step.yielded ? 0 : step.slow ? 25 : 40) + ' 公里/小时', icon: Gauge, purpose: 'brake',
    })
    else if (slow) items.push(flag('减速', step.slow, '已执行', '未执行', ArrowDownToLine, 'brake'))
    if (pedestrians) items.push(flag('停车让行', step.yielded, '已停车', '未停车', CircleStop, 'brake'))
    if (scenario.kind === 'meeting') items.push(flag('靠右行驶', step.keepRight, '已靠右', '未靠右', ArrowRight, 'move'))
    status = <StatePanel title="道路操作状态" items={items} />
    controls = <>
      {direction && <SignalControls direction={step.signal?.direction} operate={operate} />}
      {step.phase !== 'complete' && <ActionGrid label="道路操作">
        {observeRear && <Control icon={Eye} purpose="observe" selected={step.rear} onClick={toggle('rear')}>观察内、外后视镜</Control>}
        {(scenario.kind === 'lane' || scenario.kind === 'overtake') &&
          <Control icon={Eye} purpose="observe" selected={step.shoulder} onClick={toggle('shoulder')}>回头观察{direction === 'left' ? '左' : '右'}后方</Control>}
        {observeTraffic && <Control icon={Eye} purpose="observe" selected={step.traffic} onClick={toggle('traffic')}>{scenario.kind === 'turn' ? '观察两侧和侧前方'
          : scenario.kind === 'uturn' ? '观察前方和两侧' : '观察两侧交通'}</Control>}
        {slow && <Control icon={ArrowDownToLine} purpose="brake" selected={step.slow} onClick={toggle('slow')}>减速</Control>}
        {pedestrians && <Control icon={CircleStop} purpose="brake" selected={step.yielded} onClick={toggle('yielded')}>停车等行人通过</Control>}
        {scenario.kind === 'meeting' && <Control icon={ArrowRight} purpose="move" selected={step.keepRight} onClick={toggle('keepRight')}>靠右行驶</Control>}
      </ActionGrid>}
      <Control icon={step.phase === 'complete' ? CircleCheck : ArrowUp} purpose="move" primary onClick={() => operate({ type: step.phase === 'complete' ? 'road-next' : 'road-submit', course })}>
        {step.phase === 'complete' ? '确认操作完成' : step.phase === 'return' ? '驶回原车道'
          : scenario.kind === 'overtake' ? '驶出超车' : '执行通行操作'}
      </Control>
    </>
  } else if (step.id === 'parking') {
    prompt = { approach: '请在前方靠边停车。', align: '调整车身位置，然后停车。', stopped: '车辆已停稳。请完成停车收尾。',
      exited: '你已下车。请确认本次考试结束。' }[step.phase]
    const parkingItems: StatusItem[] = [
      { label: '行驶状态', value: { approach: '驶向停车处', align: '调整位置', stopped: '已停稳', exited: '已下车' }[step.phase], icon: CarFront, purpose: 'move' },
      gearStatus(step.gear), signalStatus(step.signal?.direction), engineStatus(step.running),
      footBrakeStatus(step.footBrake), parkingBrakeStatus(step.parkingBrake), doorStatus(step.doorClosed),
    ]
    if (step.phase === 'approach') parkingItems.push(observation('后视镜观察', step.rear), observation('回头观察', step.shoulder))
    if (step.phase === 'stopped' || step.phase === 'exited') parkingItems.push(observation('下车前观察', step.exitObserved))
    status = <StatePanel title="停车状态" items={parkingItems} />
    const canAdjust = step.phase === 'align' || (step.phase === 'stopped' && step.gear === 'D' && !step.parkingBrake && step.running)
    controls = <>
      {step.phase !== 'exited' && <SignalControls direction={step.signal?.direction} operate={operate} />}
      {step.phase === 'approach' && <>
        <ActionGrid label="靠边前观察">
          <Control icon={Eye} purpose="observe" selected={step.rear} onClick={toggle('rear')}>观察内、外后视镜</Control>
          <Control icon={Eye} purpose="observe" selected={step.shoulder} onClick={toggle('shoulder')}>回头观察右后方</Control>
        </ActionGrid>
        <Control icon={ArrowUpRight} purpose="move" primary onClick={command('begin-parking')}>向右靠边</Control>
      </>}
      {(step.phase === 'align' || step.phase === 'stopped') && <>
        <div className="space-y-2 rounded-md border p-3">
          <p role="status" className="flex items-center gap-2 text-base font-semibold">
            <ArrowLeftRight aria-hidden className="size-5 shrink-0" />
            {step.distanceCm < 0 ? `车身越线 ${-step.distanceCm} 厘米` : `车身距边缘线 ${step.distanceCm} 厘米`}
          </p>
          <div aria-hidden className="relative h-10 overflow-hidden rounded-sm bg-muted">
            <div className="absolute inset-y-0 right-[23%] border-r-2 border-foreground" />
            <div className="absolute top-1 h-8 w-[22%] rounded-md border-2 border-foreground bg-background"
              style={{ right: `${23 + step.distanceCm * 0.65}%` }} />
          </div>
          {canAdjust && <ActionGrid label="调整停车位置">
            <Control icon={ArrowLeft} purpose="move" disabled={step.distanceCm >= 70} onClick={() => operate({ type: 'adjust', delta: 10 })}>{step.phase === 'stopped' ? '再次挪车，远离边缘线' : '远离边缘线'}</Control>
            <Control icon={ArrowRight} purpose="move" disabled={step.distanceCm <= -10} onClick={() => operate({ type: 'adjust', delta: -10 })}>{step.phase === 'stopped' ? '再次挪车，靠近边缘线' : '靠近边缘线'}</Control>
          </ActionGrid>}
        </div>
        {step.phase === 'align' ? <Control icon={CircleStop} purpose="brake" primary onClick={command('stop')}>踩脚刹停车</Control> : <>
          <GearControls gear={step.gear} operate={operate} parking />
          <ActionGrid label="驻车与下车准备">
            <Control icon={ParkingCircle} purpose="brake" selected={step.parkingBrake} onClick={toggle('parkingBrake')}>{step.parkingBrake ? '松开驻车制动' : '拉紧驻车制动'}</Control>
            <Control icon={Footprints} purpose="brake" selected={step.footBrake} onClick={toggle('footBrake')}>{step.footBrake ? '松开脚刹' : '踩住脚刹'}</Control>
            <Control icon={Power} purpose="power" selected={!step.running} disabled={!step.running} onClick={command('ignition')}>{step.running ? '熄火' : '发动机已熄火'}</Control>
            <Control icon={Eye} purpose="observe" selected={step.exitObserved} onClick={toggle('exitObserved')}>回头观察左后方</Control>
          </ActionGrid>
          <Control icon={DoorOpen} purpose="access" primary disabled={step.gear !== 'N' && step.gear !== 'P'} onClick={command('alight')}>打开车门下车</Control>
        </>}
      </>}
      {step.phase === 'exited' && <ActionGrid label="下车后操作">
        <Control icon={step.doorClosed ? DoorOpen : DoorClosed} purpose="access" selected={step.doorClosed} onClick={toggle('doorClosed')}>{step.doorClosed ? '打开车门' : '关闭车门'}</Control>
        <Control icon={CircleCheck} purpose="move" primary onClick={command('finish')}>结束本次考试</Control>
      </ActionGrid>}
    </>
  }

  const firstPrompt = (step.id === 'preparation' && step.phase === 'arrival') || (step.id === 'lighting' && step.index === 0) ||
    (step.id === 'start' && step.phase === 'ready') || (step.id === 'parking' && step.phase === 'approach')
  const speech = usePromptSpeech(prompt ? (firstPrompt ? stagePrompt : '') + prompt : undefined, voice, suspended)
  useEffect(() => { title.current?.focus({ preventScroll: true }) }, [turnKey])

  return <Card className="min-w-0">
    <CardContent className="@container space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 ref={title} tabIndex={-1} className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-ring">
          {scenario ? scenario.title : light && step.id === 'lighting' ? `第 ${step.index + 1} / ${attempt.lighting.length} 题` : prompt}
        </h3>
        <Button variant="outline" disabled={!voice || suspended} onClick={speech.replay}><Volume2 aria-hidden />重听提示</Button>
      </div>
      {(scenario || light) && <p>{prompt}</p>}
      {speech.failed && <p role="status" className="text-base text-muted-foreground">语音暂时无法播放，请看文字提示。</p>}
      <div className={status ? 'grid items-start gap-4 @min-[680px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]' : ''}>
        {status}
        <fieldset disabled={suspended} className="min-w-0 space-y-4">{controls}</fieldset>
      </div>
    </CardContent>
  </Card>
}
