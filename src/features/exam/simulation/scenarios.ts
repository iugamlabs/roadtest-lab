import type { RouteId } from '@/features/content/schema'
import type { LightingQuestion } from '../lighting/quiz'
import { createLightingQuiz } from '../lighting/quiz'
import type { MemorySource } from '@/features/memory/progress'
import type { RouteCourseContent } from '@/features/memory/course/course'

export const simulationStages = [
  { id: 'preparation', title: '上车准备' },
  { id: 'lighting', title: '灯光口令' },
  { id: 'start', title: 'C2 起步' },
  { id: 'road', title: '实景路线' },
  { id: 'parking', title: '停车收尾' },
] as const

export type SimulationStage = typeof simulationStages[number]['id']
export type Direction = 'left' | 'right'
export type Lamp = 'off' | 'position' | 'low' | 'high'
export const lampNames: Record<Lamp, string> = { off: '关闭', position: '示廓灯', low: '近光灯', high: '远光灯' }

const lightingSetup = {
  '请打开前照灯': { id: 'headlamps', initial: 'off' },
  '进入照明良好路段': { id: 'lit', initial: 'high' },
  '夜间与机动车会车': { id: 'meeting', initial: 'high' },
  '夜间同方向近距离跟车行驶': { id: 'following', initial: 'high' },
  '夜间通过有交通信号灯路口': { id: 'junction', initial: 'high' },
  '夜间通过急弯': { id: 'curve', initial: 'low' },
  '夜间通过坡路': { id: 'slope', initial: 'low' },
  '夜间通过拱桥': { id: 'bridge', initial: 'low' },
  '夜间通过人行横道': { id: 'crossing', initial: 'low' },
  '夜间超越前方车辆': { id: 'passing', initial: 'low' },
  '进入照明不良道路': { id: 'dark', initial: 'low' },
  '夜间在路边临时停车': { id: 'parked', initial: 'low' },
} as const satisfies Record<LightingQuestion[0], { id: string; initial: Lamp }>

export type LightingScenario = typeof lightingSetup[LightingQuestion[0]] &
  { prompt: LightingQuestion[0]; expected: LightingQuestion[1] }

export function selectLightingScenarios(random = Math.random): LightingScenario[] {
  return createLightingQuiz(random).questions.map(([prompt, expected]) => ({ ...lightingSetup[prompt], prompt, expected }))
}

type RoadKind = 'turn' | 'junction' | 'lane' | 'bus' | 'straight' | 'uturn' | 'overtake' | 'meeting'
export type RoadScenario = { questionId: string; title: string } & ({ eventId: string } & (
  { kind: 'turn' | 'lane'; direction: Direction } |
  { kind: Exclude<RoadKind, 'turn' | 'lane'> }
) | { eventId: null; kind: 'crosswalk' | 'school' })

// These are authored simulation checkpoints linked to existing learning locations.
// The associated video remains a landmark reference, never a telemetry source.
const locations = {
  '5': { 'exit-turn': 'turn', 'bus-1': 'bus', 'cross-2': 'junction', 'lane-command': 'lane',
    'meeting': 'meeting', 'straight': 'straight', 'overtake': 'overtake', 'uturn': 'uturn', 'turn-left-2': 'turn' },
  '6': { 'exit-turn': 'turn', 'bus-1': 'bus', 'cross-2': 'junction', 'lane-command': 'lane',
    'meeting': 'meeting', 'straight': 'straight', 'overtake': 'overtake', 'uturn': 'uturn' },
  '7': { 'exit-turn': 'turn', 'bus-1': 'bus', 'cross-2': 'junction', 'lane-command': 'lane',
    'meeting': 'meeting', 'straight': 'straight', 'overtake': 'overtake', 'uturn-1': 'uturn' },
} satisfies Record<RouteId, Record<string, RoadKind>>

export function prepareRoadScenarios(source: MemorySource, course: RouteCourseContent): RoadScenario[] {
  const selected: Readonly<Record<string, RoadKind>> = locations[source.routeId]
  const questionByEvent = new Map(course.questions.flatMap(question => question.topicEventIds.map(id => [id, question.id] as const)))
  const locationsInOrder = source.events.flatMap((event): RoadScenario[] => {
    const kind = selected[event.id.slice(2)]
    const questionId = questionByEvent.get(event.id)
    if (!kind || !questionId || event.blockers.length || event.timingStatus !== 'visual-reviewed') return []
    const location = { eventId: event.id, questionId, title: event.title }
    if (kind === 'turn' || kind === 'lane') return event.direction ? [{ ...location, kind, direction: event.direction }] : []
    return [{ ...location, kind }]
  })
  // Generic traffic exercises have no claim to a specific position or official cue.
  return course.questions.flatMap((question, index): RoadScenario[] => {
    const scenarios = locationsInOrder.filter(scene => scene.questionId === question.id)
    if (index === 2) scenarios.push({ questionId: question.id, eventId: null, title: '独立场景 · 人行横道', kind: 'crosswalk' })
    if (index === 6) scenarios.push({ questionId: question.id, eventId: null, title: '独立场景 · 学校区域', kind: 'school' })
    return scenarios
  })
}
