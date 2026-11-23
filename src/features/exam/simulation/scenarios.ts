import { lightingCommands } from '@/features/content/lighting-commands'
import { createLightingQuiz, type LightingQuestion } from '../lighting/quiz'

export const simulationStages = [
  { id: 'preparation', title: '上车准备' },
  { id: 'lighting', title: '灯光口令' },
  { id: 'start', title: 'C2 起步' },
  { id: 'road', title: '实景路线' },
  { id: 'parking', title: '停车收尾' },
] as const

export type SimulationStage = typeof simulationStages[number]['id']
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
  const [opening, ...remaining] = lightingCommands
  return [opening, ...createLightingQuiz(random, remaining).questions]
    .map(([prompt, expected]) => ({ ...lightingSetup[prompt], prompt, expected }))
}
