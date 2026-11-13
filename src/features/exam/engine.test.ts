import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { RouteId } from '../content/schema'
import { activeScene, canOperate, createExam, examReducer, hazardActive, makePlan, signalRemaining, type ExamOperation, type ExamState } from './engine'
import { scenarioRoutes } from './routes'

const operation = (state: ExamState, value: ExamOperation) => examReducer(state, { type: 'operate', operation: value, now: state.lastNowMs })
function ticks(state: ExamState, ms: number) {
  let next = state
  for (let remaining = ms; remaining > 0; remaining -= 100) next = examReducer(next, { type: 'tick', now: next.lastNowMs + Math.min(100, remaining) })
  return next
}
function start(route: RouteId = '5', seed = 42, single?: string, voice = false) {
  return examReducer(createExam(route, seed, 0, voice, single), { type: 'start', now: 0 })
}
function atDecision(state: ExamState) {
  let next = state
  while (next.distance < 64 && next.phase === 'running') next = ticks(next, 100)
  return operation(next, 'stop')
}
function safe(state: ExamState) {
  let next = state
  let guard = 0
  while (hazardActive(activeScene(next), next) !== 'clear' && guard++ < 250) next = ticks(next, 100)
  expect(guard).toBeLessThan(250)
  return next
}
function finishCurrent(input: ExamState): ExamState {
  let state = atDecision(input)
  const scene = activeScene(state)
  const index = state.sceneIndex
  state = safe(state)
  if (scene.kind === 'slow' || scene.kind === 'straight') {
    state = operation(state, 'observe-front')
    state = operation(state, 'resume')
    if (scene.kind === 'slow') state = operation(state, 'brake')
  } else if (scene.kind === 'look') {
    state = operation(operation(state, 'observe-left'), 'observe-right')
    state = operation(state, 'proceed')
  } else {
    const direction = scene.kind === 'overtake' ? 'left' : scene.direction!
    state = operation(state, direction === 'left' ? 'signal-left' : 'signal-right')
    state = ticks(state, 3000)
    state = operation(state, direction === 'left' ? 'observe-left' : 'observe-right')
    state = operation(state, direction)
    if (scene.kind === 'overtake') {
      state = ticks(state, 1800)
      expect(state.leg).toBe('return')
      state = operation(operation(state, 'signal-off'), 'stop')
      state = safe(state)
      state = operation(state, 'signal-right')
      state = ticks(state, 3000)
      state = operation(operation(state, 'observe-right'), 'right')
    }
    if (scene.kind === 'parking') {
      state = ticks(state, 1800)
      expect(state.leg).toBe('secure')
      state = operation(operation(operation(state, 'signal-off'), 'gear-p'), 'handbrake-on')
    }
  }
  let guard = 0
  while (state.phase === 'running' && state.sceneIndex === index && guard++ < 350) state = ticks(state, 100)
  expect(guard, `${scene.id}: ${state.feedback}`).toBeLessThan(350)
  return state.phase === 'running' ? operation(state, 'signal-off') : state
}

describe('route-based independent scenario plans', () => {
  it('preserves the published route references in order without consuming media times or opening excluded nodes', () => {
    for (const route of scenarioRoutes) {
      const media = JSON.parse(readFileSync(`public/data/route-${route.id}.events.json`, 'utf8'))
      expect(route.scenes.flatMap(scene => scene.referenceId ? [scene.referenceId] : [])).toEqual(media.events.map((event: { id: string }) => event.id))
      for (const scene of route.scenes) {
        if (!scene.referenceId) continue
        const reference = media.events.find((event: { id: string }) => event.id === scene.referenceId)
        expect(scene.direction).toBe(reference.direction)
        expect(scene.category).toBe(reference.category)
        expect(scene).not.toHaveProperty('practicePauseMs')
        expect(media.excludedEventIds).not.toContain(scene.referenceId)
      }
    }
    expect(scenarioRoutes.map(route => route.scenes.length)).toEqual([22, 20, 22])
    expect(scenarioRoutes[2].scenes.filter(scene => scene.kind === 'uturn')).toHaveLength(2)
  })
  it('produces reproducible, constrained traffic and keeps silent observations silent', () => {
    expect(makePlan('5', 42)).toEqual(makePlan('5', 42))
    expect(makePlan('5', 42)).not.toEqual(makePlan('5', 43))
    for (const route of scenarioRoutes) for (let seed = 0; seed < 30; seed++) for (const scene of makePlan(route.id, seed)) {
      if (scene.category !== 'command') expect(scene.command).toBe('')
      if (scene.hazard.kind.startsWith('rear')) expect(['lane', 'overtake']).toContain(scene.kind)
      if (scene.hazard.kind !== 'clear') expect(scene.hazard.untilMs).toBeGreaterThanOrEqual(14000)
    }
  })
  it('allows every full route to be completed safely at 100 across different traffic seeds', () => {
    for (const route of scenarioRoutes) for (const seed of [0, 1, 42, 83, 256, 0xffffffff]) {
      let state = start(route.id, seed)
      let guard = 0
      while (state.phase === 'running' && guard++ < 30) state = finishCurrent(state)
      expect(state.faults, `${route.id}/${seed}`).toEqual([])
      expect(state.outcome).toBe('passed')
      expect(state.score).toBe(100)
      expect(state.completed).toHaveLength(route.scenes.length)
    }
  })
})

describe('scenario operations and scoring', () => {
  it('stops ego movement but advances other traffic without a waiting penalty', () => {
    let state = atDecision(start())
    const distance = state.distance
    state = ticks(state, 60000)
    expect(state.distance).toBe(distance)
    expect(state.stageMs).toBeGreaterThan(60000)
    expect(hazardActive(activeScene(state), state)).toBe('clear')
    expect(state.faults).toEqual([])
  })
  it('deduplicates the same violation and ends immediately only below 90', () => {
    let state = operation(start(), 'right')
    expect(state.score).toBe(90)
    expect(state.phase).toBe('running')
    state = operation(state, 'right')
    expect(state.score).toBe(90)
    expect(state.faults).toHaveLength(1)
    state = operation(state, 'gear-p')
    expect(state.score).toBe(80)
    expect(state.phase).toBe('finished')
    expect(state.outcome).toBe('failed')
    const after = operation(state, 'signal-left')
    expect(after.vehicle.indicator).toBe('off')
    expect(after.operations).toHaveLength(state.operations.length)
  })
  it('can recover from one mistake, finish all projects and pass at exactly 90', () => {
    let state = operation(start(), 'right')
    while (state.phase === 'running') state = finishCurrent(state)
    expect(state.score).toBe(90)
    expect(state.outcome).toBe('passed')
  })
  it('does not cascade an uncorrected mistake into an extra missed-project fine', () => {
    let state = operation(start('5', 1, 'scene-5-lane-command'), 'left')
    expect(state.score).toBe(90)
    state = ticks(state, 12000)
    expect(state.faults).toHaveLength(1)
    expect(state.outcome).toBe('passed')
    expect(state.completed).toEqual([])
  })
  it('checks current traffic at execution rather than accepting an observation click as safety', () => {
    let state = atDecision(start('5', 0, 'scene-5-lane-command'))
    // Use a guaranteed matching traffic plan, leaving the route and scoring unchanged.
    state = { ...state, scenes: state.scenes.map(scene => ({ ...scene, hazard: { kind: 'rear-left', untilMs: 18000, returnBusyMs: 0 } })) }
    state = operation(state, 'signal-left')
    state = ticks(state, 3000)
    state = operation(operation(state, 'observe-left'), 'left')
    expect(state.score).toBe(90)
    expect(state.maneuver).toBeNull()
    expect(state.vehicle.lane).toBe(1)
    state = safe(state)
    state = operation(operation(state, 'observe-left'), 'left')
    state = ticks(state, 1800)
    expect(state.vehicle.lane).toBe(0)
    expect(state.outcome).toBe('passed')
  })
  it('rejects expired observations and retains turn signals across project boundaries', () => {
    let state = safe(atDecision(start('5', 42, 'scene-5-industrial-turn')))
    state = operation(operation(state, 'signal-right'), 'observe-right')
    state = ticks(state, 9000)
    state = operation(state, 'right')
    expect(state.faults[0].rule).toBe('observation')
    state = operation(operation(state, 'observe-right'), 'right')
    expect(state.maneuver?.direction).toBe('right')
    state = ticks(state, 1800)
    expect(state.vehicle.heading).toBe(90)
    expect(state.vehicle.indicator).toBe('right')
  })
  it('does not reset a signal timer on repeated clicks and resets it on direction changes', () => {
    let state = operation(start(), 'signal-left')
    state = ticks(state, 2000)
    state = operation(state, 'signal-left')
    expect(signalRemaining(state)).toBe(1000)
    state = operation(state, 'signal-right')
    expect(signalRemaining(state)).toBe(3000)
  })
  it('blocks a dangerous crossing, retains its evidence, and does not repeatedly fine at the same boundary', () => {
    let state = start('5', 0, 'scene-5-cross-2')
    state = { ...state, scenes: state.scenes.map(scene => ({ ...scene, hazard: { kind: 'pedestrian', untilMs: 18000, returnBusyMs: 0 } })) }
    state = ticks(state, 10000)
    expect(state.distance).toBe(79)
    expect(state.vehicle.speed).toBe(0)
    expect(state.score).toBe(90)
    expect(state.faults[0].snapshot.stageMs).toBe(10000)
    state = ticks(operation(state, 'resume'), 200)
    expect(state.score).toBe(90)
    expect(state.distance).toBe(79)
  })
  it('requires both observation directions after stopping at a look point', () => {
    let state = safe(atDecision(start()))
    state = operation(operation(state, 'observe-left'), 'proceed')
    expect(state.faults[0].rule).toBe('observation')
    state = operation(operation(state, 'observe-right'), 'proceed')
    expect(state.maneuver).not.toBeNull()
  })
  it('does not carry a phantom signal-close deadline from a look point into the next turn', () => {
    let state = safe(atDecision(start()))
    state = operation(operation(operation(state, 'observe-left'), 'observe-right'), 'proceed')
    state = ticks(state, 1800)
    expect(activeScene(state).kind).toBe('turn')
    expect(state.closeSignalBy).toBeNull()
    state = atDecision(state)
    state = operation(state, 'signal-right')
    state = ticks(state, 3000)
    expect(state.faults).toEqual([])
  })
  it('finishes parking when the safe stationary conditions are met in either closing order', () => {
    let state = safe(atDecision(start('5', 42, 'scene-5-parking')))
    state = operation(state, 'signal-right')
    state = ticks(state, 3000)
    state = operation(operation(state, 'observe-right'), 'right')
    state = ticks(state, 1800)
    state = operation(operation(state, 'gear-p'), 'handbrake-on')
    expect(state.phase).toBe('running')
    state = operation(state, 'signal-off')
    expect(state.outcome).toBe('passed')
    expect(state.score).toBe(100)
  })
  it('keeps the final result announcement when the last scene was missed', () => {
    let state = start('5', 1, 'scene-5-lane-command')
    state = ticks(state, 12000)
    expect(state.phase).toBe('finished')
    expect(state.lastCommand).toContain('场景考试合格')
  })
})

describe('exam clocks and speech lifecycle', () => {
  it('freezes vehicle, traffic and signal timing during manual/dialog/background pauses and requires manual return', () => {
    let state = operation(start(), 'signal-left')
    state = ticks(state, 1000)
    state = examReducer(state, { type: 'suspend', reason: 'hidden', value: true, now: 1000 })
    const frozen = { distance: state.distance, time: state.stageMs, signal: signalRemaining(state) }
    state = ticks(state, 10000)
    state = examReducer(state, { type: 'suspend', reason: 'hidden', value: false, now: state.lastNowMs })
    expect(state.suspensions).toContain('user')
    expect(state.distance).toBe(frozen.distance)
    expect(state.stageMs).toBe(frozen.time)
    expect(signalRemaining(state)).toBe(frozen.signal)
    state = examReducer(state, { type: 'suspend', reason: 'user', value: false, now: state.lastNowMs })
    expect(canOperate(state)).toBe(true)
  })
  it('does not let a delayed UI tick move through a decision zone or count pause time', () => {
    let state = examReducer(start(), { type: 'tick', now: 30000 })
    expect(state.suspensions).toContain('user')
    expect(state.elapsedMs).toBe(0)
    expect(state.distance).toBe(0)
    expect(state.faults).toEqual([])
    state = examReducer(state, { type: 'tick', now: 1000 })
    expect(state.lastNowMs).toBe(30000)
  })
  it('waits for speech completion, ignores stale callbacks, and preserves other suspension reasons', () => {
    let state = start('5', 42, undefined, true)
    const id = state.announcement!.id
    state = ticks(state, 10000)
    expect(state.distance).toBe(0)
    state = examReducer(state, { type: 'suspend', reason: 'user', value: true, now: state.lastNowMs })
    state = examReducer(state, { type: 'speech-end', id: id - 1, now: state.lastNowMs })
    expect(state.suspensions).toContain('speech')
    state = examReducer(state, { type: 'speech-end', id, now: state.lastNowMs })
    expect(state.suspensions).toEqual(['user'])
  })
  it('does not score a speech failure and supports explicit retry or text fallback', () => {
    let state = start('5', 42, undefined, true)
    state = examReducer(state, { type: 'speech-error', id: state.announcement!.id, now: 0 })
    state = ticks(state, 10000)
    expect(state.score).toBe(100)
    expect(state.distance).toBe(0)
    const old = state.announcement!.id
    state = examReducer(state, { type: 'retry-speech', now: state.lastNowMs })
    expect(state.announcement!.id).toBeGreaterThan(old)
    state = examReducer(state, { type: 'text-only', now: state.lastNowMs })
    expect(state.voice).toBe(false)
    expect(state.announcement).toBeNull()
    expect(canOperate(state)).toBe(true)
  })
})
