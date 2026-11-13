import { describe, expect, it } from 'vitest'
import { createMapSession, currentMapScene, mapCarPose, mapReducer, mapTraffic, type MapOperation, type MapState } from './model'
import { mapRoute } from './routes'
import { distance, onRoad, pathLength, poseAt } from './geometry'
import { mapResult, mapResultSchema, readMapHistory, saveMapResult, MAP_HISTORY_KEY } from './history'

const operate = (state: MapState, operation: MapOperation) => mapReducer(state, { type: 'operate', operation })
function wait(state: MapState, ms: number) { let next = state; for (let time = 0; time < ms; time += 100) next = mapReducer(next, { type: 'tick', deltaMs: 100 }); return next }
function start(id: '5' | '6' | '7' = '5', mode: MapState['mode'] = 'practice', seed = 0, single?: string) { return mapReducer(createMapSession(id, seed, mode, false, single), { type: 'start' }) }
function finishScene(input: MapState) {
  let state = wait(input, 25000)
  const scene = currentMapScene(state)
  if (scene.kind === 'look') state = operate(state, 'stop')
  if (scene.direction || scene.kind === 'overtake') state = operate(state, scene.kind === 'overtake' ? 'left' : scene.direction!)
  state = operate(operate(state, 'slow'), 'observe')
  state = operate(wait(state, 4000), 'go')
  state = wait(state, 5000)
  if (scene.kind === 'overtake') {
    expect(state.leg).toBe(1)
    state = operate(operate(state, 'left'), 'right')
    state = operate(state, 'observe')
    state = operate(wait(state, 12000), 'go')
    state = wait(state, 5000)
  }
  if (state.indicator) state = operate(state, state.indicator)
  if (state.phase === 'secure') state = operate(operate(state, 'park-p'), 'park-brake')
  return operate(state, 'go')
}
describe('three continuous 2D routes', () => {
  it('places every authored project on connected roads, preserving sequence and complete coverage', () => {
    for (const id of ['5', '6', '7'] as const) {
      const route = mapRoute(id)
      expect(route.scenes.length).toBe(id === '6' ? 20 : 22)
      let previous = route.trace[0]
      for (const scene of route.scenes) {
        expect(distance(previous, scene.approach[0])).toBeLessThan(.001)
        expect(distance(scene.approach.at(-1)!, scene.actions[0][0])).toBeLessThan(.001)
        for (let i = 0; i < scene.actions.length; i++) {
          if (i) expect(distance(scene.actions[i - 1].at(-1)!, scene.actions[i][0])).toBeLessThan(.001)
          for (const p of scene.actions[i]) expect(onRoad(p), scene.id).toBe(true)
        }
        for (const path of [scene.approach, ...scene.actions]) for (let sample = 0; sample <= 10; sample++) expect(onRoad(poseAt(path, sample / 10)), scene.id).toBe(true)
        previous = scene.actions.at(-1)!.at(-1)!
      }
      expect(pathLength(route.trace)).toBeGreaterThan(1500)
    }
  })
  it('uses the same geometry for path and heading, including left/right lane changes', () => {
    for (const id of ['5', '6', '7'] as const) for (const scene of mapRoute(id).scenes) {
      const path = scene.actions[0]
      expect(poseAt(path, 0)).toMatchObject(path[0])
      expect(poseAt(path, 1)).toMatchObject(path.at(-1)!)
      if (scene.kind !== 'lane') continue
      const first = path[0], second = path[1], end = path.at(-1)!
      const incoming = scene.approach.length > 1 && pathLength(scene.approach) > 0 ? poseAt(scene.approach, 1).angle * Math.PI / 180 : Math.atan2(second.x - first.x, first.y - second.y)
      const cross = Math.sin(incoming) * (end.y - first.y) + Math.cos(incoming) * (end.x - first.x)
      expect(scene.direction === 'left' ? cross < 0 : cross > 0, scene.id).toBe(true)
    }
  })
  it('completes all three full routes across seeds with both overtake phases and parking closure', () => {
    for (const id of ['5', '6', '7'] as const) for (const seed of [0, 42, 0xffffffff]) {
      let state = start(id, 'assessment', seed)
      let guard = 0
      while (state.phase !== 'finished' && guard++ < 25) state = finishScene(state)
      expect(state.outcome, JSON.stringify(state.faults)).toBe('passed')
      expect(state.score).toBe(100)
      expect(state.completed.length).toBe(state.route.scenes.length)
      expect(state.gearP && state.handbrake).toBe(true)
    }
  })
  it('waits indefinitely at each decision and preserves the car position while traffic clears', () => {
    let state = wait(start(), 12500)
    const pose = mapCarPose(state.route, state)
    state = wait(state, 120000)
    expect(state.phase).toBe('decision')
    expect(mapCarPose(state.route, state)).toEqual(pose)
    expect(state.score).toBe(100)
    expect(mapTraffic(state.route, state.seed, state)).toBe('clear')
  })
  it('does not drive a zero-length approach through the next turn before the learner acts', () => {
    let state = finishScene(start())
    expect(state.index).toBe(1)
    expect(state.phase).toBe('decision')
    const previousEnd = state.route.scenes[0].actions[0].at(-1)!
    expect(mapCarPose(state.route, state)).toMatchObject(previousEnd)
    state = wait(state, 10000)
    expect(mapCarPose(state.route, state)).toMatchObject(previousEnd)
    expect(state.maneuver).toBe(0)
  })
  it('allows all six controls to prepare in parallel without an observation expiry', () => {
    let state = start('5', 'practice', 42, 'scene-5-industrial-turn')
    state = operate(operate(operate(state, 'right'), 'observe'), 'slow')
    state = wait(state, 90000)
    state = operate(state, 'go')
    expect(state.phase).toBe('moving')
    expect(state.faults).toEqual([])
  })
  it('rechecks live traffic at the action, records it reproducibly, and allows safe recovery', () => {
    let state = start('5', 'assessment', 0, 'scene-5-lane-command')
    for (let seed = 0; seed < 30; seed++) {
      const candidate = wait(operate(operate(start('5', 'assessment', seed, 'scene-5-lane-command'), 'left'), 'observe'), 12500)
      if (mapTraffic(candidate.route, seed, candidate) === 'rear-left') { state = candidate; break }
    }
    expect(mapTraffic(state.route, state.seed, state)).toBe('rear-left')
    state = operate(state, 'go')
    expect(state.score).toBe(90)
    expect(state.phase).toBe('decision')
    expect(mapTraffic(state.route, state.seed, state.faults[0].snapshot)).toBe('rear-left')
    state = operate(wait(state, 6000), 'go')
    expect(state.phase).toBe('moving')
    expect(state.score).toBe(90)
  })
  it('distinguishes stopping the car from pausing the whole world, and makes background return manual', () => {
    let state = operate(wait(start(), 2000), 'stop')
    const pose = mapCarPose(state.route, state)
    state = wait(state, 20000)
    expect(mapCarPose(state.route, state)).toEqual(pose)
    expect(state.stageMs).toBe(22000)
    state = mapReducer(state, { type: 'pause', reason: 'hidden', value: true })
    expect(wait(state, 10000)).toEqual(state)
    state = mapReducer(state, { type: 'pause', reason: 'hidden', value: false })
    expect(state.pauses).toEqual(['user'])
  })
  it('keeps practice unscored, deduplicates assessment mistakes and ends immediately below 90', () => {
    let practice = wait(start(), 25000)
    practice = operate(operate(practice, 'go'), 'go')
    expect(practice.score).toBe(100)
    expect(practice.corrections).toBe(2)
    let exam = wait(start('5', 'assessment'), 25000)
    exam = operate(exam, 'go')
    expect(exam.score).toBe(90)
    expect(exam.phase).toBe('decision')
    expect(operate(exam, 'go').score).toBe(90)
    exam = operate(operate(exam, 'stop'), 'go')
    expect(exam.score).toBe(80)
    expect(exam.outcome).toBe('failed')
  })
  it('can complete a whole route at exactly 90 after one corrected mistake', () => {
    let state = operate(wait(start('6', 'assessment'), 25000), 'go')
    while (state.phase !== 'finished') state = finishScene(state)
    expect(state.outcome).toBe('passed')
    expect(state.score).toBe(90)
  })
  it('freezes speech and ignores stale callbacks without releasing user pause', () => {
    let state = mapReducer(createMapSession('5', 0, 'practice', true), { type: 'start' })
    expect(wait(state, 15000).progress).toBe(0)
    const id = state.announcement!.id
    state = mapReducer(state, { type: 'speech-error', id })
    expect(state.pauses).toContain('voice-error')
    state = mapReducer(state, { type: 'pause', reason: 'user', value: true })
    state = mapReducer(state, { type: 'retry-speech' })
    state = mapReducer(state, { type: 'speech-end', id })
    expect(state.announcement).not.toBeNull()
    state = mapReducer(state, { type: 'text-only' })
    expect(state.pauses).toEqual(['user'])
  })
  it('treats replay as an independent single project and does not continue the full route', () => {
    const state = finishScene(start('7', 'practice', 0, 'scene-7-uturn-2'))
    expect(state.phase).toBe('finished')
    expect(state.completed).toEqual(['scene-7-uturn-2'])
    expect(() => mapResult(state, 'single')).toThrow()
  })
  it('validates and keeps separate local 2D history with score and route boundaries', () => {
    let state = start('5', 'assessment')
    state = mapReducer(state, { type: 'abort' })
    const record = mapResult(state, 'test')
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    for (let i = 0; i < 15; i++) saveMapResult(storage, { ...record, id: `session-${i}` })
    expect(readMapHistory(storage)).toHaveLength(12)
    expect(readMapHistory(storage)[0].id).toBe('session-14')
    expect(mapResultSchema.safeParse({ ...record, score: 90 }).success).toBe(false)
    storage.setItem(MAP_HISTORY_KEY, 'broken')
    expect(readMapHistory(storage)).toEqual([])
    expect(saveMapResult({ getItem: () => null, setItem: () => { throw Error('quota') } }, record)).toBe(false)
  })
})
