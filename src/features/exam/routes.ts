import { z } from 'zod'
import { routeIdSchema, type RouteId } from '../content/schema'

export const sceneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.enum(['look', 'turn', 'slow', 'straight', 'lane', 'overtake', 'uturn', 'parking']),
  direction: z.enum(['left', 'right']).nullable(),
  category: z.enum(['command', 'silent', 'route-choice']),
  landmark: z.string().min(1),
  command: z.string(),
  navigation: z.string().min(1),
  destinationLane: z.number().int().min(0).max(2).optional(),
  referenceId: z.string().nullable(),
}).superRefine((scene, ctx) => {
  if (['turn', 'lane', 'uturn', 'parking'].includes(scene.kind) && !scene.direction) ctx.addIssue({ code: 'custom', message: '场景缺少行驶方向' })
  if (scene.category !== 'command' && scene.command) ctx.addIssue({ code: 'custom', message: '自主识别场景不能附加考试口令' })
})
export type SceneSpec = z.infer<typeof sceneSchema>
type Kind = SceneSpec['kind']
type Category = SceneSpec['category']
type Direction = SceneSpec['direction']

// Authored scenario blueprints. References identify route order/direction only;
// media timestamps, review status and practice steps NEVER become scoring rules.
function scene(route: RouteId, suffix: string, title: string, kind: Kind, direction: Direction = null, category: Category = 'command', destinationLane?: number): SceneSpec {
  const command = category !== 'command' ? '' : kind === 'look' ? '请停车瞭望。'
    : kind === 'turn' ? `前方路口${direction === 'left' ? '左' : '右'}转。`
    : kind === 'uturn' ? '前方请选择合适地点掉头。'
    : kind === 'lane' ? `请向${direction === 'left' ? '左' : '右'}变更车道。`
    : kind === 'overtake' ? '请完成超车。'
    : kind === 'parking' ? '请靠边停车。'
    : kind === 'straight' ? '请保持直线行驶。'
    : title.includes('会车') ? '前方会车。' : '前方路口直行。'
  return { id: `scene-${route}-${suffix}`, title, kind, direction, category, command, destinationLane,
    landmark: title.includes('公交') ? '公交车站' : title.includes('检查') ? '检查区' : kind === 'parking' ? '终点停车区' : kind === 'look' ? '停车瞭望' : '前方路口',
    navigation: category === 'route-choice' ? (direction === 'right' ? '下一路口右转，请提前选择右侧车道' : '前方掉头，请提前选择左侧车道') : title,
    referenceId: `${route}-${suffix}` }
}
const s5 = (suffix: string, title: string, kind: Kind, direction: Direction = null, category: Category = 'command', lane?: number) => scene('5', suffix, title, kind, direction, category, lane)
const s6 = (suffix: string, title: string, kind: Kind, direction: Direction = null, category: Category = 'command', lane?: number) => scene('6', suffix, title, kind, direction, category, lane)
const s7 = (suffix: string, title: string, kind: Kind, direction: Direction = null, category: Category = 'command', lane?: number) => scene('7', suffix, title, kind, direction, category, lane)

export const scenarioRouteSchema = z.object({
  id: routeIdSchema, name: z.string(), description: z.string(), highlights: z.array(z.string()), scenes: z.array(sceneSchema).min(1),
}).superRefine((route, ctx) => {
  if (new Set(route.scenes.map(scene => scene.id)).size !== route.scenes.length) ctx.addIssue({ code: 'custom', message: '场景 ID 重复' })
  if (route.scenes.at(-1)?.kind !== 'parking') ctx.addIssue({ code: 'custom', message: '路线应以靠边停车结束' })
  if (route.scenes.some(scene => !scene.id.startsWith(`scene-${route.id}-`))) ctx.addIssue({ code: 'custom', message: '场景与路线不符' })
})
export type ScenarioRoute = z.infer<typeof scenarioRouteSchema>

export const scenarioRoutes: ScenarioRoute[] = [
  {
    id: '5', name: '五号线', description: '变道后自主选道，连续转弯，超车后准备掉头。',
    highlights: ['两次自主选道', '连续左、右转', '超车与掉头'],
    scenes: [
      s5('exit-look', '出场路口停车瞭望', 'look'),
      s5('exit-turn', '出场右转进入大学路', 'turn', 'right'),
      s5('bus-1', '大学路第一处公交站', 'slow', null, 'silent'),
      s5('cross-1', '学校区域之后的路口', 'slow', null, 'silent'),
      s5('bus-2', '通过路口后的公交站', 'slow', null, 'silent'),
      s5('cross-2', '大学路口直行', 'slow'),
      s5('bus-3', '变道项目之前的公交站', 'slow', null, 'silent'),
      s5('lane-command', '按口令向左变更车道', 'lane', 'left'),
      s5('lane-return', '自主返回右侧车道', 'lane', 'right', 'route-choice'),
      s5('industrial-turn', '右转进入工业区', 'turn', 'right'),
      s5('meeting', '工业区会车减速', 'slow'),
      s5('turn-2', '右转进入两车道路段', 'turn', 'right', 'command', 0),
      s5('turn-left-1', '两车道路段尽头左转', 'turn', 'left'),
      s5('straight', '保持直线行驶', 'straight'),
      s5('turn-3', '直线行驶后右转', 'turn', 'right'),
      s5('turn-4', '下一路口右转', 'turn', 'right'),
      s5('overtake', '完成超车并返回原车道', 'overtake'),
      s5('lane-uturn', '超车后自主向左选道', 'lane', 'left', 'route-choice'),
      s5('uturn', '工业区尽头掉头', 'uturn', 'left'),
      s5('turn-left-2', '掉头后路口左转', 'turn', 'left'),
      s5('turn-left-3', '终点前路口左转', 'turn', 'left'),
      s5('parking', '靠边停车', 'parking', 'right'),
    ],
  },
  {
    id: '6', name: '六号线', description: '工业区掉头、饭店后提前选道，返回大学路后留意检查区。',
    highlights: ['掉头后变道', '饭店后选道', '检查区主动减速'],
    scenes: [
      s6('exit-look', '出场路口停车瞭望', 'look'),
      s6('exit-turn', '出场右转进入大学路', 'turn', 'right'),
      s6('bus-1', '大学路第一处公交站', 'slow', null, 'silent'),
      s6('straight', '保持直线行驶', 'straight'),
      s6('cross-1', '学校区域之后的路口', 'slow', null, 'silent'),
      s6('bus-2', '工业区入口前的公交站', 'slow', null, 'silent'),
      s6('industrial-turn', '右转进入工业区', 'turn', 'right'),
      s6('cross-2', '工业区第一个路口直行', 'slow'),
      s6('uturn', '工业区尽头掉头', 'uturn', 'left'),
      s6('lane-command', '按口令变更车道', 'lane', 'left'),
      s6('cross-3', '饭店之前的路口直行', 'slow'),
      // Independently authored connections, with no invented media timestamp
      // or promotion of the excluded video node to an approved exam event.
      { ...s6('scene-select-right', '饭店后提前选择右侧车道', 'lane', 'right', 'route-choice'), referenceId: null },
      { ...s6('scene-return', '右转返回大学路', 'turn', 'right'), referenceId: null },
      s6('bus-3', '返回大学路后的公交站', 'slow', null, 'silent'),
      s6('overtake', '完成超车并返回原车道', 'overtake'),
      s6('cross-4', '返回大学路后的路口直行', 'slow'),
      s6('bus-4', '终点前的公交站', 'slow', null, 'silent'),
      s6('meeting', '终点前会车减速', 'slow'),
      s6('inspection', '检查区无口令减速', 'slow', null, 'silent'),
      s6('parking', '靠边停车', 'parking', 'right'),
    ],
  },
  {
    id: '7', name: '七号线', description: '两次掉头、超车、斜入口右转，以及返回大学路前停车瞭望。',
    highlights: ['两次掉头', '右转后超车', '停车瞭望'],
    scenes: [
      s7('exit-look', '出场路口停车瞭望', 'look'),
      s7('exit-turn', '出场右转进入大学路', 'turn', 'right'),
      s7('bus-1', '大学路第一处公交站', 'slow', null, 'silent'),
      s7('cross-1', '学校区域之后的路口', 'slow', null, 'silent'),
      s7('bus-2', '工业区入口前的公交站', 'slow', null, 'silent'),
      s7('industrial-turn', '右转进入工业区', 'turn', 'right'),
      s7('cross-2', '工业区第一个路口直行', 'slow'),
      s7('meeting', '工业区会车减速', 'slow'),
      s7('uturn-1', '第一次掉头', 'uturn', 'left'),
      s7('straight', '保持直线行驶', 'straight'),
      s7('turn-2', '第一次掉头后右转', 'turn', 'right', 'command', 2),
      s7('cross-3', '右转后第一个路口直行', 'slow'),
      s7('cross-4', '超车前的路口直行', 'slow'),
      s7('overtake', '完成超车并返回原车道', 'overtake'),
      s7('cross-5', '超车后的路口直行', 'slow'),
      s7('uturn-2', '第二次掉头', 'uturn', 'left'),
      s7('cross-6', '第二次掉头后的路口直行', 'slow'),
      s7('lane-command', '按口令向右变更车道', 'lane', 'right'),
      s7('turn-3', '斜入口路口右转', 'turn', 'right'),
      s7('stop-look-2', '返回大学路前停车瞭望', 'look'),
      s7('return-turn', '右转返回大学路', 'turn', 'right'),
      s7('parking', '靠边停车', 'parking', 'right'),
    ],
  },
].map(route => scenarioRouteSchema.parse(route))

export function scenarioRoute(id: RouteId) {
  return scenarioRoutes.find(route => route.id === id)!
}
