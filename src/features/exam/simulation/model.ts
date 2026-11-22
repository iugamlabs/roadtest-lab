import type { CourseAnswers } from '@/features/memory/course/course'
import { examRule, generalDeduction, generalFail, projectRule, subject3Rules } from './rules'
import { lampNames, type Direction, type Lamp, type LightingScenario, type RoadScenario, type SimulationStage } from './scenarios'

type Signal = { direction: Direction; sinceMs: number } | null
type Gear = 'P' | 'N' | 'D' | 'R'
export const walkOrder = ['左前', '左后', '右后', '右前', '左前'] as const
type Corner = typeof walkOrder[number]
type Cabin = { doorClosed: boolean; belt: boolean; seat: boolean; mirrors: boolean; instruments: boolean; running: boolean; gear: Gear }
type Preparation = {
  id: 'preparation'; phase: 'arrival' | 'identity' | 'verified' | 'outside' | 'walk' | 'reboarded'
  cabin: Cabin; path: Corner[]; observed: boolean
}
type Lighting = { id: 'lighting'; index: number; lamp: Lamp; flash: boolean; hazards: boolean; cabin: Cabin }
type Start = Cabin & {
  id: 'start'; footBrake: boolean; parkingBrake: boolean; signal: Signal; rear: boolean; shoulder: boolean
  phase: 'ready' | 'brake-engaged' | 'moving'
}
type Road = {
  id: 'road'; index: number; phase: 'approach' | 'return' | 'complete'
  signal: Signal; rear: boolean; shoulder: boolean; traffic: boolean; slow: boolean; keepRight: boolean; yielded: boolean
}
type Parking = {
  id: 'parking'; phase: 'approach' | 'align' | 'stopped' | 'exited'; signal: Signal
  distanceCm: number; rear: boolean; shoulder: boolean; exitObserved: boolean; doorClosed: boolean
  parkingBrake: boolean; footBrake: boolean; running: boolean; gear: Gear; stopNumber: number
}
type Step = Preparation | Lighting | Start | Road | Parking | { id: 'result' }

export type Evidence = {
  clause: string; relatedClauses?: string[]; evidence: string; violated: boolean; stage: Exclude<Step['id'], 'result'>
  occurrence: string
  context?: string
}
type Check = Pick<Evidence, 'clause' | 'relatedClauses' | 'evidence' | 'violated'>
type Assessment = 'completed' | 'below-threshold' | 'direct-fail'

export type ScoredAttempt = {
  step: Step
  score: number
  outcome: Assessment | null
  evidence: Evidence[]
  completed: Exclude<Step['id'], 'result'>[]
  lighting: LightingScenario[]
  lightAnswers: { scenario: LightingScenario; status: string; checks: Check[] }[]
  roads: RoadScenario[]
  course?: CourseAnswers
}

const newRoad = (index: number): Road => ({
  id: 'road', index, phase: 'approach', signal: null, rear: false, shoulder: false, traffic: false, slow: false, keepRight: false, yielded: false,
})

export function newScoredAttempt(lighting: LightingScenario[], roads: RoadScenario[]): ScoredAttempt {
  return { step: { id: 'preparation', phase: 'arrival', cabin: openCabin(), path: [], observed: false }, score: subject3Rules.initialScore,
    outcome: null, evidence: [], completed: [], lighting, lightAnswers: [], roads }
}

type Toggle = 'rear' | 'shoulder' | 'traffic' | 'slow' | 'keepRight' | 'seat' | 'mirrors' | 'instruments'
  | 'belt' | 'doorClosed' | 'footBrake' | 'parkingBrake' | 'flash' | 'hazards' | 'exitObserved' | 'yielded'
export type Operation =
  | { type: 'corner'; corner: Corner }
  | { type: 'board' | 'lighting-submit' | 'ignition' | 'depart' | 'begin-parking' | 'stop' | 'alight' | 'finish' }
  | { type: 'confirm-identity' | 'exit-before-walk' | 'begin-lighting' }
  | { type: 'toggle'; field: Toggle }
  | { type: 'lamp'; lamp: Lamp }
  | { type: 'signal'; direction: Direction | null }
  | { type: 'gear'; gear: Gear }
  | { type: 'road-submit' | 'road-next' | 'road-finish'; course: CourseAnswers }
  | { type: 'adjust'; delta: -10 | 10 }

export function checkpointKey(step: Step): string {
  if (step.id === 'preparation') return `preparation:${step.phase}`
  if (step.id === 'start') return `start:${step.phase}`
  if (step.id === 'lighting') return `lighting:${step.index}`
  if (step.id === 'road') return `road:${step.index}:${step.phase}`
  if (step.id === 'parking') return `parking:${step.phase}:${step.stopNumber}`
  return step.id
}

export type AttemptAction = { type: 'begin'; attempt: ScoredAttempt } |
  { type: 'clear' } |
  { type: 'operate'; checkpoint: string; operation: Operation; activeMs: number }

function check(clause: string, violated: boolean, evidence: string, relatedClauses?: string[]): Check {
  return { clause, violated, evidence, relatedClauses }
}

function assess(attempt: ScoredAttempt, occurrence: string, checks: Check[]): ScoredAttempt {
  if (attempt.step.id === 'result') return attempt
  const stage = attempt.step.id
  const context = attempt.step.id === 'road' ? attempt.roads[attempt.step.index]?.title : undefined
  const fresh = checks.filter(entry => !attempt.evidence.some(previous =>
    previous.occurrence === occurrence && previous.clause === entry.clause))
  let score = attempt.score
  let directFail = false
  for (const entry of fresh) {
    if (!entry.violated) continue
    const penalty = examRule(entry.clause).penalty
    if (penalty === 'fail') directFail = true
    else score -= penalty
  }
  const outcome = directFail ? 'direct-fail' : score < subject3Rules.passScore ? 'below-threshold' : null
  return { ...attempt, score, outcome, evidence: [...attempt.evidence, ...fresh.map(entry => ({ ...entry, occurrence, stage, context }))],
    step: outcome ? { id: 'result' } : attempt.step }
}

function advance(attempt: ScoredAttempt, step: Step, completeStage = false): ScoredAttempt {
  if (attempt.step.id === 'result') return attempt
  return { ...attempt, step, completed: completeStage ? [...attempt.completed, attempt.step.id] : attempt.completed,
    outcome: step.id === 'result' ? 'completed' : null }
}

function openLighting(index: number, scenario: LightingScenario, cabin: Cabin): Lighting {
  return { id: 'lighting', index, lamp: scenario.initial, flash: false, hazards: false, cabin }
}

const openCabin = (): Cabin => ({
  doorClosed: false, belt: false, seat: false, mirrors: false, instruments: false, running: false, gear: 'P',
})
const openStart = (cabin: Cabin): Start => ({
  ...cabin, id: 'start', footBrake: false, parkingBrake: true, signal: null, rear: false, shoulder: false, phase: 'ready',
})

const openParking = (): Parking => ({
  id: 'parking', phase: 'approach', distanceCm: 60, signal: null, rear: false, shoulder: false, exitObserved: false,
  doorClosed: true, parkingBrake: false, footBrake: false, running: true, gear: 'D', stopNumber: 0,
})

export function debugAttempt(attempt: ScoredAttempt, stage: SimulationStage | 'result'): ScoredAttempt {
  const cabin: Cabin = { ...openCabin(), doorClosed: true, belt: true, seat: true, mirrors: true, running: true }
  switch (stage) {
    case 'preparation': return attempt
    case 'lighting': return { ...attempt, step: openLighting(0, attempt.lighting[0], cabin) }
    case 'start': return { ...attempt, step: openStart(cabin) }
    case 'road': return { ...attempt, step: newRoad(0) }
    case 'parking': return { ...attempt, step: openParking() }
    case 'result': {
      if (attempt.step.id !== 'preparation') return attempt
      const seated: Preparation = { ...attempt.step, phase: 'reboarded' }
      const sample = runPreparation({ ...attempt, step: seated }, seated, { type: 'ignition' })
      return { ...sample, step: { id: 'result' }, outcome: 'completed' }
    }
  }
}

function lightStatus(step: Pick<Lighting, 'lamp' | 'flash' | 'hazards'>) {
  return `确认时灯光为「${lampNames[step.lamp]}」，${step.flash ? '已' : '未'}交替闪灯，双闪${step.hazards ? '已开' : '未开'}。`
}

function lightingChecks(scenario: LightingScenario, step: Pick<Lighting, 'lamp' | 'flash' | 'hazards'>): Check[] {
  const status = lightStatus(step)
  const item = (id: string, violated: boolean) => check(projectRule(12, id), violated, `${scenario.prompt}。${status}`)
  const needsHeadlamps = (specific: Check) => [
    specific,
    check(generalFail + 'd', step.lamp === 'off' || step.lamp === 'position', `${scenario.prompt}。行驶时${status}`),
  ]
  switch (scenario.id) {
    case 'headlamps': return [item('a', step.lamp !== 'low' && step.lamp !== 'high')]
    case 'lit': return needsHeadlamps(item('g', step.lamp === 'high'))
    case 'meeting': return [item('d', step.lamp !== 'low')]
    case 'following': return needsHeadlamps(item('b', step.lamp === 'high'))
    case 'junction': return needsHeadlamps(item('e', step.lamp === 'high'))
    case 'curve':
    case 'slope':
    case 'bridge':
    case 'crossing': return [item('c', !step.flash)]
    case 'passing': return [item('f', !step.flash)]
    case 'dark': return [item('i', step.lamp !== 'high')]
    case 'parked':
      // Only conclude on the two unambiguous combinations of the paired clause.
      if (step.lamp === 'position') return [item('h', false)]
      if (step.lamp === 'low' || step.lamp === 'high') return [item('h', true)]
      return []
  }
}

function signalChecks(signal: Signal, direction: Direction, activeMs: number, aliases?: string[]): Check[] {
  const proper = signal?.direction === direction
  const expected = direction === 'left' ? '左' : '右'
  const status = signal ? `${signal.direction === 'left' ? '左' : '右'}灯` : '未开转向灯'
  const result = [check(generalFail + 'v', !proper, `操作时应开${expected}灯，当时为${status}。`, aliases)]
  if (proper) {
    const duration = Math.floor(activeMs - signal.sinceMs)
    result.push(check(generalFail + 'w', duration < 3000, `操作时${expected}灯已连续开启 ${(duration / 1000).toFixed(3)} 秒。`))
  }
  return result
}

function updateSignal(step: Start | Road | Parking, direction: Direction | null, activeMs: number) {
  if (step.signal?.direction === direction || (!step.signal && !direction)) return step
  return { ...step, signal: direction ? { direction, sinceMs: activeMs } : null }
}

function observations(rear: boolean, shoulder: boolean) {
  return `${rear ? '已' : '未'}观察内、外后视镜，${shoulder ? '已' : '未'}回头观察。`
}

function signalOff(signal: Signal) {
  return check(generalDeduction + 'l', Boolean(signal), signal ? '操作完成时转向灯仍开启。' : '操作完成时转向灯已关闭。')
}

export function parkingDistanceChecks(distanceCm: number): Check[] {
  const evidence = distanceCm < 0 ? `停车后车身越过模拟边缘线 ${-distanceCm} 厘米。` : `停车后车身离模拟边缘线 ${distanceCm} 厘米。`
  return [check(projectRule(11, 'c'), distanceCm < 0, evidence), check(projectRule(11, 'f'), distanceCm > 50, evidence),
    check(projectRule(11, 'g'), distanceCm > 30 && distanceCm <= 50, evidence)]
}

function runPreparation(attempt: ScoredAttempt, step: Preparation, operation: Operation) {
  const { phase, cabin } = step
  const position = step.path.at(-1) ?? walkOrder[0]
  switch (operation.type) {
    case 'corner': {
      if (phase !== 'walk' || step.path.at(-1) === operation.corner) return attempt
      return advance(attempt, { ...step, observed: step.observed && position === operation.corner, path: [...step.path, operation.corner] })
    }
    case 'confirm-identity': return phase === 'identity' ? advance(attempt, { ...step, phase: 'verified' }) : attempt
    case 'exit-before-walk': return phase === 'verified' ? advance(attempt, { ...step, phase: 'outside' }) : attempt
    case 'toggle': {
      const { field } = operation
      if (phase === 'outside' && field === 'doorClosed') return advance(attempt, { ...step, phase: 'walk' })
      if (phase === 'walk' && field === 'rear' && position === walkOrder[0]) return advance(attempt, { ...step, observed: true })
      if (phase === 'identity' || phase === 'verified' || phase === 'reboarded') {
        if (field === 'seat' || field === 'mirrors' || (field === 'instruments' && cabin.running)) {
          return advance(attempt, { ...step, cabin: { ...cabin, [field]: true } })
        }
        if (phase === 'reboarded' && (field === 'belt' || field === 'doorClosed')) {
          return advance(attempt, { ...step, cabin: { ...cabin, [field]: !cabin[field] } })
        }
      }
      return attempt
    }
    case 'board': {
      if (phase === 'arrival') return advance(attempt, { ...step, phase: 'identity' })
      if (phase !== 'walk' || position !== walkOrder[0]) return attempt
      const movement = [walkOrder[0], ...step.path]
      const completeLap = movement.some((_, start) => walkOrder.every((corner, offset) => movement[start + offset] === corner))
      const path = step.path.length ? `记录的检查点为${step.path.join(' → ')}。` : '本轮未记录到检查点。'
      return advance(assess(attempt, 'reboard', [
        check(projectRule(1, 'a'), !completeLap, completeLap ? '再次开门前已完成逆时针绕车检查。' : `再次开门前未完成逆时针绕车检查。${path}`),
        check(projectRule(1, 'b'), !step.observed, `再次开门前${step.observed ? '已' : '未'}观察后方交通。`),
      ]), { ...step, phase: 'reboarded' })
    }
    case 'gear': return phase === 'reboarded' && !cabin.running ? advance(attempt, { ...step, cabin: { ...cabin, gear: operation.gear } }) : attempt
    case 'ignition': {
      if (phase !== 'reboarded' || cabin.running) return attempt
      const assessed = assess(attempt, 'ignition', [
        check(generalFail + 'e', cabin.gear !== 'P' && cabin.gear !== 'N', `启动发动机时挡位为 ${cabin.gear}。`, [projectRule(2, 'c')]),
        check(projectRule(2, 'l'), !cabin.seat || !cabin.mirrors, `启动前${cabin.seat ? '已' : '未'}检查调整座椅，${cabin.mirrors ? '已' : '未'}检查调整后视镜。`),
      ])
      return advance(assessed, { ...step, cabin: { ...cabin, running: true } })
    }
    case 'begin-lighting': return phase === 'reboarded' && cabin.running
      ? advance(attempt, openLighting(0, attempt.lighting[0], cabin), true) : attempt
    default: return attempt
  }
}

function runLighting(attempt: ScoredAttempt, step: Lighting, operation: Operation) {
  if (operation.type === 'lamp') return { ...attempt, step: { ...step, lamp: operation.lamp } }
  if (operation.type === 'toggle' && operation.field === 'flash') return { ...attempt, step: { ...step, flash: true } }
  if (operation.type === 'toggle' && operation.field === 'hazards') return { ...attempt, step: { ...step, hazards: !step.hazards } }
  if (operation.type !== 'lighting-submit') return attempt
  const scenario = attempt.lighting[step.index]
  const next = attempt.lighting[step.index + 1]
  const checks = lightingChecks(scenario, step)
  const answered = { ...attempt, lightAnswers: [...attempt.lightAnswers,
    { scenario, status: lightStatus(step), checks }] }
  const assessed = assess(answered, `light:${scenario.id}`, checks)
  return next ? advance(assessed, openLighting(step.index + 1, next, step.cabin)) : advance(assessed, openStart(step.cabin), true)
}

function runStart(attempt: ScoredAttempt, step: Start, operation: Operation, activeMs: number) {
  if (step.phase === 'moving') {
    if (operation.type === 'signal') return { ...attempt, step: updateSignal(step, operation.direction, activeMs) }
    if (operation.type === 'finish') {
      return advance(assess(attempt, 'departure:complete', [signalOff(step.signal)]), newRoad(0), true)
    }
    return attempt
  }
  const moving: Start = { ...step, phase: 'moving', footBrake: false, parkingBrake: false }
  if (step.phase === 'brake-engaged') {
    if (operation.type === 'toggle' && operation.field === 'parkingBrake') {
      return advance(assess(attempt, 'departure-brake', [
        check(projectRule(2, 'f'), true, '带驻车制动开始起步，随后在继续驶出前松开驻车制动。'),
      ]), moving)
    }
    if (operation.type === 'depart') {
      return assess(attempt, 'departure-brake', [check(projectRule(2, 'e'), true, '带驻车制动起步后未松开，继续驶出。')])
    }
    return attempt
  }
  switch (operation.type) {
    case 'toggle': {
      const { field } = operation
      if (field === 'instruments' && !step.running) return attempt
      if (field === 'instruments' || field === 'rear' || field === 'shoulder') {
        return { ...attempt, step: { ...step, [field]: true } }
      }
      if (field === 'belt' || field === 'doorClosed' || field === 'footBrake' || field === 'parkingBrake') {
        return { ...attempt, step: { ...step, [field]: !step[field] } }
      }
      return attempt
    }
    case 'gear': return { ...attempt, step: { ...step, gear: operation.gear } }
    case 'signal': return { ...attempt, step: updateSignal(step, operation.direction, activeMs) }
    case 'depart':
      if (!step.running || step.gear !== 'D' || !step.footBrake) return attempt
      const assessed = assess(attempt, 'departure', [
        check(generalFail + 'a', !step.belt, `起步时${step.belt ? '已' : '未'}系安全带。`),
        check(projectRule(2, 'a'), !step.doorClosed, `起步时车门${step.doorClosed ? '已' : '未'}完全关闭。`),
        check(projectRule(2, 'b'), !step.rear || !step.shoulder, observations(step.rear, step.shoulder)),
        check(projectRule(2, 'm'), !step.instruments, `起步前${step.instruments ? '已' : '未'}检查仪表。`),
        ...signalChecks(step.signal, 'left', activeMs),
        ...(!step.parkingBrake ? [check(projectRule(2, 'e'), false, '起步前已松开驻车制动。'),
          check(projectRule(2, 'f'), false, '起步前已松开驻车制动。')] : []),
      ])
      return step.parkingBrake ? advance(assessed, { ...step, phase: 'brake-engaged', footBrake: false }) : advance(assessed, moving)
    default: return attempt
  }
}

export function roadDirection(scenario: RoadScenario, phase: Road['phase']) {
  if (scenario.kind === 'turn' || scenario.kind === 'lane') return scenario.direction
  if (scenario.kind === 'uturn') return 'left'
  if (scenario.kind === 'overtake') return phase === 'return' ? 'right' : 'left'
  return null
}

function runRoad(attempt: ScoredAttempt, step: Road, operation: Operation, activeMs: number) {
  const scenario = attempt.roads[step.index]
  const occurrence = scenario?.eventId ?? scenario?.kind ?? 'road-end'
  if (operation.type === 'signal') return { ...attempt, step: updateSignal(step, operation.direction, activeMs) }
  if (operation.type === 'toggle') {
    const { field } = operation
    if (field === 'rear' || field === 'shoulder' || field === 'traffic' || field === 'slow' || field === 'keepRight' || field === 'yielded') {
      return { ...attempt, step: { ...step, [field]: true } }
    }
  }

  if (operation.type === 'road-next' && step.phase === 'complete') {
    return advance(assess({ ...attempt, course: operation.course }, `${occurrence}:complete`, [signalOff(step.signal)]), newRoad(step.index + 1))
  }
  if (operation.type === 'road-finish' && !scenario && step.phase === 'approach') {
    return advance({ ...attempt, course: operation.course }, openParking(), true)
  }
  if (operation.type !== 'road-submit' || !scenario || step.phase === 'complete') return attempt

  const direction = roadDirection(scenario, step.phase)
  const checks = direction ? signalChecks(step.signal, direction, activeMs, scenario.kind === 'uturn' ? [projectRule(10, 'c')] : undefined) : []
  const rear = observations(step.rear, step.shoulder)
  const add = (project: number, item: string, violated: boolean, evidence: string) => checks.push(check(projectRule(project, item), violated, evidence))
  if (scenario.kind === 'lane') add(5, 'a', !step.rear || !step.shoulder, rear)
  if (scenario.kind === 'overtake') add(9, step.phase === 'return' ? 'e' : 'a', !step.rear || !step.shoulder, rear)
  if (scenario.kind === 'turn' || scenario.kind === 'junction' || scenario.kind === 'bus') {
    const project = scenario.kind === 'bus' ? 7 : 6
    add(project, 'a', !step.slow, `通过前${step.slow ? '已' : '未'}减速。`)
    add(project, scenario.kind === 'bus' ? 'b' : 'c', !step.traffic, `通过前${step.traffic ? '已' : '未'}观察路侧交通。`)
  }
  if (scenario.kind === 'straight') add(3, 'c', !step.rear, `直线行驶阶段${step.rear ? '已' : '未'}观察内、外后视镜。`)
  if (scenario.kind === 'uturn') add(10, 'a', !step.rear || !step.traffic, `掉头前${step.rear ? '已' : '未'}观察后视镜，${step.traffic ? '已' : '未'}观察前方和两侧交通。`)
  if (scenario.kind === 'meeting') add(8, 'a', !step.slow || !step.keepRight, `无中心隔离设施的模拟会车场景，${step.slow ? '已' : '未'}减速，${step.keepRight ? '已' : '未'}靠右。`)
  if (scenario.kind === 'crosswalk' || scenario.kind === 'school') {
    add(7, 'a', !step.slow && !step.yielded, scenario.kind === 'school'
      ? `进入学校区域时模拟车速为 ${step.yielded ? 0 : step.slow ? 25 : 40} 公里/小时。`
      : `进入人行横道前${step.slow || step.yielded ? '已' : '未'}减速。`)
    add(7, 'b', !step.traffic, `通过前${step.traffic ? '已' : '未'}观察左右交通。`)
    add(7, 'c', !step.yielded, `有行人正在横穿，${step.yielded ? '已' : '未'}停车让行。`)
  }
  const returning = scenario.kind === 'overtake' && step.phase === 'approach'
  const next = returning ? { ...newRoad(step.index), phase: 'return' as const, signal: step.signal } : { ...step, phase: 'complete' as const }
  const assessed = assess({ ...attempt, course: operation.course }, `${occurrence}:${step.phase}`, checks)
  return advance(assessed, direction ? next : newRoad(step.index + 1))
}

function runParking(attempt: ScoredAttempt, step: Parking, operation: Operation, activeMs: number) {
  switch (operation.type) {
    case 'signal': return { ...attempt, step: updateSignal(step, operation.direction, activeMs) }
    case 'gear': return step.phase === 'stopped' ? { ...attempt, step: { ...step, gear: operation.gear } } : attempt
    case 'toggle': {
      const { field } = operation
      if ((step.phase === 'approach' && (field === 'rear' || field === 'shoulder')) ||
        (step.phase === 'stopped' && field === 'exitObserved')) return { ...attempt, step: { ...step, [field]: true } }
      if (step.phase === 'exited' && field === 'doorClosed') return { ...attempt, step: { ...step, doorClosed: !step.doorClosed } }
      if (step.phase !== 'stopped' || (field !== 'footBrake' && field !== 'parkingBrake')) return attempt
      const assessed = field === 'footBrake' && step.footBrake && !step.parkingBrake
        ? assess(attempt, `parking-brake-order:${step.stopNumber}`, [check(projectRule(11, 'i'), true, '拉紧驻车制动前已松开脚刹。')])
        : attempt
      return advance(assessed, { ...step, [field]: !step[field] })
    }
    case 'begin-parking':
      if (step.phase !== 'approach') return attempt
      return advance(assess(attempt, 'parking-approach', [
        ...signalChecks(step.signal, 'right', activeMs),
        check(projectRule(11, 'a'), !step.rear || !step.shoulder, observations(step.rear, step.shoulder)),
      ]), { ...step, phase: 'align' })
    case 'adjust': {
      const distanceCm = step.distanceCm + operation.delta
      if (distanceCm < -10 || distanceCm > 70) return attempt
      if (step.phase === 'align') return { ...attempt, step: { ...step, distanceCm } }
      if (step.phase !== 'stopped' || !step.running || step.gear !== 'D' || step.parkingBrake) return attempt
      return advance(assess(attempt, `parking-move:${step.stopNumber}`, [
        check(projectRule(11, 'j'), true, '模拟路边前后无干扰，已停车后再次挪车。'),
      ]), { ...step, phase: 'align', distanceCm, footBrake: false, exitObserved: false })
    }
    case 'stop':
      if (step.phase !== 'align') return attempt
      return advance(assess(attempt, `stop:${step.stopNumber}`, parkingDistanceChecks(step.distanceCm)),
        { ...step, phase: 'stopped', footBrake: true, stopNumber: step.stopNumber + 1 })
    case 'ignition': return step.phase === 'stopped' ? { ...attempt, step: { ...step, running: false } } : attempt
    case 'alight':
      if (step.phase !== 'stopped' || (step.gear !== 'P' && step.gear !== 'N')) return attempt
      return advance(assess(assess(attempt, `parking-brake-order:${step.stopNumber}`, [
        check(projectRule(11, 'i'), false, '本次停车未记录到驻车制动拉紧前松开脚刹。'),
      ]), 'alight', [
        check(projectRule(11, 'd'), !step.exitObserved, `开门前${step.exitObserved ? '已' : '未'}回头观察左后方交通。`),
        check(projectRule(11, 'h'), !step.parkingBrake, `下车时驻车制动${step.parkingBrake ? '已拉紧' : '未拉紧'}。`),
        check(projectRule(11, 'k'), step.running, `打开车门下车时发动机${step.running ? '仍在运行' : '已熄火'}。`),
        signalOff(step.signal),
      ]), { ...step, phase: 'exited', doorClosed: false })
    case 'finish':
      if (step.phase !== 'exited') return attempt
      return advance(assess(attempt, 'finish', [
        check(projectRule(11, 'e'), !step.doorClosed, `结束时${step.doorClosed ? '已' : '未'}关好车门。`),
      ]), { id: 'result' }, true)
    default: return attempt
  }
}

export function scoredAttemptReducer(attempt: ScoredAttempt | null, action: AttemptAction): ScoredAttempt | null {
  if (action.type === 'begin') return action.attempt
  if (action.type === 'clear') return null
  if (!attempt || attempt.outcome || action.checkpoint !== checkpointKey(attempt.step)) return attempt
  const { step } = attempt
  const { operation, activeMs } = action
  if (step.id === 'preparation') return runPreparation(attempt, step, operation)
  if (step.id === 'lighting') return runLighting(attempt, step, operation)
  if (step.id === 'start') return runStart(attempt, step, operation, activeMs)
  if (step.id === 'road') return runRoad(attempt, step, operation, activeMs)
  if (step.id === 'parking') return runParking(attempt, step, operation, activeMs)
  return attempt
}
