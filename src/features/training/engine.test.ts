import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '../content/schema'
import { activeEvent, createTrainingState, currentStep, isOperating, signalRemainingMs, stepsFor, trainingReducer, type Operation, type TrainingAction, type TrainingState } from './engine'

export function routeEvents(id = '5') {
  return calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8'))).events
}
function active(id = '5-lane-command') {
  const state = trainingReducer(createTrainingState(routeEvents()), { type: 'retry', eventId: id, preview: false, now: 0 })
  return trainingReducer(state, { type: 'seeked', positionMs: state.positionMs, now: 0 })
}
const operate = (state: TrainingState, operation: Operation, now = state.lastNowMs) => trainingReducer(state, { type: 'operate', operation, now })
const tick = (state: TrainingState, now: number) => trainingReducer(state, { type: 'tick', now })
function finish(state: TrainingState) {
  let next = state
  let guard = 0
  while (next.phase === 'practice' && guard++ < 30) {
    const step = currentStep(next)!
    next = step.operation === 'wait' ? tick(next, next.lastNowMs + next.signalWaitMs) : operate(next, step.operation)
  }
  expect(guard).toBeLessThan(30)
  return next
}

describe('practice event engine', () => {
  it('triggers the first crossed node once, including timeupdate overshoot and playback speed differences', () => {
    let state = trainingReducer(createTrainingState(routeEvents()), { type: 'start', positionMs: 0, now: 0 })
    state = trainingReducer(state, { type: 'position', positionMs: 14000, now: 500 })
    expect(state.activeId).toBe('5-exit-look')
    expect(state.positionMs).toBe(13000)
    expect(state.elapsedMs).toBe(0)
    const next = trainingReducer(state, { type: 'position', positionMs: 40000, now: 700 })
    expect(next.activeId).toBe(state.activeId)
    expect(next.elapsedMs).toBe(200)
  })
  it('does not accept stale or out-of-order actions, and will not shift into P while moving', () => {
    const state = active()
    const wrong = operate(state, 'execute', 100)
    expect(wrong.stepIndex).toBe(0)
    expect(wrong.corrections).toBe(1)
    expect(wrong.vehicle).toEqual(state.vehicle)
    const park = operate(wrong, 'gear-p', 200)
    expect(park.vehicle.gear).toBe('D')
    expect(park.feedback).toContain('尚未停稳')
    expect(operate(park, 'observe-left').stepIndex).toBe(0)
  })
  it('uses independent active milliseconds and preserves a signal on repeated clicks', () => {
    let state = operate(active(), 'signal-left', 0)
    state = operate(state, 'observe-left', 100)
    state = operate(state, 'signal-left', 1500)
    expect(state.vehicle.signalSinceMs).toBe(0)
    state = operate(state, 'execute', 2999)
    expect(currentStep(state)?.operation).toBe('wait')
    state = tick(state, 3000)
    expect(currentStep(state)?.operation).toBe('execute')
    state = operate(state, 'execute', 3000)
    expect(state.phase).toBe('practice')
    state = operate(state, 'signal-off', 3100)
    expect(state.phase).toBe('review')
    expect(state.progress['5-lane-command']).toBe('completed')
    expect(state.attempts[0]).toMatchObject({ elapsedMs: 3100, outcome: 'completed', corrections: 1 })
  })
  it('resets the current signal segment and its observations if the indicator changes', () => {
    let state = operate(active(), 'signal-left')
    state = operate(state, 'observe-left', 100)
    state = operate(state, 'signal-right', 2000)
    expect(state.stepIndex).toBe(0)
    expect(state.vehicle.observed).toEqual([])
    state = operate(state, 'signal-left', 2500)
    state = operate(state, 'observe-left', 2600)
    expect(signalRemainingMs(tick(state, 3000))).toBe(2500)
    expect(currentStep(tick(state, 5500))?.operation).toBe('execute')
  })
  it('freezes the operation clock for overlapping pause reasons and seeking, and blocks inputs', () => {
    let state = operate(active(), 'signal-left')
    state = operate(state, 'observe-left', 1000)
    const actions: TrainingAction[] = [
      { type: 'suspend', reason: 'user', value: true, now: 1000 },
      { type: 'suspend', reason: 'hidden', value: true, now: 2000 },
      { type: 'tick', now: 20000 },
      { type: 'suspend', reason: 'hidden', value: false, now: 30000 },
      { type: 'suspend', reason: 'user', value: false, now: 40000 },
    ]
    for (const action of actions) state = trainingReducer(state, action)
    expect(state.elapsedMs).toBe(1000)
    state = trainingReducer(state, { type: 'transport', seeking: true, now: 40500 })
    expect(isOperating(state)).toBe(false)
    expect(operate(state, 'brake', 50000).stepIndex).toBe(state.stepIndex)
    state = trainingReducer(state, { type: 'seeked', positionMs: state.positionMs, now: 60000 })
    expect(state.elapsedMs).toBe(1500)
    state = tick(state, 61500)
    expect(state.elapsedMs).toBe(3000)
    expect(currentStep(state)?.operation).toBe('execute')
  })
  for (const reason of ['buffering', 'map', 'media-error'] as const) {
    it(`excludes ${reason} time and rejects actions while suspended`, () => {
      let state = trainingReducer(active(), { type: 'suspend', reason, value: true, now: 500 })
      expect(operate(state, 'signal-left', 20000).stepIndex).toBe(0)
      state = trainingReducer(state, { type: 'suspend', reason, value: false, now: 30000 })
      expect(tick(state, 30500).elapsedMs).toBe(1000)
    })
  }
  it('does not count seeking across nodes as completed; rewinding reopens subsequent nodes', () => {
    let state = finish(active('5-exit-look'))
    state = trainingReducer(state, { type: 'seek', positionMs: 40000, now: state.lastNowMs })
    expect(state.phase).toBe('road')
    expect(state.progress['5-exit-look']).toBe('completed')
    expect(state.progress['5-exit-turn']).toBe('skipped')
    expect(state.progress['5-bus-1']).toBe('skipped')
    state = trainingReducer(state, { type: 'seek', positionMs: 13000, now: state.lastNowMs })
    expect(state.progress).toEqual({})
    state = trainingReducer(state, { type: 'seeked', positionMs: 13000, now: state.lastNowMs })
    state = trainingReducer(state, { type: 'position', positionMs: 13100, now: state.lastNowMs })
    expect(state.activeId).toBe('5-exit-look')
  })
  it('abandons an unfinished attempt on seeking, retaining elapsed time without a success', () => {
    let state = tick(active(), 1200)
    state = trainingReducer(state, { type: 'seek', positionMs: 0, now: 1500 })
    expect(state.attempts).toEqual([{ eventId: '5-lane-command', outcome: 'abandoned', elapsedMs: 1500, corrections: 0 }])
    expect(state.activeId).toBeNull()
    expect(state.elapsedMs).toBe(0)
  })
  it('starts single-item replay with fresh state, and only triggers the chosen event', () => {
    let state = finish(active('5-overtake'))
    state = trainingReducer(state, { type: 'retry', eventId: '5-overtake', preview: true, now: state.lastNowMs })
    expect(state.scope).toBe('5-overtake')
    expect(state.progress['5-overtake']).toBeUndefined()
    expect(state.vehicle.lane).toBe('original')
    expect(state.positionMs).toBe(activeEvent(active('5-overtake'))!.practicePauseMs - 5000)
    state = trainingReducer(state, { type: 'seeked', positionMs: state.positionMs, now: state.lastNowMs })
    state = trainingReducer(state, { type: 'position', positionMs: 453000, now: state.lastNowMs })
    expect(state.activeId).toBe('5-overtake')
    expect(state.elapsedMs).toBe(0)
    state = finish(state)
    state = trainingReducer(state, { type: 'continue', now: state.lastNowMs })
    expect(state.phase).toBe('finished')
  })
  it('requires both legs of overtaking and resets the right signal timer independently', () => {
    let state = active('5-overtake')
    state = operate(state, 'signal-left')
    state = operate(state, 'observe-left')
    state = operate(state, 'execute', 3000)
    expect(state.vehicle.lane).toBe('passing')
    expect(state.phase).toBe('practice')
    state = operate(state, 'signal-off')
    state = operate(state, 'signal-right', 4000)
    state = operate(state, 'observe-right', 4500)
    state = operate(state, 'execute', 6000)
    expect(state.vehicle.lane).toBe('passing')
    state = operate(state, 'execute', 7000)
    state = operate(state, 'signal-off')
    expect(state.vehicle.lane).toBe('original')
    expect(state.phase).toBe('review')
  })
  it('requires stopping before P and the parking brake, and does not invent reverse or engine actions', () => {
    let state = active('5-parking')
    expect(stepsFor(activeEvent(state)!).some(step => /倒车|熄火/.test(step.label))).toBe(false)
    state = operate(state, 'signal-right')
    state = operate(state, 'observe-right')
    state = operate(state, 'brake')
    state = operate(state, 'execute', 3000)
    expect(state.vehicle.motion).toBe('stopped')
    expect(operate(state, 'handbrake-on').stepIndex).toBe(state.stepIndex)
    state = operate(state, 'signal-off')
    state = operate(state, 'gear-p')
    state = operate(state, 'handbrake-on')
    expect(state.phase).toBe('review')
    expect(state.vehicle).toMatchObject({ gear: 'P', handbrake: true, motion: 'stopped', indicator: 'off' })
  })
  it('never charges road time or completed review time as operation time', () => {
    let state = trainingReducer(createTrainingState(routeEvents()), { type: 'start', positionMs: 0, now: 0 })
    state = tick(state, 50000)
    expect(state.elapsedMs).toBe(0)
    state = finish(active())
    expect(tick(state, 500000).elapsedMs).toBe(state.elapsedMs)
  })
  it('finishes a full route in order, never retriggering the just-completed node', () => {
    let state = trainingReducer(createTrainingState(routeEvents()), { type: 'start', positionMs: 0, now: 0 })
    for (const event of state.events) {
      state = trainingReducer(state, { type: 'position', positionMs: event.practicePauseMs + 250, now: state.lastNowMs + 10000 })
      expect(state.activeId).toBe(event.id)
      expect(state.vehicle).toMatchObject({ indicator: 'off', gear: 'D', brake: false, observed: [], lane: 'original' })
      state = finish(state)
      state = trainingReducer(state, { type: 'continue', now: state.lastNowMs })
      state = trainingReducer(state, { type: 'position', positionMs: event.practicePauseMs + 500, now: state.lastNowMs + 100 })
      expect(state.activeId).toBeNull()
    }
    expect(state.phase).toBe('finished')
    expect(state.vehicle).toMatchObject({ gear: 'P', handbrake: true, motion: 'stopped' })
    expect(state.attempts).toHaveLength(22)
    expect(Object.values(state.progress).every(status => status === 'completed')).toBe(true)
  })
  it('keeps full-route scope when retrying the current node, but permits an explicit standalone selection', () => {
    let state = trainingReducer(createTrainingState(routeEvents()), { type: 'start', positionMs: 0, now: 0 })
    state = trainingReducer(state, { type: 'position', positionMs: 13000, now: 1000 })
    state = finish(state)
    state = trainingReducer(state, { type: 'retry', eventId: '5-exit-look', preview: false, now: 2000 })
    expect(state.scope).toBeNull()
    expect(state.stepIndex).toBe(0)
    expect(state.progress['5-exit-look']).toBeUndefined()
    state = trainingReducer(state, { type: 'seeked', positionMs: state.positionMs, now: 2000 })
    state = finish(state)
    state = trainingReducer(state, { type: 'continue', now: 2000 })
    expect(state.phase).toBe('road')
    state = trainingReducer(state, { type: 'retry', eventId: '5-exit-look', preview: false, single: true, now: 2000 })
    expect(state.scope).toBe('5-exit-look')
  })
  it('keeps input immutable and rejects blocked, duplicate, mixed-route or unordered training data', () => {
    const events = routeEvents()
    const copy = structuredClone(events)
    const state = createTrainingState(events)
    const before = structuredClone(state)
    trainingReducer(state, { type: 'start', positionMs: 0, now: 20 })
    expect(state).toEqual(before)
    expect(events).toEqual(copy)
    expect(() => createTrainingState([{ ...events[0], timingStatus: 'needs-review', blockers: ['待核对'] }])).toThrow()
    expect(() => createTrainingState([events[0], events[0]])).toThrow()
    expect(() => createTrainingState([events[1], events[0]])).toThrow()
    expect(() => createTrainingState([events[0], routeEvents('7')[1]])).toThrow()
  })
  for (const id of ['5', '6', '7']) {
    it(`completes all published route ${id} event kinds without reusing prior vehicle state`, () => {
      const events = routeEvents(id)
      for (const event of events) {
        let state = trainingReducer(createTrainingState(events), { type: 'retry', eventId: event.id, preview: false, now: 0 })
        state = trainingReducer(state, { type: 'seeked', positionMs: state.positionMs, now: 0 })
        state = finish(state)
        expect(state.phase).toBe('review')
        expect(state.attempts).toHaveLength(1)
        expect(state.attempts[0].corrections).toBe(0)
      }
    })
  }
})
