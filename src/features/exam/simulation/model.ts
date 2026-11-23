import type { CourseAnswers } from '@/features/memory/course/course'
import { generalFail, projectRule } from './rules'
import { lampNames, type Lamp, type LightingScenario, type SimulationStage } from './scenarios'

export type GuideStage = 'preparation' | 'start' | 'parking'
type Lighting = { id: 'lighting'; index: number; phase: 'question' | 'shutdown'; lamp: Lamp; flash: boolean; hazards: boolean }
type Step = { id: GuideStage | 'road' | 'result' } | Lighting
type LightCheck = { clause: string; violated: boolean }
type LightAnswer = { scenario: LightingScenario; status: string; checks: LightCheck[] }

export type SimulationAttempt = {
  step: Step
  completed: SimulationStage[]
  lighting: LightingScenario[]
  lightAnswers: LightAnswer[]
  course?: CourseAnswers
}

export function newSimulationAttempt(lighting: LightingScenario[], stage: SimulationStage | 'result' = 'preparation'): SimulationAttempt {
  const step: Step = stage === 'lighting' ? openLighting(0, lighting[0]) : { id: stage }
  return {
    step,
    completed: [],
    lighting,
    lightAnswers: [],
  }
}

export type Operation =
  | { type: 'confirm-guide' | 'lighting-submit' | 'flash' | 'hazards' }
  | { type: 'lamp'; lamp: Lamp }
  | { type: 'road-finish'; course: CourseAnswers }

export function checkpointKey(step: Step): string {
  if (step.id === 'lighting') return step.phase === 'shutdown' ? 'lighting:shutdown' : `lighting:${step.index}`
  return step.id
}

type AttemptAction = { type: 'begin'; attempt: SimulationAttempt } | { type: 'clear' } |
  { type: 'operate'; checkpoint: string; operation: Operation }

function advance(attempt: SimulationAttempt, step: Step): SimulationAttempt {
  if (attempt.step.id === 'result') return attempt
  return { ...attempt, step, completed: [...attempt.completed, attempt.step.id] }
}

function openLighting(index: number, scenario: LightingScenario): Lighting {
  return { id: 'lighting', index, lamp: scenario.initial, flash: false, hazards: false, phase: 'question' }
}

function lightStatus({ lamp, flash, hazards }: Lighting) {
  return `确认时灯光为「${lampNames[lamp]}」，${flash ? '已' : '未'}交替闪灯，双闪${hazards ? '已开' : '未开'}。`
}

function lightingChecks(scenario: LightingScenario, step: Lighting): LightCheck[] {
  const item = (id: string, violated: boolean) => ({ clause: projectRule(12, id), violated })
  const needsHeadlamps = (specific: LightCheck) => [
    specific,
    { clause: generalFail + 'd', violated: step.lamp === 'off' || step.lamp === 'position' },
  ]
  switch (scenario.id) {
    case 'headlamps': return [item('a', step.lamp !== 'low' && step.lamp !== 'high')]
    case 'lit': return needsHeadlamps(item('g', step.lamp === 'high'))
    case 'meeting': return [item('d', step.lamp !== 'low')]
    case 'following': return needsHeadlamps(item('b', step.lamp === 'high'))
    case 'junction': return needsHeadlamps(item('e', step.lamp === 'high'))
    case 'curve':
    case 'slope':
    case 'bridge':
    case 'crossing': return [item('c', !step.flash)]
    case 'passing': return [item('f', !step.flash)]
    case 'dark': return [item('i', step.lamp !== 'high')]
    case 'parked':
      if (step.lamp === 'position') return [item('h', false)]
      if (step.lamp === 'low' || step.lamp === 'high') return [item('h', true)]
      return []
  }
}

function runLighting(attempt: SimulationAttempt, step: Lighting, operation: Operation): SimulationAttempt {
  if (step.phase === 'shutdown') {
    let updated: Lighting
    if (operation.type === 'lamp' && operation.lamp === 'off') updated = { ...step, lamp: 'off' }
    else if (operation.type === 'hazards' && step.hazards) updated = { ...step, hazards: false }
    else return attempt
    return updated.lamp === 'off' && !updated.hazards
      ? advance(attempt, { id: 'start' })
      : { ...attempt, step: updated }
  }

  switch (operation.type) {
    case 'lamp': return { ...attempt, step: { ...step, lamp: operation.lamp } }
    case 'flash': return { ...attempt, step: { ...step, flash: true } }
    case 'hazards': return { ...attempt, step: { ...step, hazards: !step.hazards } }
    case 'lighting-submit': {
      const scenario = attempt.lighting[step.index]
      const next = attempt.lighting[step.index + 1]
      return {
        ...attempt,
        lightAnswers: [...attempt.lightAnswers, { scenario, status: lightStatus(step), checks: lightingChecks(scenario, step) }],
        step: next ? openLighting(step.index + 1, next) : { ...step, phase: 'shutdown', flash: false },
      }
    }
    default: return attempt
  }
}

export function simulationReducer(attempt: SimulationAttempt | null, action: AttemptAction): SimulationAttempt | null {
  if (action.type === 'begin') return action.attempt
  if (action.type === 'clear') return null
  if (!attempt || action.checkpoint !== checkpointKey(attempt.step)) return attempt
  const { step } = attempt
  const { operation } = action
  if (step.id === 'lighting') return runLighting(attempt, step, operation)
  if (step.id === 'road' && operation.type === 'road-finish') {
    return advance({ ...attempt, course: operation.course }, { id: 'parking' })
  }
  if (operation.type !== 'confirm-guide') return attempt
  switch (step.id) {
    case 'preparation': return advance(attempt, openLighting(0, attempt.lighting[0]))
    case 'start': return advance(attempt, { id: 'road' })
    case 'parking': return advance(attempt, { id: 'result' })
    default: return attempt
  }
}
