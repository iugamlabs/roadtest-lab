import { isPracticeReady, type CalibratedEvent } from '../content/schema'
import { pauseTimeMs, practiceEventSchema, type PracticeEvent } from './practice-events'

export type Operation = 'signal-left' | 'signal-right' | 'signal-off' | 'observe-left' | 'observe-right' | 'observe-front' | 'brake' | 'stop' | 'execute' | 'gear-p' | 'handbrake-on'
export type Suspension = 'user' | 'buffering' | 'hidden' | 'map' | 'media-error'
export interface Step {
  id: string
  label: string
  operation: Operation | 'wait'
  effect?: 'move' | 'stop' | 'pass' | 'return'
}
export interface Vehicle {
  indicator: 'left' | 'right' | 'off'
  signalSinceMs: number | null
  brake: boolean
  observed: ('left' | 'right' | 'front')[]
  motion: 'moving' | 'stopped'
  gear: 'D' | 'P'
  handbrake: boolean
  lane: 'original' | 'passing'
}
export interface Attempt {
  eventId: string
  outcome: 'completed' | 'abandoned'
  elapsedMs: number
  corrections: number
}
export interface TrainingState {
  enabled: boolean
  phase: 'road' | 'practice' | 'review' | 'finished'
  events: PracticeEvent[]
  scope: string | null
  positionMs: number
  activeId: string | null
  stepIndex: number
  elapsedMs: number
  lastNowMs: number
  signalWaitMs: number
  suspensions: Suspension[]
  seeking: boolean
  vehicle: Vehicle
  progress: Record<string, 'completed' | 'skipped'>
  attempts: Attempt[]
  corrections: number
  feedback: string
}
export type TrainingAction =
  | { type: 'start'; positionMs: number; now: number }
  | { type: 'stop'; now: number }
  | { type: 'position'; positionMs: number; now: number }
  | { type: 'seek'; positionMs: number; now: number }
  | { type: 'seeked'; positionMs: number; now: number }
  | { type: 'transport'; seeking: boolean; now: number }
  | { type: 'retry'; eventId: string; preview: boolean; single?: boolean; now: number }
  | { type: 'continue'; now: number }
  | { type: 'operate'; operation: Operation; now: number }
  | { type: 'suspend'; reason: Suspension; value: boolean; now: number }
  | { type: 'tick'; now: number }
  | { type: 'ended'; now: number }
  | { type: 'notice'; message: string; now: number }

// A teaching policy, independent of unverified examination rules and video speed.
export const DEFAULT_SIGNAL_WAIT_MS = 3000
const freshVehicle = (): Vehicle => ({ indicator: 'off', signalSinceMs: null, brake: false, observed: [], motion: 'moving', gear: 'D', handbrake: false, lane: 'original' })

export function stepsFor(event: CalibratedEvent): Step[] {
  const step = (id: string, label: string, operation: Step['operation'], effect?: Step['effect']): Step => ({ id, label, operation, effect })
  const signal = (direction: 'left' | 'right', prefix: string, executeLabel: string, brake = false, effect?: Step['effect']): Step[] => [
    step(`${prefix}-signal`, `打开${direction === 'left' ? '左' : '右'}转向灯`, `signal-${direction}`),
    step(`${prefix}-observe`, `观察${direction === 'left' ? '左' : '右'}后方`, `observe-${direction}`),
    ...(brake ? [step(`${prefix}-brake`, '踩刹车减速', 'brake')] : []),
    step(`${prefix}-wait`, '保持转向灯，等待练习计时完成', 'wait'),
    step(`${prefix}-execute`, executeLabel, 'execute', effect),
    step(`${prefix}-off`, '关闭转向灯', 'signal-off'),
  ]
  switch (event.kind) {
    case 'brake': return [step('observe', '观察前方交通', 'observe-front'), step('brake', '踩刹车减速', 'brake'), step('confirm', '确认已减速，继续行驶', 'execute', 'move')]
    case 'straight': return [step('observe', '观察前方，保持视野开阔', 'observe-front'), step('confirm', '确认已观察，保持直线行驶', 'execute', 'move')]
    case 'stop-and-observe': return [step('brake', '踩刹车减速', 'brake'), step('stop', '确认车辆停稳', 'stop'), step('left', '观察左侧交通', 'observe-left'), step('right', '观察右侧交通', 'observe-right'), step('confirm', '确认安全，准备继续', 'execute', 'move')]
    case 'overtake': return [...signal('left', 'out', '确认安全，驶入超车道', false, 'pass'), ...signal('right', 'back', '确认安全，返回原车道', false, 'return')]
    case 'parking': return [...signal('right', 'park', '确认安全，完成靠边停车', true, 'stop'), step('gear', '车辆停稳后挂 P 挡', 'gear-p'), step('secure', '拉起驻车制动', 'handbrake-on')]
    case 'lane-change': return signal(requiredDirection(event), 'lane', '确认安全，完成变道', false, 'move')
    case 'turn': return signal(requiredDirection(event), 'turn', `确认安全，完成${event.direction === 'left' ? '左' : '右'}转`, true, 'move')
    case 'uturn': return signal(requiredDirection(event), 'uturn', '确认安全，完成掉头', true, 'move')
  }
}

function requiredDirection(event: CalibratedEvent) {
  if (!event.direction) throw new Error(`练习项目缺少方向：${event.id}`)
  return event.direction
}

export function createTrainingState(events: PracticeEvent[], now = 0, signalWaitMs = DEFAULT_SIGNAL_WAIT_MS): TrainingState {
  // The same publication boundary is enforced even when a caller bypasses Query.
  events = practiceEventSchema.array().parse(events)
  if (events.some((event, index) => !isPracticeReady(event) || event.id[0] !== events[0].id[0] || index > 0 && pauseTimeMs(event) <= pauseTimeMs(events[index - 1])) || new Set(events.map(event => event.id)).size !== events.length) throw new Error('练习事件未通过发布检查')
  if (!Number.isFinite(signalWaitMs) || signalWaitMs < 0) throw new Error('练习等待时长无效')
  events.forEach(stepsFor)
  return { enabled: false, phase: 'road', events, scope: null, positionMs: 0, activeId: null, stepIndex: 0, elapsedMs: 0, lastNowMs: now, signalWaitMs, suspensions: [], seeking: false, vehicle: freshVehicle(), progress: {}, attempts: [], corrections: 0, feedback: '点击开始全程练习，或选择一个项目单独练习。' }
}

export function activeEvent(state: TrainingState) { return state.events.find(event => event.id === state.activeId) }
export function currentStep(state: TrainingState) { const event = activeEvent(state); return event ? stepsFor(event)[state.stepIndex] : undefined }
export function isOperating(state: TrainingState) { return state.enabled && state.phase === 'practice' && !state.seeking && state.suspensions.length === 0 }
export function signalRemainingMs(state: TrainingState) { return state.vehicle.signalSinceMs === null ? state.signalWaitMs : Math.max(0, state.signalWaitMs - (state.elapsedMs - state.vehicle.signalSinceMs)) }

function record(state: TrainingState, outcome: Attempt['outcome']): Attempt[] {
  return state.activeId && state.phase === 'practice' ? [...state.attempts, { eventId: state.activeId, outcome, elapsedMs: state.elapsedMs, corrections: state.corrections }] : state.attempts
}
function enter(state: TrainingState, event: PracticeEvent): TrainingState {
  return { ...state, phase: 'practice', positionMs: pauseTimeMs(event), activeId: event.id, stepIndex: 0, elapsedMs: 0, corrections: 0, vehicle: freshVehicle(), feedback: `开始「${event.title}」。${stepsFor(event)[0].label}。` }
}
function settle(state: TrainingState): TrainingState {
  const event = activeEvent(state)
  if (!event || state.phase !== 'practice') return state
  const steps = stepsFor(event)
  let next = state
  if (isOperating(next) && steps[next.stepIndex]?.operation === 'wait' && signalRemainingMs(next) === 0) {
    next = { ...next, stepIndex: next.stepIndex + 1, feedback: '等待完成，请确认交通安全后执行。' }
  }
  if (next.stepIndex === steps.length) return { ...next, phase: 'review', progress: { ...next.progress, [event.id]: 'completed' }, attempts: record(next, 'completed'), feedback: `已完成「${event.title}」，可以重练或继续。` }
  return next
}
function advance(state: TrainingState, now: number) {
  const safeNow = Math.max(state.lastNowMs, now)
  return settle({ ...state, lastNowMs: safeNow, elapsedMs: state.elapsedMs + (isOperating(state) ? safeNow - state.lastNowMs : 0) })
}
function reposition(state: TrainingState, positionMs: number): TrainingState {
  // Crossing a node by seeking is never counted as a successful operation.
  const progress = Object.fromEntries(state.events.filter(event => pauseTimeMs(event) < positionMs).map(event => [event.id, state.progress[event.id] === 'completed' ? 'completed' as const : 'skipped' as const]))
  return { ...state, phase: 'road', scope: null, positionMs, activeId: null, stepIndex: 0, elapsedMs: 0, corrections: 0, vehicle: freshVehicle(), progress, attempts: record(state, 'abandoned'), feedback: '位置已调整。之前未完成的项目已标为跳过；点击播放继续练习。' }
}

export function trainingReducer(previous: TrainingState, action: TrainingAction): TrainingState {
  let state = advance(previous, action.now)
  switch (action.type) {
    case 'tick': return state
    case 'notice': return { ...state, feedback: action.message }
    case 'start': {
      const fresh = createTrainingState(state.events, action.now, state.signalWaitMs)
      const next = reposition({ ...fresh, enabled: true, suspensions: state.suspensions }, action.positionMs)
      return { ...next, feedback: '视频行驶到练习位置时会暂停，请按步骤完成操作。' }
    }
    case 'stop': return { ...state, enabled: false, phase: 'road', activeId: null, scope: null, vehicle: freshVehicle(), attempts: record(state, 'abandoned'), feedback: '已结束练习，可以继续观看视频。' }
    case 'suspend': return { ...state, suspensions: action.value ? [...new Set([...state.suspensions, action.reason])] : state.suspensions.filter(reason => reason !== action.reason) }
    case 'seek': return { ...reposition(state, action.positionMs), seeking: true }
    case 'seeked': return { ...state, positionMs: action.positionMs, seeking: false }
    case 'transport': return { ...state, seeking: action.seeking }
    case 'retry': {
      const event = state.events.find(event => event.id === action.eventId)
      if (!event) return state
      const progress = { ...state.progress }; delete progress[event.id]
      const scope = !action.single && state.enabled && state.scope === null && state.activeId === event.id ? null : event.id
      const base = { ...state, enabled: true, scope, progress, attempts: record(state, 'abandoned'), seeking: true }
      return action.preview
        ? { ...base, phase: 'road', activeId: null, vehicle: freshVehicle(), elapsedMs: 0, positionMs: Math.max(0, pauseTimeMs(event) - 5000), feedback: '点击播放回看，视频到本项位置时会暂停。' }
        : enter(base, event)
    }
    case 'position': {
      if (!state.enabled || state.phase !== 'road' || state.seeking || state.suspensions.length) return state
      const positionMs = Math.max(0, action.positionMs)
      // Only forward playback may trigger. Explicit seeking uses its own actions.
      if (positionMs < state.positionMs) return state
      const event = state.events.find(event => (!state.scope || event.id === state.scope) && !state.progress[event.id] && pauseTimeMs(event) >= state.positionMs && pauseTimeMs(event) <= positionMs)
      return event ? enter(state, event) : { ...state, positionMs }
    }
    case 'continue': {
      if (state.phase !== 'review' || state.suspensions.length || state.seeking) return state
      const finished = state.scope !== null || state.events.every(event => state.progress[event.id])
      return { ...state, phase: finished ? 'finished' : 'road', activeId: null, vehicle: finished ? state.vehicle : freshVehicle(), feedback: finished ? '本次练习已结束。可以选择项目重练。' : '准备继续下一项练习。' }
    }
    case 'ended': return state.phase === 'road' ? { ...state, phase: 'finished', feedback: '已到视频结尾。可在项目列表中查看未练习的项目并重练。' } : state
    case 'operate': {
      if (!isOperating(state)) return state
      const step = currentStep(state)
      if (!step) return state
      const reject = (message: string): TrainingState => ({ ...state, corrections: state.corrections + 1, feedback: message })
      const operation = action.operation
      if (operation === 'gear-p' && state.vehicle.motion !== 'stopped') return reject('车辆尚未停稳，请先减速并完成停车，再挂 P 挡。')
      if (operation === 'handbrake-on' && state.vehicle.motion !== 'stopped') return reject('车辆尚未停稳，请先完成停车。')
      if (operation.startsWith('signal-')) {
        const indicator = operation === 'signal-left' ? 'left' : operation === 'signal-right' ? 'right' : 'off'
        if (indicator === state.vehicle.indicator && operation !== step.operation) return { ...state, feedback: indicator === 'off' ? '转向灯已经关闭。' : '转向灯已开启，重复点击不会重新计时。' }
        if (operation !== step.operation && state.vehicle.signalSinceMs !== null) {
          const steps = stepsFor(activeEvent(state)!)
          let restart = state.stepIndex
          while (restart > 0 && !['signal-left', 'signal-right'].includes(steps[restart].operation)) restart--
          return { ...state, stepIndex: restart, corrections: state.corrections + 1, vehicle: { ...state.vehicle, indicator, signalSinceMs: null, observed: [], brake: false }, feedback: '转向灯已改变，请从本段打灯步骤重新操作。' }
        }
      }
      if (operation !== step.operation) return reject(step.operation === 'wait' ? '请保持转向灯，等待练习计时完成。' : `请先${step.label}。`)
      const vehicle = { ...state.vehicle }
      switch (operation) {
        case 'signal-left': case 'signal-right': vehicle.indicator = operation === 'signal-left' ? 'left' : 'right'; vehicle.signalSinceMs = state.elapsedMs; vehicle.observed = []; vehicle.brake = false; break
        case 'signal-off': vehicle.indicator = 'off'; vehicle.signalSinceMs = null; break
        case 'observe-left': case 'observe-right': case 'observe-front': vehicle.observed = [...new Set([...vehicle.observed, operation.slice(8) as Vehicle['observed'][number]])]; break
        case 'brake': vehicle.brake = true; break
        case 'stop': vehicle.motion = 'stopped'; break
        case 'gear-p': vehicle.gear = 'P'; break
        case 'handbrake-on': vehicle.handbrake = true; break
        case 'execute':
          if (step.effect === 'stop') vehicle.motion = 'stopped'
          else { vehicle.motion = 'moving'; vehicle.brake = false }
          if (step.effect === 'pass') vehicle.lane = 'passing'
          if (step.effect === 'return') vehicle.lane = 'original'
          break
      }
      return settle({ ...state, vehicle, stepIndex: state.stepIndex + 1, feedback: `已${step.label}。` })
    }
  }
}
