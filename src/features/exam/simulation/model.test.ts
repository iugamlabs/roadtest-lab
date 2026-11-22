import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { loadRouteCourse, type CourseAnswers } from '@/features/memory/course/course'
import { UNKNOWN_ANSWER } from '@/features/memory/quiz/model'
import { lightingCommands } from '@/features/content/lighting-commands'
import { createLightingQuiz } from '../lighting/quiz'
import { checkpointKey, debugAttempt, newScoredAttempt, parkingDistanceChecks, roadDirection, scoredAttemptReducer, type Operation, type ScoredAttempt } from './model'
import { examRule, generalDeduction, generalFail, projectRule, subject3Rules } from './rules'
import { prepareRoadScenarios, selectLightingScenarios, simulationStages, type LightingScenario, type RoadScenario } from './scenarios'

const dark = { id: 'dark', prompt: '进入照明不良道路', initial: 'low', expected: '远光灯' } as const
const curve = { id: 'curve', prompt: '夜间通过急弯', initial: 'low', expected: '远近光灯交替' } as const
const parked = { id: 'parked', prompt: '夜间在路边临时停车', initial: 'low', expected: '示宽灯（小灯）' } as const
const lights = [dark, curve, parked] satisfies LightingScenario[]
const toggle = (field: Extract<Operation, { type: 'toggle' }>['field']): Operation => ({ type: 'toggle', field })
const operate = (attempt: ScoredAttempt, operation: Operation, activeMs = 0) =>
  scoredAttemptReducer(attempt, { type: 'operate', checkpoint: checkpointKey(attempt.step), activeMs, operation })!
const sequence = (attempt: ScoredAttempt, ...operations: Operation[]) =>
  operations.reduce((current, operation) => operate(current, operation), attempt)
const initial = (roads: RoadScenario[] = []) => newScoredAttempt(lights, roads)
const faults = (attempt: ScoredAttempt) => attempt.evidence.filter(entry => entry.violated)

function beginWalk(attempt: ScoredAttempt) {
  return sequence(attempt, { type: 'board' }, toggle('seat'), toggle('mirrors'), { type: 'confirm-identity' },
    { type: 'exit-before-walk' }, toggle('doorClosed'))
}

function reboard(attempt: ScoredAttempt) {
  return sequence(beginWalk(attempt),
    { type: 'corner', corner: '左后' }, { type: 'corner', corner: '右后' },
    { type: 'corner', corner: '右前' }, { type: 'corner', corner: '左前' }, toggle('rear'), { type: 'board' })
}

function board(attempt: ScoredAttempt) {
  return sequence(reboard(attempt), toggle('doorClosed'), toggle('belt'), { type: 'ignition' }, { type: 'begin-lighting' })
}

function startControls(attempt: ScoredAttempt, includeInstruments: boolean, releaseBrake = true) {
  let ready = attempt
  if (includeInstruments) ready = operate(ready, toggle('instruments'))
  if (releaseBrake) ready = operate(ready, toggle('parkingBrake'))
  return sequence(ready, toggle('footBrake'), { type: 'gear', gear: 'D' }, toggle('rear'), toggle('shoulder'), { type: 'signal', direction: 'left' })
}

function startParking(attempt: ScoredAttempt) {
  const ready = sequence(attempt, { type: 'signal', direction: 'right' }, toggle('rear'), toggle('shoulder'))
  return operate(ready, { type: 'begin-parking' }, 3000)
}

describe('C2 simulation assessment', () => {
  it('preserves 119 rules and replaces the 100-point clip quiz with one deductions ledger', () => {
    expect(subject3Rules.rules).toHaveLength(119)
    expect(subject3Rules.projects).toHaveLength(16)
    expect(subject3Rules.examProjects).toHaveLength(16)
    expect(examRule(generalFail + 'w').penalty).toBe('fail')
    expect(examRule(projectRule(12, 'i')).penalty).toBe(5)
    expect(examRule(projectRule(11, 'j')).penalty).toBe(10)
    expect(new Set(selectLightingScenarios(() => 0).map(item => item.id)).size).toBe(5)
  })

  it('uses the illustrated commands and actions as the entire simulation lighting pool', () => {
    const sampled = new Set<string>()
    for (let index = 0; index < 100; index++) {
      const random = () => index / 100
      const scenarios = selectLightingScenarios(random)
      expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(5)
      expect(scenarios.map(({ prompt, expected }) => [prompt, expected])).toEqual(createLightingQuiz(random).questions)
      for (const scenario of scenarios) sampled.add(scenario.prompt)
    }
    expect(sampled).toEqual(new Set(lightingCommands.map(([prompt]) => prompt)))
  })

  it('allows initial boarding for identity verification before scoring the second boarding', () => {
    const attempt = initial()
    expect(operate(attempt, { type: 'board' })).toMatchObject({
      step: { id: 'preparation', phase: 'identity' }, outcome: null, evidence: [],
    })
    const wrong = sequence(beginWalk(attempt), { type: 'corner', corner: '右前' }, { type: 'corner', corner: '左前' }, { type: 'board' })
    expect(wrong).toMatchObject({ score: 100, outcome: 'direct-fail', step: { id: 'result' }, completed: [] })
    expect(faults(wrong).map(fault => fault.clause)).toEqual([projectRule(1, 'a'), projectRule(1, 'b')])
    expect(operate(wrong, { type: 'corner', corner: '左后' })).toBe(wrong)
    expect(board(initial()).step.id).toBe('lighting')
  })

  it('keeps all recorded checkpoints and the observation when returning to the driver door', () => {
    const leftFront = { type: 'corner', corner: '左前' } as const
    const atRightFront = sequence(beginWalk(initial()), leftFront, { type: 'corner', corner: '左后' },
      { type: 'corner', corner: '右后' }, { type: 'corner', corner: '右前' })
    expect(operate(atRightFront, { type: 'board' })).toBe(atRightFront)
    expect(operate(atRightFront, toggle('rear'))).toBe(atRightFront)
    const returned = sequence(atRightFront, leftFront, toggle('rear'), leftFront)
    expect(returned.step).toMatchObject({ path: ['左前', '左后', '右后', '右前', '左前'], observed: true })
    const boarded = operate(returned, { type: 'board' })
    expect(boarded.step).toMatchObject({ phase: 'reboarded' })
    expect(faults(boarded)).toEqual([])
  })

  it('reports only the missing observation when the walk was recorded correctly', () => {
    const atDoor = sequence(beginWalk(initial()), { type: 'corner', corner: '左后' }, { type: 'corner', corner: '右后' },
      { type: 'corner', corner: '右前' }, { type: 'corner', corner: '左前' })
    const result = operate(atDoor, { type: 'board' })
    expect(faults(result).map(fault => fault.clause)).toEqual([projectRule(1, 'b')])
  })

  it('keeps a correctly checked car and a running engine through lighting into departure', () => {
    const seated = reboard(newScoredAttempt([curve], []))
    expect(operate(seated, { type: 'begin-lighting' })).toBe(seated)
    const started = sequence(seated, toggle('doorClosed'), toggle('belt'), { type: 'ignition' }, toggle('instruments'))
    const throughLights = sequence(started, { type: 'begin-lighting' }, toggle('flash'), { type: 'lighting-submit' })
    expect(throughLights).toMatchObject({ step: {
      id: 'start', seat: true, mirrors: true, doorClosed: true, belt: true, running: true, instruments: true, gear: 'P',
    }, outcome: null, score: 100, completed: ['preparation', 'lighting'] })
  })

  it('scores no high beam in darkness at minus five and preserves the first confirmed answer', () => {
    const attempt = board(initial())
    const action = { type: 'operate', activeMs: 0, checkpoint: checkpointKey(attempt.step), operation: { type: 'lighting-submit' } } as const
    const confirmed = scoredAttemptReducer(attempt, action)!
    expect(confirmed).toMatchObject({ score: 95, outcome: null, step: { id: 'lighting', index: 1 } })
    expect(confirmed.lightAnswers).toHaveLength(1)
    expect(scoredAttemptReducer(confirmed, action)).toBe(confirmed)
    expect(operate(confirmed, { type: 'lighting-submit' }).outcome).toBe('direct-fail')
  })

  it('only applies the paired temporary-parking clause when evidence is conclusive', () => {
    const start = board(newScoredAttempt([parked], []))
    const off = sequence(start, { type: 'lamp', lamp: 'off' }, { type: 'lighting-submit' })
    expect(off.lightAnswers[0].checks).toEqual([])
    expect(off.outcome).toBeNull()
    const position = sequence(start, { type: 'lamp', lamp: 'position' }, { type: 'lighting-submit' })
    expect(position.lightAnswers[0].checks[0]).toMatchObject({ clause: projectRule(12, 'h'), violated: false })
    expect(operate(start, { type: 'lighting-submit' }).outcome).toBe('direct-fail')
  })

  it('deduplicates ignition in the wrong gear while retaining both applicable clauses', () => {
    const result = sequence(reboard(initial()), { type: 'gear', gear: 'D' }, { type: 'ignition' })
    expect(result.outcome).toBe('direct-fail')
    expect(faults(result)).toMatchObject([{ clause: generalFail + 'e', relatedClauses: [projectRule(2, 'c')] }])
  })

  it('uses continuous active time, accepting exactly 3 s and rejecting 2.999 s', () => {
    const ready = startControls(debugAttempt(initial(), 'start'), false)
    expect(operate(ready, { type: 'depart' }, 2999).outcome).toBe('direct-fail')
    const atBoundary = operate(ready, { type: 'depart' }, 3000)
    expect(atBoundary).toMatchObject({ score: 95, outcome: null, step: { id: 'start', phase: 'moving' } })
    expect(faults(atBoundary).map(fault => fault.clause)).toEqual([projectRule(2, 'm')])
    const turnedOff = operate(ready, { type: 'signal', direction: null }, 2500)
    const backOn = operate(turnedOff, { type: 'signal', direction: 'left' }, 2600)
    expect(faults(operate(backOn, { type: 'depart' }, 5500)).map(entry => entry.clause)).toContain(generalFail + 'w')
  })

  it('distinguishes a corrected brake fault at 90 from continuing with the brake engaged', () => {
    const ready = startControls(debugAttempt(initial(), 'start'), true, false)
    const rolling = operate(ready, { type: 'depart' }, 3000)
    expect(rolling.step).toMatchObject({ id: 'start', phase: 'brake-engaged' })
    expect(operate(rolling, { type: 'depart' }, 3100).outcome).toBe('direct-fail')
    const corrected = operate(rolling, toggle('parkingBrake'), 3100)
    expect(corrected).toMatchObject({ score: 90, outcome: null, step: { id: 'start', phase: 'moving' } })
    const continued = sequence(corrected, { type: 'signal', direction: null }, { type: 'finish' })
    expect(continued.step.id).toBe('road')
    expect(operate(corrected, { type: 'finish' })).toMatchObject({ score: 80, outcome: 'below-threshold' })
  })

  it.each([[-1, 'c'], [0, null], [30, null], [31, 'g'], [50, 'g'], [51, 'f']])(
    'checks parking distance %s cm against the exact thresholds', (distance, expected) => {
      expect(parkingDistanceChecks(distance).filter(entry => entry.violated).map(entry => entry.clause))
        .toEqual(expected ? [projectRule(11, expected)] : [])
    },
  )

  it('counts each re-move once and ends at the second move below 90', () => {
    const aligning = startParking(debugAttempt(initial(), 'parking'))
    const moved = { type: 'adjust', delta: -10 } as const
    const stopped = sequence(aligning, moved, moved, moved, { type: 'stop' })
    const first = operate(stopped, moved)
    expect(first.score).toBe(90)
    const duplicate = { type: 'operate', checkpoint: checkpointKey(stopped.step), operation: moved, activeMs: 3100 } as const
    expect(scoredAttemptReducer(first, duplicate)).toBe(first)
    const secondStop = operate(first, { type: 'stop' })
    expect(operate(secondStop, moved)).toMatchObject({ score: 80, outcome: 'below-threshold' })
  })

  it('ends without entering parking if a road fault happens, preserving route answers so far', () => {
    const scene: RoadScenario = { kind: 'lane', direction: 'left', eventId: '5-lane-command', questionId: 'segment', title: '向左变道' }
    const attempt = debugAttempt(initial([scene]), 'road')
    const course: CourseAnswers = { questions: [], answers: [{ questionId: 'segment', selected: UNKNOWN_ANSWER, usedHint: false }] }
    const result = operate(attempt, { type: 'road-submit', course })
    expect(result).toMatchObject({ outcome: 'direct-fail', completed: [], course })
    expect(faults(result).some(fault => fault.context === scene.title)).toBe(true)
  })

  it.each(['5', '6', '7'])('completes all stages on route %s even with forgotten route answers', routeId => {
    const source = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${routeId}.events.json`, 'utf8')))
    const course = loadRouteCourse(source)!
    const roads = prepareRoadScenarios(source, course)
    const expected = routeId === '5' ? 11 : 10
    expect(roads).toHaveLength(expected)
    expect(roads.filter(scene => scene.eventId).every(scene => !source.excludedEventIds.includes(scene.eventId!))).toBe(true)
    const answers: CourseAnswers = {
      questions: course.questions,
      answers: course.questions.map(question => ({ questionId: question.id, selected: UNKNOWN_ANSWER, usedHint: false })),
    }
    const lighting = sequence(board(initial(roads)), { type: 'lamp', lamp: 'high' }, { type: 'lighting-submit' },
      toggle('flash'), { type: 'lighting-submit' }, { type: 'lamp', lamp: 'position' }, { type: 'lighting-submit' })
    const started = operate(startControls(lighting, true), { type: 'depart' }, 3000)
    let attempt = sequence(started, { type: 'signal', direction: null }, { type: 'finish' })
    for (const scene of roads) {
      const direction = roadDirection(scene, 'approach')
      if (direction) attempt = operate(attempt, { type: 'signal', direction })
      attempt = sequence(attempt, toggle('rear'), toggle('shoulder'), toggle('traffic'), toggle('slow'), toggle('keepRight'), toggle('yielded'))
      attempt = operate(attempt, { type: 'road-submit', course: answers }, 3000)
      if (scene.kind === 'overtake') {
        attempt = sequence(attempt, { type: 'signal', direction: 'right' }, toggle('rear'), toggle('shoulder'))
        attempt = operate(attempt, { type: 'road-submit', course: answers }, 3000)
      }
      if (direction) attempt = sequence(attempt, { type: 'signal', direction: null }, { type: 'road-next', course: answers })
    }
    const parking = startParking(operate(attempt, { type: 'road-finish', course: answers }))
    const move = { type: 'adjust', delta: -10 } as const
    const final = sequence(parking, move, move, move, { type: 'stop' }, toggle('parkingBrake'), toggle('footBrake'),
      { type: 'gear', gear: 'P' }, { type: 'signal', direction: null }, { type: 'ignition' },
      toggle('exitObserved'), { type: 'alight' }, toggle('doorClosed'), { type: 'finish' })
    expect(final).toMatchObject({ score: 100, outcome: 'completed', step: { id: 'result' }, course: answers })
    expect(final.completed).toEqual(simulationStages.map(stage => stage.id))
    expect(faults(final)).toEqual([])
  })
})
