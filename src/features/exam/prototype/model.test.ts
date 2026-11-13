import { describe, expect, it } from 'vitest'
import { carPose, createPrototype, prototypeReducer, trafficBusy, type PrototypeState, type PrototypeOperation } from './model'
const operate = (state: PrototypeState, operation: PrototypeOperation) => prototypeReducer(state, { type: 'operate', operation })
function wait(state: PrototypeState, ms: number) { let next = state; for (let time = 0; time < ms; time += 100) next = prototypeReducer(next, { type: 'tick', deltaMs: 100 }); return next }
const start = (fragment: 'turn' | 'lane' = 'turn') => prototypeReducer(createPrototype(fragment), { type: 'start' })

describe('comfortable 2D interaction prototype', () => {
  it('waits at the decision point indefinitely without failing or moving past it', () => {
    const state = wait(start(), 60000)
    expect(state.phase).toBe('decision')
    expect(carPose(state)).toEqual({ x: 280, y: 360, angle: 0 })
  })
  it('keeps other traffic moving when the learner stops, but freezes everything on manual pause', () => {
    let state = operate(wait(start(), 1000), 'stop')
    const pose = carPose(state)
    state = wait(state, 18000)
    expect(carPose(state)).toEqual(pose)
    expect(trafficBusy(state)).toBe(false)
    state = prototypeReducer(state, { type: 'pause', value: true })
    expect(wait(state, 10000)).toEqual(state)
  })
  it('allows observation and signal waiting in parallel and completes a right turn with the same go control', () => {
    let state = operate(operate(operate(start(), 'right'), 'observe'), 'slow')
    state = wait(state, 24000)
    state = operate(state, 'go')
    expect(state.phase).toBe('moving')
    state = wait(state, 3300)
    expect(state.phase).toBe('complete')
    expect(carPose(state)).toEqual({ x: 600, y: 280, angle: 90 })
    expect(operate(state, 'right').indicator).toBeNull()
  })
  it('blocks an unsafe lane change until traffic has passed without expiring the observation', () => {
    let state = operate(operate(start('lane'), 'left'), 'observe')
    state = wait(state, 12000)
    expect(operate(state, 'go').phase).toBe('decision')
    state = operate(wait(state, 8000), 'go')
    expect(state.phase).toBe('moving')
    expect(carPose(wait(state, 3300))).toEqual({ x: 240, y: 200, angle: expect.any(Number) })
  })
  it('allows stopping and resuming an approach or a maneuver without adding controls', () => {
    let state = operate(wait(start(), 3000), 'stop')
    expect(wait(state, 1000).progress).toBe(state.progress)
    state = operate(state, 'go')
    expect(wait(state, 1000).progress).toBeGreaterThan(state.progress)
  })
  it('pauses on a long UI stall rather than skipping road positions', () => {
    const state = prototypeReducer(start(), { type: 'tick', deltaMs: 5000 })
    expect(state.paused).toBe(true)
    expect(state.progress).toBe(0)
    const ready = prototypeReducer(createPrototype('turn'), { type: 'pause', value: true })
    expect(prototypeReducer(ready, { type: 'start' }).paused).toBe(false)
  })
})
