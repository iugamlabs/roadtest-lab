import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { lightingCommands } from '@/features/content/lighting-commands'
import { calibratedEventDocumentSchema } from '@/features/content/schema'
import { loadRouteCourse, type CourseAnswers } from '@/features/memory/course/course'
import { UNKNOWN_ANSWER } from '@/features/memory/quiz/model'
import { checkpointKey, newSimulationAttempt, simulationReducer, type Operation, type SimulationAttempt } from './model'
import { examRule, projectRule, subject3Rules } from './rules'
import { selectLightingScenarios, simulationStages, type LightingScenario } from './scenarios'

const dark = { id: 'dark', prompt: '进入照明不良道路', initial: 'low', expected: '远光灯' } as const
const parked = { id: 'parked', prompt: '夜间在路边临时停车', initial: 'low', expected: '示宽灯（小灯）' } as const
const confirm = { type: 'confirm-guide' } as const
const submit = { type: 'lighting-submit' } as const
const lightsOff = { type: 'lamp', lamp: 'off' } as const
const operate = (attempt: SimulationAttempt, operation: Operation) =>
  simulationReducer(attempt, { type: 'operate', checkpoint: checkpointKey(attempt.step), operation })!
const sequence = (attempt: SimulationAttempt, ...operations: Operation[]) => operations.reduce(operate, attempt)

describe('C2 flow simulation', () => {
  it('keeps the illustrated command pool and uses a fixed opening plus five distinct commands', () => {
    expect(subject3Rules.rules).toHaveLength(119)
    const sampled = new Set<string>()
    for (let index = 0; index < 100; index++) {
      const scenarios = selectLightingScenarios(() => index / 100)
      expect(scenarios[0]).toMatchObject({ id: 'headlamps', prompt: '请打开前照灯', initial: 'off' })
      expect(scenarios).toHaveLength(6)
      expect(new Set(scenarios.map(scenario => scenario.id)).size).toBe(6)
      for (const { prompt, expected } of scenarios) {
        expect(lightingCommands).toContainEqual([prompt, expected])
        sampled.add(prompt)
      }
    }
    expect(sampled).toEqual(new Set(lightingCommands.map(([prompt]) => prompt)))
  })

  it('opens lighting with one confirmation and ignores a stale confirmation', () => {
    const initial = newSimulationAttempt(selectLightingScenarios())
    const action = { type: 'operate', checkpoint: checkpointKey(initial.step), operation: confirm } as const
    const lighting = simulationReducer(initial, action)!
    expect(lighting).toMatchObject({ step: { id: 'lighting', index: 0, lamp: 'off' }, completed: ['preparation'] })
    expect(simulationReducer(lighting, action)).toBe(lighting)
  })

  it('records lighting mistakes for review and never ends the simulation early for them', () => {
    const lighting = operate(newSimulationAttempt([dark, parked]), confirm)
    const action = { type: 'operate', checkpoint: checkpointKey(lighting.step), operation: submit } as const
    const first = simulationReducer(lighting, action)!
    expect(first).toMatchObject({ step: { id: 'lighting', index: 1 }, lightAnswers: [{ checks: [{ clause: projectRule(12, 'i'), violated: true }] }] })
    expect(simulationReducer(first, action)).toBe(first)
    const shutdown = operate(first, submit)
    expect(shutdown.step).toMatchObject({ id: 'lighting', phase: 'shutdown' })
    const fault = shutdown.lightAnswers[1].checks.find(check => check.violated)!
    expect(examRule(fault.clause).penalty).toBe('fail')
    const start = operate(shutdown, lightsOff)
    expect(start).toMatchObject({ step: { id: 'start' }, completed: ['preparation', 'lighting'] })
    expect(operate(start, confirm).step.id).toBe('road')
  })

  it('waits for both lamps and hazards to be closed before starting', () => {
    const shutdown = sequence(newSimulationAttempt([parked]), confirm, { type: 'lamp', lamp: 'position' }, { type: 'hazards' }, submit)
    expect(shutdown.step).toMatchObject({ id: 'lighting', phase: 'shutdown', lamp: 'position', hazards: true })
    expect(operate(shutdown, submit)).toBe(shutdown)
    expect(operate(shutdown, confirm)).toBe(shutdown)
    expect(operate(shutdown, lightsOff).step).toMatchObject({ phase: 'shutdown', lamp: 'off', hazards: true })
    expect(operate(shutdown, { type: 'hazards' }).step).toMatchObject({ phase: 'shutdown', lamp: 'position', hazards: false })
    expect(sequence(shutdown, { type: 'hazards' }, lightsOff).step.id).toBe('start')
    expect(sequence(shutdown, lightsOff, { type: 'hazards' }).step.id).toBe('start')
  })

  it('keeps the explicit shutdown instruction even when the last answer left the lamp off', () => {
    const shutdown = sequence(newSimulationAttempt([parked]), confirm, lightsOff, submit)
    expect(shutdown.step).toMatchObject({ id: 'lighting', phase: 'shutdown', lamp: 'off' })
    expect(shutdown.lightAnswers[0].checks).toEqual([])
    expect(operate(shutdown, lightsOff).step.id).toBe('start')
  })

  it.each(['5', '6', '7'])('completes route %s from one-click guides even with all answers forgotten', routeId => {
    const source = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${routeId}.events.json`, 'utf8')))
    const { questions } = loadRouteCourse(source)!
    expect(questions).toHaveLength(10)
    const course: CourseAnswers = {
      questions, answers: questions.map(question => ({ questionId: question.id, selected: UNKNOWN_ANSWER, usedHint: false })),
    }
    const lighting: LightingScenario[] = selectLightingScenarios(() => 0)
    const road = sequence(newSimulationAttempt(lighting), confirm, ...lighting.map(() => submit), lightsOff, confirm)
    expect(road).toMatchObject({ step: { id: 'road' }, completed: ['preparation', 'lighting', 'start'] })
    expect(operate(road, confirm)).toBe(road)
    const parking = operate(road, { type: 'road-finish', course })
    expect(parking).toMatchObject({ step: { id: 'parking' }, course })
    const result = operate(parking, confirm)
    expect(result).toMatchObject({ step: { id: 'result' }, completed: simulationStages.map(stage => stage.id), course })
    expect(result.lightAnswers).toHaveLength(6)
    expect(operate(result, confirm)).toBe(result)
  })
})
