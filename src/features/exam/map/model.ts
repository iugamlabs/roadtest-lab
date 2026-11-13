import { z } from 'zod'
import type { RouteId } from '../../content/schema'
import { pathLength, poseAt } from './geometry'
import { mapRoute, type MapRoute } from './routes'

export const MAP_RULE_VERSION = 'map-teaching-v1'
export const mapOperationSchema = z.enum(['left', 'right', 'observe', 'slow', 'stop', 'go', 'park-p', 'park-brake'])
export type MapOperation = z.infer<typeof mapOperationSchema>
export const frameSchema = z.object({
  index: z.number().int().nonnegative(), leg: z.number().int().min(0).max(1),
  phase: z.enum(['ready', 'approach', 'decision', 'moving', 'review', 'secure', 'finished']),
  progress: z.number().min(0).max(1), maneuver: z.number().min(0).max(1),
  elapsedMs: z.number().nonnegative(), stageMs: z.number().nonnegative(), trafficAtMs: z.number().nonnegative().nullable(),
  indicator: z.enum(['left', 'right']).nullable(), signalAtMs: z.number().nonnegative().nullable(),
  observed: z.boolean(), slow: z.boolean(), stopped: z.boolean(), stoppedForLook: z.boolean(), gearP: z.boolean(), handbrake: z.boolean(),
})
export type MapFrame = z.infer<typeof frameSchema>
export const faultSchema = z.object({
  id: z.string(), sceneId: z.string(), title: z.string(), rule: z.string(), reason: z.string(), advice: z.string(), cost: z.literal(10),
  operation: mapOperationSchema, snapshot: frameSchema,
})
export type MapFault = z.infer<typeof faultSchema>
export type MapPause = 'user' | 'hidden' | 'dialog' | 'speech' | 'voice-error'
export interface MapState extends MapFrame {
  route: MapRoute; seed: number; mode: 'practice' | 'assessment'; single: number | null; outcome: 'passed' | 'failed' | 'aborted' | null
  score: number; completed: string[]; faults: MapFault[]; corrections: number; feedback: string; pauses: MapPause[]
  voice: boolean; announcement: { id: number; text: string } | null; sequence: number
  operations: { sceneId: string; atMs: number; operation: MapOperation }[]
}
export type MapAction =
  | { type: 'start' }
  | { type: 'tick'; deltaMs: number }
  | { type: 'operate'; operation: MapOperation }
  | { type: 'pause'; reason: Exclude<MapPause, 'speech' | 'voice-error'>; value: boolean }
  | { type: 'set-voice'; value: boolean }
  | { type: 'speech-end' | 'speech-error'; id: number }
  | { type: 'retry-speech' | 'repeat-command' | 'text-only' | 'abort' }

export function createMapSession(routeId: RouteId, seed = 0, mode: MapState['mode'] = 'practice', voice = false, singleSceneId?: string): MapState {
  const route = mapRoute(routeId)
  const index = singleSceneId ? route.scenes.findIndex(scene => scene.id === singleSceneId) : 0
  if (index < 0) throw new Error('没有找到所选项目')
  return { route, seed: seed >>> 0, mode, voice, single: singleSceneId ? index : null,
    index, leg: 0, phase: 'ready', progress: 0, maneuver: 0, elapsedMs: 0, stageMs: 0, trafficAtMs: null,
    indicator: null, signalAtMs: null, observed: false, slow: false, stopped: false, stoppedForLook: false, gearP: false, handbrake: false,
    outcome: null, score: 100, completed: [], faults: [], corrections: 0, feedback: '准备好后开始，车辆到操作位置会等你。', pauses: [], announcement: null, sequence: 0, operations: [] }
}
export const currentMapScene = (state: MapState) => state.route.scenes[state.index]
export const canMapOperate = (state: MapState) => state.phase !== 'ready' && state.phase !== 'finished' && state.pauses.length === 0
export function mapFrame(state: MapFrame): MapFrame {
  const { index, leg, phase, progress, maneuver, elapsedMs, stageMs, trafficAtMs, indicator, signalAtMs, observed, slow, stopped, stoppedForLook, gearP, handbrake } = state
  return { index, leg, phase, progress, maneuver, elapsedMs, stageMs, trafficAtMs, indicator, signalAtMs, observed, slow, stopped, stoppedForLook, gearP, handbrake }
}
export function mapCarPose(route: MapRoute, frame: MapFrame) {
  const scene = route.scenes[frame.index]
  const action = scene.actions[frame.leg]
  if (['moving', 'review', 'secure', 'finished'].includes(frame.phase)) return poseAt(action, frame.maneuver)
  if (frame.phase === 'decision') return poseAt(action, 0)
  return pathLength(scene.approach) > 0 ? poseAt(scene.approach, frame.progress) : poseAt(action, 0)
}
export function neededDirection(state: Pick<MapState, 'route' | 'index' | 'leg'>) {
  const scene = state.route.scenes[state.index]
  return scene.kind === 'overtake' ? state.leg === 0 ? 'left' : 'right' : scene.direction
}
export type MapTraffic = 'clear' | 'pedestrian' | 'rear-left' | 'rear-right' | 'cross-traffic' | 'red'
export function mapTraffic(route: MapRoute, seed: number, frame: MapFrame): MapTraffic {
  if (frame.trafficAtMs === null || frame.stageMs - frame.trafficAtMs >= 10000 || ['review', 'secure', 'finished'].includes(frame.phase)) return 'clear'
  const scene = route.scenes[frame.index]
  const hash = Math.imul((seed ^ (frame.index + 1) * 7919 ^ frame.leg * 104729) >>> 0, 2654435761) >>> 0
  const pick = hash % 10
  if (scene.kind === 'straight' || pick >= 7) return 'clear'
  if (scene.kind === 'lane' || scene.kind === 'overtake') return neededDirection({ route, index: frame.index, leg: frame.leg }) === 'left' ? 'rear-left' : 'rear-right'
  if (scene.landmark === '公交车站' || scene.landmark === '检查区' || scene.kind === 'parking') return 'pedestrian'
  return pick < 3 ? 'red' : pick < 5 ? 'cross-traffic' : 'pedestrian'
}
export function trafficMessage(traffic: MapTraffic) {
  return traffic === 'pedestrian' ? '有行人正在通过' : traffic === 'rear-left' ? '左侧有车辆驶来' : traffic === 'rear-right' ? '右侧有车辆驶来' : traffic === 'cross-traffic' ? '路口有横向来车' : traffic === 'red' ? '前方信号为红灯' : '当前可见范围内无冲突'
}
function announce(state: MapState, text: string): MapState {
  if (!text) return { ...state, announcement: null, pauses: state.pauses.filter(reason => reason !== 'speech' && reason !== 'voice-error') }
  const id = state.sequence + 1
  return { ...state, sequence: id, announcement: state.voice ? { id, text } : null,
    pauses: state.voice ? [...new Set([...state.pauses, 'speech' as const])] : state.pauses }
}
function finish(state: MapState, outcome: MapState['outcome']): MapState {
  return announce({ ...state, phase: 'finished', outcome, stopped: true, pauses: [],
    feedback: outcome === 'passed' ? state.mode === 'practice' ? '本次路线练习完成。可以重练项目，或换一条路线。' : '本次操作考核合格。' : outcome === 'failed' ? '成绩低于90分，本次操作考核结束。' : '本次体验已结束。' },
    outcome === 'passed' ? state.mode === 'practice' ? '本次路线练习完成。' : `本次操作考核合格，${state.score}分。` : outcome === 'failed' ? `本次成绩${state.score}分，考核结束。` : '本次体验已结束。')
}
function issue(state: MapState, rule: string, reason: string, advice: string, operation: MapOperation): MapState {
  if (state.mode === 'practice') return { ...state, corrections: state.corrections + 1, feedback: `${reason}。${advice}` }
  const scene = currentMapScene(state)
  const id = `${scene.id}:${state.leg}:${rule}`
  if (state.faults.some(fault => fault.id === id)) return { ...state, feedback: `${reason}。${advice}` }
  const next = { ...state, score: state.score - 10, feedback: `${reason}，扣10分。${advice}`, faults: [...state.faults,
    { id, sceneId: scene.id, title: scene.title, rule, reason, advice, operation, cost: 10 as const, snapshot: mapFrame(state) }] }
  return next.score < 90 ? finish(next, 'failed') : next
}
function enter(state: MapState, index: number): MapState {
  const alreadyThere = pathLength(state.route.scenes[index].approach) < .001
  return announce({ ...state, index, leg: 0, phase: alreadyThere ? 'decision' : 'approach', progress: alreadyThere ? 1 : 0, maneuver: 0, stageMs: 0, trafficAtMs: alreadyThere ? 0 : null,
    observed: false, slow: false, stopped: false, stoppedForLook: false,
    feedback: alreadyThere ? '已到下一项操作位置，准备好后点通行。' : '车辆缓慢驶向下一处操作位置，请留意道路和交通。' }, state.route.scenes[index].command)
}
function complete(state: MapState): MapState {
  return { ...state, phase: 'review', stopped: true, completed: [...new Set([...state.completed, currentMapScene(state).id])],
    feedback: state.indicator ? '本项已完成。点同一盏灯关闭，再点通行继续。' : state.index === state.route.scenes.length - 1 || state.single !== null ? '本项已完成，点通行查看结果。' : '本项已完成，准备好后点通行继续路线。' }
}
export function mapReducer(state: MapState, action: MapAction): MapState {
  if (action.type === 'start') return state.phase === 'ready' ? enter({ ...state, pauses: [] }, state.index) : state
  if (action.type === 'set-voice') return action.value ? { ...state, voice: true } : { ...state, voice: false, announcement: null, pauses: state.pauses.filter(reason => reason !== 'speech' && reason !== 'voice-error') }
  if (action.type === 'repeat-command') return state.voice && currentMapScene(state).command ? announce(state, currentMapScene(state).command) : state
  if (action.type === 'pause') return { ...state, pauses: action.value ? [...new Set([...state.pauses, action.reason, ...(action.reason === 'hidden' ? ['user' as const] : [])])] : state.pauses.filter(reason => reason !== action.reason) }
  if (action.type === 'speech-end' || action.type === 'speech-error') {
    if (state.announcement?.id !== action.id) return state
    return action.type === 'speech-end' ? { ...state, announcement: null, pauses: state.pauses.filter(reason => reason !== 'speech' && reason !== 'voice-error') }
      : { ...state, pauses: [...new Set([...state.pauses, 'voice-error' as const])], feedback: '语音暂时不可用，已暂停。可重试或改用文字口令。' }
  }
  if (action.type === 'retry-speech') return state.announcement ? announce({ ...state, pauses: state.pauses.filter(reason => reason !== 'voice-error') }, state.announcement.text) : state
  if (action.type === 'text-only') return { ...state, voice: false, announcement: null, pauses: state.pauses.filter(reason => reason !== 'speech' && reason !== 'voice-error'), feedback: '已使用文字口令，可以继续操作。' }
  if (action.type === 'abort') return state.phase !== 'ready' && state.phase !== 'finished' ? finish(state, 'aborted') : state
  if (action.type === 'tick') {
    if (state.pauses.length || ['ready', 'review', 'finished'].includes(state.phase)) return state
    if (action.deltaMs > 1500) return { ...state, pauses: [...state.pauses, 'user'], feedback: '画面暂时中断，已暂停。准备好后继续。' }
    const delta = Math.max(0, action.deltaMs)
    const next = { ...state, elapsedMs: state.elapsedMs + delta, stageMs: state.stageMs + delta }
    if (state.phase === 'approach' && !state.stopped) {
      next.progress = Math.min(1, state.progress + delta / (state.slow ? 24000 : 12000))
      if (next.progress >= .4 && next.trafficAtMs === null) next.trafficAtMs = next.stageMs
      if (next.progress >= 1 - 1e-8) return { ...next, progress: 1, phase: 'decision', feedback: '已到操作位置，车辆在这里等你。观察并准备好后点通行。' }
    }
    if (state.phase === 'moving' && !state.stopped) {
      next.maneuver = Math.min(1, state.maneuver + delta / (state.slow ? 4800 : 3200))
      if (next.maneuver >= 1 - 1e-8) {
        next.maneuver = 1
        if (currentMapScene(state).kind === 'overtake' && state.leg === 0) return { ...next, leg: 1, maneuver: 0, phase: 'decision', observed: false, stageMs: 0, trafficAtMs: 0,
          feedback: '已驶入超车道。关闭左灯，观察并打右灯，确认安全后返回。' }
        if (currentMapScene(state).kind === 'parking') return { ...next, phase: 'secure', stopped: true, feedback: '已靠边停稳。关闭右灯，挂P挡并拉驻车制动，再点通行。' }
        return complete(next)
      }
    }
    return next
  }
  if (action.type !== 'operate' || !canMapOperate(state)) return state
  const operation = action.operation
  state = { ...state, operations: [...state.operations, { sceneId: currentMapScene(state).id, atMs: state.elapsedMs, operation }].slice(-2000) }
  if (operation === 'left' || operation === 'right') {
    const indicator = state.indicator === operation ? null : operation
    return { ...state, indicator, signalAtMs: indicator ? state.elapsedMs : null, feedback: indicator ? `${indicator === 'left' ? '左' : '右'}灯已开启，再点一次可关闭。` : state.phase === 'review' ? '转向灯已关闭，点通行继续。' : '转向灯已关闭。' }
  }
  if (state.phase === 'review') {
    if (operation !== 'go') return state
    if (state.indicator) return issue(state, 'signal-off', '完成动作后转向灯仍然亮着', '点同一盏灯关闭，再继续。', operation)
    return state.single !== null || state.index === state.route.scenes.length - 1 ? finish(state, 'passed') : enter(state, state.index + 1)
  }
  if (operation === 'park-p' || operation === 'park-brake') return state.phase !== 'secure' ? state : { ...state, gearP: operation === 'park-p' ? true : state.gearP, handbrake: operation === 'park-brake' ? true : state.handbrake, feedback: operation === 'park-p' ? '已挂P挡。' : '驻车制动已拉起。' }
  if (state.phase === 'secure') {
    if (operation !== 'go') return state
    if (state.indicator || !state.gearP || !state.handbrake) return issue(state, 'parking-secure', '停车收尾尚未完成', '关闭转向灯、挂P挡并拉驻车制动后再通行。', operation)
    return finish({ ...state, completed: [...new Set([...state.completed, currentMapScene(state).id])] }, 'passed')
  }
  if (operation === 'observe') return { ...state, observed: true, feedback: '相关方向的观察范围已展开，请自己判断通行时机。' }
  if (operation === 'slow') return { ...state, slow: true, feedback: state.stopped ? '车辆已停稳。' : '已减速，车辆以更慢的速度行驶。' }
  if (operation === 'stop') return { ...state, stopped: true, slow: true, stoppedForLook: state.phase === 'decision' || state.stoppedForLook,
    observed: currentMapScene(state).kind === 'look' && !state.stoppedForLook ? false : state.observed, feedback: '车辆已停稳，其他交通仍会继续。确认安全后点通行。' }
  if (operation !== 'go') return state
  if (state.phase === 'approach' || state.phase === 'moving') return { ...state, stopped: false, feedback: '继续缓慢行驶，请留意道路。' }
  const scene = currentMapScene(state)
  const direction = neededDirection(state)
  const failure = direction && state.indicator !== direction ? ['signal', '转向灯方向与本项行驶方向不符', `请打开${direction === 'left' ? '左' : '右'}转向灯。`]
    : direction && (state.signalAtMs === null || state.elapsedMs - state.signalAtMs < 3000) ? ['signal', '转向灯保持时间还不足3秒', '可以同时观察路况，稍候再通行。']
    : scene.kind === 'look' && !state.stoppedForLook ? ['stop', '停车瞭望前尚未在操作位置停稳', '先点击停车，再观察路口。']
    : !state.observed ? ['observe', '执行前尚未观察相关交通', '点观察，看看道路和来车情况。']
    : ['turn', 'uturn', 'parking', 'slow'].includes(scene.kind) && !state.slow ? ['slow', '通过本路段前尚未减速', '先减速，再判断通行时机。']
    : mapTraffic(state.route, state.seed, state) !== 'clear' ? ['unsafe', '交通冲突尚未解除就尝试通行', '观察并等待车辆、行人或信号变化。'] : null
  if (failure) return issue(state, failure[0], failure[1], failure[2], operation)
  return { ...state, phase: 'moving', stopped: false, feedback: '正在通行，车辆自动完成行驶轨迹。' }
}
