export type Fragment = 'turn' | 'lane'
export type PrototypeOperation = 'left' | 'right' | 'observe' | 'slow' | 'stop' | 'go'
export interface PrototypeState {
  fragment: Fragment
  phase: 'ready' | 'approach' | 'decision' | 'moving' | 'complete'
  paused: boolean
  elapsedMs: number
  progress: number
  maneuver: number
  indicator: 'left' | 'right' | null
  signalAtMs: number | null
  observed: boolean
  slow: boolean
  stopped: boolean
  feedback: string
}
export type PrototypeAction = { type: 'tick'; deltaMs: number } | { type: 'operate'; operation: PrototypeOperation } | { type: 'start' } | { type: 'pause'; value: boolean }
export const fragments = {
  turn: { title: '右转进入工业区', command: '前方路口右转。', direction: 'right', reference: '5-industrial-turn' },
  lane: { title: '大学路向左变道', command: '请向左变更车道。', direction: 'left', reference: '5-lane-command' },
} as const
export function createPrototype(fragment: Fragment): PrototypeState {
  return { fragment, phase: 'ready', paused: false, elapsedMs: 0, progress: 0, maneuver: 0, indicator: null, signalAtMs: null, observed: false, slow: false, stopped: false, feedback: '点击开始体验，车辆会缓慢驶向操作位置。' }
}
export function trafficBusy(state: PrototypeState) { return state.elapsedMs < 18000 }
export function prototypeReducer(state: PrototypeState, action: PrototypeAction): PrototypeState {
  if (action.type === 'start') return state.phase === 'ready' ? { ...state, phase: 'approach', paused: false, feedback: '车辆缓慢行驶中，可以提前打灯、观察；到操作位置后会等待。' } : state
  if (action.type === 'pause') return { ...state, paused: action.value }
  if (action.type === 'tick') {
    if (state.paused || state.phase === 'ready' || state.phase === 'complete') return state
    if (action.deltaMs > 1500) return { ...state, paused: true }
    const delta = Math.max(0, action.deltaMs)
    const next = { ...state, elapsedMs: state.elapsedMs + delta }
    if (state.phase === 'approach' && !state.stopped) {
      next.progress = Math.min(1, state.progress + delta / (state.slow ? 24000 : 12000))
      if (next.progress >= 1 - 1e-8) return { ...next, progress: 1, phase: 'decision', feedback: '已到操作位置，车辆在这里等你。可以慢慢观察、准备。' }
    }
    if (state.phase === 'moving' && !state.stopped) {
      next.maneuver = Math.min(1, state.maneuver + delta / 3200)
      if (next.maneuver >= 1 - 1e-8) return { ...next, maneuver: 1, phase: 'complete', feedback: state.fragment === 'turn' ? '右转完成。点一下右灯关闭，再试试变道。' : '已进入左侧车道。点一下左灯关闭，可以再练一次。' }
    }
    return next
  }
  const operation = action.operation
  if (state.phase === 'ready' || state.paused) return state
  if (operation === 'left' || operation === 'right') {
    const indicator = state.indicator === operation ? null : operation
    return { ...state, indicator, signalAtMs: indicator ? state.elapsedMs : null,
      feedback: indicator ? `${indicator === 'left' ? '左' : '右'}灯已开启，再点一次可关闭。可以同时观察和减速。` : '转向灯已关闭。' }
  }
  if (state.phase === 'complete') return state
  if (operation === 'observe') return { ...state, observed: true, feedback: state.fragment === 'turn' ? '请观察路口和人行横道，自己判断通行时机。' : '左侧观察范围已展开，请留意左后方来车。' }
  if (operation === 'slow') return { ...state, slow: true, feedback: state.stopped ? '车辆已停稳。准备好后点击通行。' : '已减速，车辆以更慢的速度前进。' }
  if (operation === 'stop') return { ...state, stopped: true, slow: true, feedback: '车辆已停稳，其他交通仍会继续。确认安全后点通行。' }
  if (state.phase === 'approach' || state.phase === 'moving') return { ...state, stopped: false, feedback: state.phase === 'approach' ? '继续缓慢靠近操作位置。' : '继续完成车辆动作。' }
  const expected = fragments[state.fragment].direction
  const feedback = state.indicator !== expected ? `请先打开${expected === 'left' ? '左' : '右'}转向灯。`
    : state.signalAtMs === null || state.elapsedMs - state.signalAtMs < 3000 ? '转向灯还需保持片刻，可以先观察路况。'
    : !state.observed ? '请先点观察，看看相关方向的交通情况。'
    : state.fragment === 'turn' && !state.slow ? '转弯前请先减速。'
    : trafficBusy(state) ? state.fragment === 'turn' ? '人行横道上还有行人，请停车等待。' : '左侧仍有来车，请等待车辆通过。'
    : ''
  return feedback ? { ...state, feedback } : { ...state, phase: 'moving', stopped: false, feedback: '正在通行，车辆会自动完成轨迹。' }
}

export function carPose(state: PrototypeState) {
  if (state.phase !== 'moving' && state.phase !== 'complete') return { x: 280, y: 540 - state.progress * 180, angle: 0 }
  const t = state.maneuver
  if (state.fragment === 'lane') return { x: 280 - 40 * (t * t * (3 - 2 * t)), y: 360 - t * 160, angle: -Math.sin(t * Math.PI) * 16 }
  // First approach the corner, follow a quarter-circle, then travel east.
  if (t < .25) return { x: 280, y: 360 - t / .25 * 50, angle: 0 }
  if (t < .6) { const a = (t - .25) / .35 * Math.PI / 2; return { x: 310 - 30 * Math.cos(a), y: 310 - 30 * Math.sin(a), angle: a * 180 / Math.PI } }
  return { x: 310 + (t - .6) / .4 * 290, y: 280, angle: 90 }
}
