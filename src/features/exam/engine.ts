import { z } from 'zod'
import { routeIdSchema, type RouteId } from '../content/schema'
import { scenarioRoute, type SceneSpec } from './routes'

export const EXAM_RULE_VERSION = 'scenario-teaching-v1'
export const ROAD_LENGTH = 96
export const SIGNAL_WAIT_MS = 3000
export const OBSERVATION_MAX_AGE_MS = 8000
export const operationSchema = z.enum(['signal-left', 'signal-right', 'signal-off', 'observe-front', 'observe-left', 'observe-right', 'brake', 'stop', 'resume', 'left', 'right', 'proceed', 'gear-p', 'gear-d', 'handbrake-on', 'handbrake-off'])
export type ExamOperation = z.infer<typeof operationSchema>
export type Suspension = 'user' | 'hidden' | 'speech' | 'voice-error' | 'dialog'
export const hazardSchema = z.object({
  kind: z.enum(['clear', 'red', 'pedestrian', 'cross-traffic', 'rear-left', 'rear-right']),
  untilMs: z.number().nonnegative(),
  returnBusyMs: z.number().nonnegative(),
})
export type Hazard = z.infer<typeof hazardSchema>
export type PlannedScene = SceneSpec & { hazard: Hazard }
const observationsSchema = z.object({ front: z.number().nullable(), left: z.number().nullable(), right: z.number().nullable() })
export const vehicleSchema = z.object({
  speed: z.union([z.literal(0), z.literal(4), z.literal(8)]),
  lane: z.number().int().min(0).max(2),
  heading: z.number(), indicator: z.enum(['off', 'left', 'right']), signalSinceMs: z.number().nullable(),
  gear: z.enum(['D', 'P']), handbrake: z.boolean(), observed: observationsSchema,
})
export type Vehicle = z.infer<typeof vehicleSchema>
export const frameSchema = z.object({
  sceneIndex: z.number().int().nonnegative(), stageMs: z.number().nonnegative(), distance: z.number().min(0).max(ROAD_LENGTH),
  elapsedMs: z.number().nonnegative(), leg: z.enum(['out', 'return', 'secure']), legStartedMs: z.number().nonnegative(),
  vehicle: vehicleSchema, slowed: z.boolean(), stoppedAtLine: z.boolean(),
})
export type SceneFrame = z.infer<typeof frameSchema>
export const faultSchema = z.object({
  id: z.string(), sceneId: z.string(), title: z.string(), rule: z.string(), reason: z.string(), advice: z.string(), cost: z.literal(10),
  operation: operationSchema.nullable(), snapshot: frameSchema,
})
export type ExamFault = z.infer<typeof faultSchema>
export type Maneuver = { direction: 'left' | 'right' | 'forward'; ms: number; targetLane: number; after: 'next' | 'return' | 'secure' }
export interface ExamState extends SceneFrame {
  routeId: RouteId; seed: number; scenes: PlannedScene[]; phase: 'ready' | 'running' | 'finished'; outcome: 'passed' | 'failed' | 'aborted' | null
  score: number; lastNowMs: number; suspensions: Suspension[]; voice: boolean; announcement: { id: number; text: string } | null; announcementSequence: number
  lastCommand: string; feedback: string; faults: ExamFault[]; completed: string[]; skipped: string[]
  operations: { sceneId: string; atMs: number; operation: ExamOperation }[]
  maneuver: Maneuver | null; originalLane: number; closeSignalBy: number | null; lastObservation: 'front' | 'left' | 'right' | null
  single: boolean
}
export type ExamAction =
  | { type: 'start'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'operate'; operation: ExamOperation; now: number }
  | { type: 'suspend'; reason: Exclude<Suspension, 'speech' | 'voice-error'>; value: boolean; now: number }
  | { type: 'speech-end' | 'speech-error'; id: number; now: number }
  | { type: 'retry-speech' | 'text-only' | 'abort'; now: number }

function randomFrom(seed: number) {
  let value = seed >>> 0
  return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
export function makePlan(routeId: RouteId, seed: number): PlannedScene[] {
  const random = randomFrom(seed)
  return scenarioRoute(routeId).scenes.map(scene => {
    const pick = random()
    const kind: Hazard['kind'] = ['lane', 'overtake'].includes(scene.kind)
      ? pick < .65 ? (scene.direction === 'right' ? 'rear-right' : 'rear-left') : 'clear'
      : scene.kind === 'straight' ? 'clear'
      : scene.kind === 'parking' ? pick < .5 ? 'pedestrian' : 'clear'
      : scene.landmark === '公交车站' || scene.landmark === '检查区' ? pick < .45 ? 'pedestrian' : 'clear'
      : pick < .25 ? 'red' : pick < .5 ? 'pedestrian' : pick < .7 ? 'cross-traffic' : 'clear'
    return { ...scene, hazard: { kind, untilMs: kind === 'clear' ? 0 : 14000 + Math.floor(random() * 4000), returnBusyMs: scene.kind === 'overtake' && random() < .5 ? 7000 : 0 } }
  })
}
const freshVehicle = (): Vehicle => ({ speed: 8, lane: 1, heading: 0, indicator: 'off', signalSinceMs: null, gear: 'D', handbrake: false, observed: { front: null, left: null, right: null } })
export function createExam(routeId: RouteId, seed: number, now = 0, voice = true, singleSceneId?: string): ExamState {
  const normalizedSeed = seed >>> 0
  const plan = makePlan(routeId, normalizedSeed)
  const scenes = singleSceneId ? plan.filter(scene => scene.id === singleSceneId) : plan
  if (!scenes.length) throw new Error('没有找到所选场景')
  return { routeId, seed: normalizedSeed, scenes, phase: 'ready', outcome: null, score: 100, lastNowMs: now,
    suspensions: [], voice, announcement: null, announcementSequence: 0, lastCommand: '', feedback: '车辆会自动行驶。请根据道路情况和口令完成关键操作。',
    faults: [], completed: [], skipped: [], operations: [], maneuver: null, originalLane: 1, closeSignalBy: null, lastObservation: null,
    sceneIndex: 0, stageMs: 0, distance: 0, elapsedMs: 0, leg: 'out', legStartedMs: 0, vehicle: freshVehicle(), slowed: false, stoppedAtLine: false, single: !!singleSceneId }
}
export const activeScene = (state: ExamState) => state.scenes[state.sceneIndex]
export function snapshot(state: SceneFrame): SceneFrame {
  const { sceneIndex, stageMs, distance, elapsedMs, leg, legStartedMs, vehicle, slowed, stoppedAtLine } = state
  return { sceneIndex, stageMs, distance, elapsedMs, leg, legStartedMs, vehicle: { ...vehicle, observed: { ...vehicle.observed } }, slowed, stoppedAtLine }
}
export function canOperate(state: ExamState) { return state.phase === 'running' && state.suspensions.length === 0 }
export function hazardActive(scene: PlannedScene, frame: SceneFrame) {
  if (scene.kind === 'overtake' && frame.leg === 'return') return frame.stageMs - frame.legStartedMs < scene.hazard.returnBusyMs ? 'rear-right' as const : 'clear' as const
  return frame.stageMs < scene.hazard.untilMs ? scene.hazard.kind : 'clear' as const
}
export function signalRemaining(state: SceneFrame) {
  return state.vehicle.signalSinceMs === null ? SIGNAL_WAIT_MS : Math.max(0, SIGNAL_WAIT_MS - (state.elapsedMs - state.vehicle.signalSinceMs))
}
function say(state: ExamState, text: string): ExamState {
  if (!text) return state
  const id = state.announcementSequence + 1
  return { ...state, announcementSequence: id, announcement: state.voice ? { id, text } : null,
    suspensions: state.voice ? [...new Set([...state.suspensions, 'speech' as const])] : state.suspensions, lastCommand: text }
}
function finish(state: ExamState, outcome: ExamState['outcome']): ExamState {
  return say({ ...state, phase: 'finished', outcome, vehicle: { ...state.vehicle, speed: 0 }, maneuver: null, suspensions: [],
    feedback: outcome === 'passed' ? '本次场景考试合格。可以回顾操作，或换一组交通情况再考。' : outcome === 'failed' ? '成绩低于90分，本次场景考试结束。请查看扣分原因。' : '本次考试已结束，未完成的考试不计为合格。' },
    outcome === 'passed' ? `本次场景考试合格，成绩${state.score}分。` : outcome === 'failed' ? `本次成绩${state.score}分，考试结束。` : '本次考试已结束。')
}
function penalize(state: ExamState, rule: string, reason: string, advice: string, operation: ExamOperation | null = null): ExamState {
  const scene = activeScene(state)
  const id = `${scene.id}:${state.leg}:${rule}`
  if (state.faults.some(fault => fault.id === id)) return { ...state, feedback: `${reason}。${advice}` }
  const fault: ExamFault = { id, sceneId: scene.id, title: scene.title, rule, reason, advice, cost: 10, operation, snapshot: snapshot(state) }
  const next = { ...state, score: Math.max(0, state.score - 10), faults: [...state.faults, fault], feedback: `${reason}，扣10分。${advice}` }
  return next.score < 90 ? finish(next, 'failed') : say(next, `${reason}，扣10分。`)
}
function enterScene(state: ExamState, index: number): ExamState {
  const vehicle = { ...state.vehicle, speed: 8 as const, observed: { front: null, left: null, right: null } }
  const next: ExamState = { ...state, sceneIndex: index, stageMs: 0, distance: 0, leg: 'out', legStartedMs: 0, slowed: false, stoppedAtLine: false,
    vehicle, originalLane: vehicle.lane, maneuver: null, lastObservation: null, feedback: '车辆自动行驶中，请留意道路和交通情况。', lastCommand: '' }
  return say(next, activeScene(next).command)
}
function nextScene(state: ExamState, completed: boolean): ExamState {
  const sceneId = activeScene(state).id
  const next = { ...state, completed: completed ? [...state.completed, sceneId] : state.completed, skipped: completed ? state.skipped : [...state.skipped, sceneId] }
  return state.sceneIndex + 1 === state.scenes.length ? finish(next, next.score >= 90 ? 'passed' : 'failed') : enterScene(next, state.sceneIndex + 1)
}
function observed(state: ExamState, direction: 'front' | 'left' | 'right') {
  const at = state.vehicle.observed[direction]
  return at !== null && state.elapsedMs - at <= OBSERVATION_MAX_AGE_MS
}
function missScene(state: ExamState): ExamState {
  // A single uncorrected attempt must not cascade into a second omission fine.
  const alreadyFaulted = state.faults.some(fault => fault.sceneId === activeScene(state).id)
  const next = alreadyFaulted ? state : penalize(state, 'missed', '经过路段时未完成本项操作', '提前观察道路，在对应路段内完成操作。')
  if (next.phase === 'finished') return next
  const advanced = nextScene(next, false)
  if (advanced.phase === 'finished' || alreadyFaulted) return advanced
  return say(advanced, `${next.lastCommand} ${activeScene(advanced).command}`)
}
function advance(previous: ExamState, now: number): ExamState {
  const delta = Math.max(0, now - previous.lastNowMs)
  let state = { ...previous, lastNowMs: Math.max(now, previous.lastNowMs) }
  if (!canOperate(previous) || !delta) return state
  // Long event-loop stalls must not carry the car through a hidden decision zone.
  if (delta > 1500) return { ...state, suspensions: [...state.suspensions, 'user'], feedback: '画面暂时中断，已暂停考试。准备好后请继续。' }
  state = { ...state, stageMs: state.stageMs + delta, elapsedMs: state.elapsedMs + delta }
  if (state.closeSignalBy !== null && state.elapsedMs >= state.closeSignalBy) {
    state = state.vehicle.indicator === 'off' ? { ...state, closeSignalBy: null } : penalize({ ...state, closeSignalBy: null }, 'signal-off', '完成动作后未关闭转向灯', '完成动作后及时关闭转向灯。')
    if (!canOperate(state)) return state
  }
  if (state.maneuver) {
    const maneuver = { ...state.maneuver, ms: state.maneuver.ms + (state.vehicle.speed > 0 ? delta : 0) }
    if (maneuver.ms < 1800) return { ...state, maneuver }
    const scene = activeScene(state)
    const heading = state.vehicle.heading + (scene.kind === 'uturn' ? 180 : scene.kind === 'turn' ? maneuver.direction === 'left' ? -90 : 90 : 0)
    state = { ...state, maneuver: null, vehicle: { ...state.vehicle, lane: maneuver.targetLane, heading, observed: { front: null, left: null, right: null } }, closeSignalBy: state.vehicle.indicator === 'off' ? null : state.elapsedMs + 6000 }
    if (maneuver.after === 'return') return { ...state, leg: 'return', legStartedMs: state.stageMs, distance: 36, feedback: '车辆已驶入超车道。请根据路况完成后续操作。' }
    if (maneuver.after === 'secure') return { ...state, leg: 'secure', vehicle: { ...state.vehicle, speed: 0 }, feedback: '车辆已靠边停稳，请完成停车收尾。' }
    return nextScene(state, true)
  }
  if (state.leg === 'secure') return state
  const beforeDistance = state.distance
  state = { ...state, distance: Math.min(ROAD_LENGTH, Math.round((state.distance + state.vehicle.speed * delta / 1000) * 1000) / 1000) }
  const scene = activeScene(state)
  const danger = hazardActive(scene, state)
  if (beforeDistance < 80 && state.distance >= 80 && ['red', 'pedestrian', 'cross-traffic'].includes(danger)) {
    state = penalize({ ...state, vehicle: { ...state.vehicle, speed: 0 }, distance: 79 }, 'unsafe-crossing', danger === 'red' ? '红灯时驶过停止位置' : danger === 'pedestrian' ? '未停车让行横穿行人' : '横向有来车时继续驶入路口', '先停车等待，交通冲突解除后重新观察再通行。')
    return state
  }
  if (state.distance < ROAD_LENGTH) return state
  const automaticallyComplete = ['slow', 'straight'].includes(scene.kind) && state.vehicle.observed.front !== null && (scene.kind === 'straight' || (state.slowed && state.vehicle.speed <= 4))
  return automaticallyComplete ? nextScene(state, true) : missScene(state)
}
function maneuver(state: ExamState, direction: 'left' | 'right' | 'forward', targetLane: number, after: Maneuver['after']): ExamState {
  return { ...state, maneuver: { direction, targetLane, ms: 0, after }, vehicle: { ...state.vehicle, speed: 4 }, feedback: '正在完成车辆动作。' }
}
function execute(state: ExamState, direction: 'left' | 'right' | 'forward', operation: ExamOperation): ExamState {
  const scene = activeScene(state)
  const isLateral = scene.kind === 'lane' || scene.kind === 'overtake'
  if (!isLateral && !['turn', 'uturn', 'parking', 'look'].includes(scene.kind)) {
    if (direction !== 'forward') return penalize(state, 'direction', '当前路段不应向侧方执行', '根据前方道路和口令选择行驶方向。', operation)
    return { ...state, vehicle: { ...state.vehicle, speed: 8 }, feedback: '继续向前行驶，请留意道路。' }
  }
  const expected = scene.kind === 'look' ? 'forward' : scene.kind === 'overtake' ? state.leg === 'return' ? 'right' : 'left' : scene.direction
  if (direction !== expected) return penalize(state, 'direction', '行驶方向与当前路段要求不符', '根据口令、导航与道路标志判断方向。', operation)
  if (state.distance < (isLateral ? 24 : 60)) return penalize(state, 'early', '尚未到达可执行位置就操作', '在虚线变道区或路口前的操作区内执行。', operation)
  const danger = hazardActive(scene, state)
  if (danger !== 'clear' && (['red', 'pedestrian', 'cross-traffic'].includes(danger) || (direction === 'left' && danger === 'rear-left') || (direction === 'right' && danger === 'rear-right'))) {
    return penalize(state, 'unsafe', '交通冲突尚未解除就尝试通行', '观察后等待来车或行人通过，再次确认安全。', operation)
  }
  if (scene.kind === 'look') {
    if (!state.stoppedAtLine) return penalize(state, 'stop', '未在路口前停稳就继续', '到达路口前操作区后停车，再观察左右。', operation)
    if (!observed(state, 'left') || !observed(state, 'right')) return penalize(state, 'observation', '停车后未充分观察左右交通', '停稳后观察左侧、右侧，再继续。', operation)
    return maneuver(state, 'forward', state.vehicle.lane, 'next')
  }
  if (state.vehicle.indicator !== direction || signalRemaining(state) > 0) return penalize(state, 'signal', '转向灯方向不正确或等待不足3秒', '提前开启对应方向转向灯，保持至少3秒。此为教学规则。', operation)
  if (!observed(state, direction as 'left' | 'right')) return penalize(state, 'observation', '执行前未重新观察对应方向交通', '执行前观察对应方向，等待较久后需要再观察。', operation)
  if (!isLateral && !state.slowed) return penalize(state, 'slow', '转弯或停车前未减速', '提前踩刹车减速，再完成动作。', operation)
  const targetLane = scene.kind === 'overtake' ? state.leg === 'return' ? state.originalLane : state.originalLane - 1
    : scene.kind === 'lane' ? state.vehicle.lane + (direction === 'left' ? -1 : 1) : scene.destinationLane ?? (scene.kind === 'parking' ? 2 : 1)
  if (targetLane < 0 || targetLane > 2) return penalize(state, 'lane', '已经到道路边缘，不能继续向该方向变道', '观察车道位置，按当前路段选择车道。', operation)
  return maneuver(state, direction as 'left' | 'right', targetLane, scene.kind === 'parking' ? 'secure' : scene.kind === 'overtake' && state.leg === 'out' ? 'return' : 'next')
}
export function examReducer(previous: ExamState, action: ExamAction): ExamState {
  let state = advance(previous, action.now)
  switch (action.type) {
    case 'tick': return state
    case 'start': return state.phase === 'ready' ? enterScene({ ...state, phase: 'running' }, 0) : state
    case 'suspend': {
      if (state.phase !== 'running' && state.phase !== 'finished') return state
      const suspensions = action.value ? [...new Set([...state.suspensions, action.reason, ...(action.reason === 'hidden' ? ['user' as const] : [])])] : state.suspensions.filter(reason => reason !== action.reason)
      return { ...state, suspensions, feedback: action.value ? '考试已暂停，准备好后手动继续。' : state.feedback }
    }
    case 'speech-end': return state.announcement?.id !== action.id ? state : { ...state, announcement: null, suspensions: state.suspensions.filter(reason => reason !== 'speech' && reason !== 'voice-error') }
    case 'speech-error': return state.announcement?.id !== action.id ? state : { ...state, suspensions: [...new Set([...state.suspensions, 'voice-error' as const])], feedback: '语音暂时无法播放，考试已暂停。可重试语音，或改用文字口令继续。' }
    case 'retry-speech': return state.announcement ? say({ ...state, suspensions: state.suspensions.filter(reason => reason !== 'voice-error') }, state.announcement.text) : state
    case 'text-only': return { ...state, voice: false, announcement: null, suspensions: state.suspensions.filter(reason => reason !== 'speech' && reason !== 'voice-error'), feedback: '已改用文字口令，请留意画面上方的口令。' }
    case 'abort': return state.phase === 'running' ? finish(state, 'aborted') : state
    case 'operate': {
      if (!canOperate(state)) return state
      const operation = action.operation
      state = { ...state, operations: [...state.operations, { sceneId: activeScene(state).id, atMs: state.elapsedMs, operation }].slice(-2000) }
      const vehicle = { ...state.vehicle, observed: { ...state.vehicle.observed } }
      if (operation.startsWith('signal-')) {
        const direction = operation.slice(7) as Vehicle['indicator']
        if (vehicle.indicator !== direction) { vehicle.indicator = direction; vehicle.signalSinceMs = direction === 'off' ? null : state.elapsedMs }
        const next = { ...state, vehicle, closeSignalBy: direction === 'off' ? null : state.closeSignalBy, feedback: direction === 'off' ? '转向灯已关闭。' : `已打开${direction === 'left' ? '左' : '右'}转向灯。` }
        return state.leg === 'secure' && direction === 'off' && vehicle.gear === 'P' && vehicle.handbrake ? nextScene(next, true) : next
      }
      if (operation.startsWith('observe-')) {
        const direction = operation.slice(8) as 'front' | 'left' | 'right'
        vehicle.observed[direction] = state.elapsedMs
        return { ...state, vehicle, lastObservation: direction, feedback: `正在观察${direction === 'front' ? '前方' : direction === 'left' ? '左侧及左后方' : '右侧及右后方'}，请根据画面判断。` }
      }
      if (operation === 'brake' || operation === 'stop') {
        vehicle.speed = operation === 'stop' ? 0 : vehicle.speed === 0 ? 0 : 4
        const stoppedAtLine = state.stoppedAtLine || (operation === 'stop' && state.distance >= 60 && state.distance < 80)
        if (operation === 'stop' && activeScene(state).kind === 'look') vehicle.observed = { front: null, left: null, right: null }
        return { ...state, vehicle, slowed: true, stoppedAtLine, feedback: operation === 'stop' ? '车辆已停稳，其他交通仍会继续。' : '车辆已减速。' }
      }
      if (operation === 'gear-p' || operation === 'handbrake-on') {
        if (vehicle.speed !== 0 || state.maneuver) return penalize(state, 'moving-park', '车辆未停稳就进行驻车操作', '先安全停车，再挂P挡和拉驻车制动。', operation)
        if (operation === 'gear-p') vehicle.gear = 'P'; else vehicle.handbrake = true
        state = { ...state, vehicle, feedback: operation === 'gear-p' ? '已挂P挡。' : '驻车制动已拉起。' }
        if (state.leg === 'secure' && vehicle.gear === 'P' && vehicle.handbrake && vehicle.indicator === 'off') return nextScene(state, true)
        return state
      }
      if (operation === 'gear-d' || operation === 'handbrake-off') {
        if (operation === 'gear-d') vehicle.gear = 'D'; else vehicle.handbrake = false
        return { ...state, vehicle, feedback: operation === 'gear-d' ? '已挂D挡。' : '驻车制动已松开。' }
      }
      if (state.leg === 'secure') {
        if (vehicle.gear === 'P' && vehicle.handbrake && vehicle.indicator === 'off') return nextScene(state, true)
        return { ...state, feedback: '请关闭转向灯，挂P挡并拉起驻车制动。' }
      }
      if (vehicle.gear !== 'D' || vehicle.handbrake) return penalize(state, 'drive-state', '挡位或驻车制动状态不允许行驶', '行驶前挂D挡并松开驻车制动。', operation)
      if (operation === 'resume') return { ...state, vehicle: { ...vehicle, speed: state.maneuver ? 4 : 8 }, slowed: false, feedback: '车辆恢复行驶，请留意前方。' }
      if (state.maneuver) return operation === 'proceed' ? { ...state, vehicle: { ...vehicle, speed: 4 }, feedback: '继续完成车辆动作。' } : state
      return execute(state, operation === 'left' ? 'left' : operation === 'right' ? 'right' : 'forward', operation)
    }
  }
}
