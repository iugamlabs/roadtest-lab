import { z } from 'zod'
import type { RouteId } from '../../content/schema'
import { scenarioRoute, type SceneSpec } from '../routes'
import { onRoad, point, pointSchema, rounded, type Point } from './geometry'

const line = (...xy: [number, number][]) => xy.map(([x, y]) => point(x, y))
const segmentSchema = z.object({ id: z.string().min(1), actions: z.array(z.array(pointSchema).min(2)).min(1).max(2), via: z.array(pointSchema).optional() })
type Segment = z.infer<typeof segmentSchema>
const segment = (id: string, ...actions: Point[][]): Segment => ({ id, actions })

// A shared schematic road network traced from the three supplied route maps.
// Coordinates describe spatial connections, never distances or exam deadlines.
// Entries intentionally match authored scenario IDs, not media timestamps.
const authored: Record<RouteId, Segment[]> = {
  '5': [
    segment('exit-look', line([270,1770],[255,1770])),
    segment('exit-turn', line([255,1770],[220,1770],[220,1710])),
    segment('bus-1', line([220,1620],[220,1570])),
    segment('cross-1', line([220,1440],[220,1380])),
    segment('bus-2', line([220,1320],[220,1270])),
    segment('cross-2', line([220,1170],[220,1120])),
    segment('bus-3', line([220,1060],[220,1020])),
    segment('lane-command', line([220,970],[180,940],[180,910])),
    segment('lane-return', line([180,870],[220,840],[220,820])),
    segment('industrial-turn', line([220,790],[220,750],[285,750])),
    segment('meeting', line([350,750],[400,750])),
    segment('turn-2', line([440,750],[475,750],[475,820])),
    segment('turn-left-1', line([475,870],[475,925],[550,925])),
    segment('straight', line([620,925],[730,925])),
    segment('turn-3', line([860,925],[950,925],[950,985])),
    segment('turn-4', line([950,995],[950,1010],[860,1010])),
    segment('overtake', line([820,1010],[790,1030],[750,1030]), line([750,1030],[720,1010],[690,1010])),
    segment('lane-uturn', line([680,1010],[650,1030],[620,1030])),
    segment('uturn', line([610,1030],[575,1030],[550,1060],[575,1090],[650,1090])),
    segment('turn-left-2', line([860,1090],[950,1090],[950,980])),
    segment('turn-left-3', line([950,950],[950,875],[870,875])),
    segment('parking', line([740,875],[710,865],[670,865])),
  ],
  '6': [
    segment('exit-look', line([270,1770],[255,1770])),
    segment('exit-turn', line([255,1770],[220,1770],[220,1710])),
    segment('bus-1', line([220,1620],[220,1570])),
    segment('straight', line([220,1510],[220,1450])),
    segment('cross-1', line([220,1380],[220,1320])),
    segment('bus-2', line([220,1240],[220,1200])),
    segment('industrial-turn', line([220,1130],[220,1090],[285,1090])),
    segment('cross-2', line([470,1090],[550,1090])),
    segment('uturn', line([860,1090],[930,1090],[960,1050],[930,1010],[860,1010])),
    segment('lane-command', line([820,1010],[780,1030],[740,1030])),
    segment('cross-3', line([610,1030],[540,1030])),
    segment('scene-select-right', line([450,1030],[410,1010],[360,1010])),
    segment('scene-return', line([280,1010],[220,1010],[220,940])),
    segment('bus-3', line([220,880],[220,835])),
    segment('overtake', line([220,800],[180,770],[180,740]), line([180,740],[220,700],[220,660])),
    segment('cross-4', line([220,610],[220,550])),
    segment('bus-4', line([220,475],[220,430])),
    segment('meeting', line([220,355],[220,320])),
    segment('inspection', line([220,275],[220,245])),
    segment('parking', line([220,180],[230,145],[230,115])),
  ],
  '7': [
    segment('exit-look', line([270,1770],[255,1770])),
    segment('exit-turn', line([255,1770],[220,1770],[220,1710])),
    segment('bus-1', line([220,1620],[220,1570])),
    segment('cross-1', line([220,1410],[220,1350])),
    segment('bus-2', line([220,1240],[220,1200])),
    segment('industrial-turn', line([220,1130],[220,1090],[285,1090])),
    segment('cross-2', line([470,1090],[550,1090])),
    segment('meeting', line([680,1090],[750,1090])),
    segment('uturn-1', line([860,1090],[930,1090],[960,1050],[930,1010],[860,1010])),
    segment('straight', line([780,1010],[680,1010])),
    segment('turn-2', line([600,1010],[545,1010],[545,950])),
    segment('cross-3', line([545,915],[545,850])),
    segment('cross-4', line([545,805],[545,745])),
    segment('overtake', line([545,700],[515,660],[515,620]), line([515,620],[545,570],[545,530])),
    segment('cross-5', line([545,480],[545,425])),
    segment('uturn-2', line([545,290],[545,180],[515,155],[485,180],[485,280])),
    segment('cross-6', line([485,400],[485,465])),
    segment('lane-command', line([485,520],[455,570],[455,620])),
    segment('turn-3', line([455,650],[455,695],[380,695])),
    segment('stop-look-2', line([270,695],[255,695])),
    segment('return-turn', line([255,695],[220,695],[220,635])),
    segment('parking', line([220,590],[230,550],[230,520])),
  ],
}
export type MapScene = SceneSpec & { approach: Point[]; actions: Point[][] }
export interface MapRoute { id: RouteId; name: string; scenes: MapScene[]; trace: Point[] }

export function mapRoute(id: RouteId): MapRoute {
  const source = scenarioRoute(id)
  const segments = z.array(segmentSchema).parse(authored[id])
  if (segments.length !== source.scenes.length) throw new Error('地图项目数量与路线不符')
  let previous = point(365, 1770)
  const trace = [previous]
  const scenes = segments.map((entry, index) => {
    const reference = source.scenes[index]
    if (reference.id !== `scene-${id}-${entry.id}`) throw new Error('地图项目顺序与路线不符')
    const actions = entry.actions.map(rounded)
    if (actions.length !== (reference.kind === 'overtake' ? 2 : 1)) throw new Error('超车应有驶出与返回两个阶段')
    const approach = rounded([previous, ...(entry.via ?? []), actions[0][0]])
    if ([...approach, ...actions.flat()].some(p => !onRoad(p))) throw new Error(`场景轨迹离开道路：${reference.id}`)
    trace.push(...approach.slice(1), ...actions.flatMap(action => action.slice(1)))
    previous = actions.at(-1)!.at(-1)!
    return { ...reference, approach, actions }
  })
  return { id, name: source.name, scenes, trace }
}
