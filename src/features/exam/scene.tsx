import { ArrowDownToLine, ArrowUpLeft, ArrowUpRight, Eye } from 'lucide-react'
import { hazardActive, ROAD_LENGTH, type ExamState, type PlannedScene, type SceneFrame, type Maneuver } from './engine'

function TrafficCar({ x, y, scale = 1, side = false }: { x: number; y: number; scale?: number; side?: boolean }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <rect x={side ? -55 : -30} y="-55" width={side ? 110 : 60} height="50" rx="7" fill="var(--scene-car)" stroke="var(--scene-ink)" strokeWidth="2" />
    <path d={side ? 'M-36 -55 L-24 -77 L20 -77 L40 -55 Z' : 'M-24 -53 L-19 -77 L19 -77 L24 -53 Z'} fill="var(--scene-glass)" stroke="var(--scene-ink)" strokeWidth="2" />
    <rect x={side ? -37 : -24} y="-9" width="12" height="15" rx="3" fill="var(--scene-ink)" />
    <rect x={side ? 25 : 12} y="-9" width="12" height="15" rx="3" fill="var(--scene-ink)" />
    {!side && <><rect x="-24" y="-37" width="10" height="5" fill="var(--scene-stop)" /><rect x="14" y="-37" width="10" height="5" fill="var(--scene-stop)" /></>}
  </g>
}
export function trafficDescription(scene: PlannedScene, frame: SceneFrame) {
  const hazard = hazardActive(scene, frame)
  return hazard === 'red' ? '前方信号灯为红灯' : hazard === 'pedestrian' ? '前方有行人正在通过人行横道' : hazard === 'cross-traffic' ? '前方有车辆横向通过路口' : '前方路段可见，注意观察交通变化'
}
function RoadImage({ scene, frame, maneuver }: { scene: PlannedScene; frame: SceneFrame; maneuver?: Maneuver | null }) {
  const p = frame.distance / ROAD_LENGTH
  const danger = hazardActive(scene, frame)
  const lineY = 215 + Math.pow(p, 1.65) * 400
  const t = maneuver ? Math.min(1, maneuver.ms / 1800) : 0
  const cameraLane = maneuver ? frame.vehicle.lane + (maneuver.targetLane - frame.vehicle.lane) * t : frame.vehicle.lane
  const offset = (1 - cameraLane) * 230
  const turn = maneuver && ['turn', 'uturn'].includes(scene.kind) ? Math.sin(t * Math.PI) * (maneuver.direction === 'left' ? 35 : -35) : 0
  const flow = frame.distance % 12 / 12
  const light = scene.hazard.kind === 'red'
  const crosswalk = !['lane', 'overtake', 'straight'].includes(scene.kind)
  const laneX = (fraction: number, y: number) => 500 + (fraction - .5) * (100 + (y - 190) * 2.5)
  return <svg viewBox="0 0 1000 580" className="block h-full w-full" role="img" aria-label={`${scene.landmark}。${trafficDescription(scene, frame)}。车辆${frame.vehicle.speed === 0 ? '已停稳' : frame.vehicle.speed === 4 ? '慢行中' : '行驶中'}`}>
    <rect width="1000" height="580" fill="var(--scene-sky)" />
    <path d="M0 190 L0 135 L55 135 L55 100 L110 100 L110 154 L165 154 L165 118 L215 118 L215 177 L310 177 L310 150 L380 150 L380 190 Z" fill="var(--scene-buildings)" />
    <path d="M630 190 L630 152 L680 152 L680 113 L737 113 L737 160 L794 160 L794 102 L845 102 L845 165 L900 165 L900 139 L1000 139 L1000 190 Z" fill="var(--scene-buildings)" />
    <rect y="190" width="1000" height="390" fill="var(--scene-ground)" />
    <g transform={`translate(${offset + turn} 0)`}>
      <path d="M450 190 L550 190 L1037 580 L-37 580 Z" fill="var(--scene-road)" />
      {crosswalk && lineY > 245 && <path d={`M0 ${lineY - 28} L1000 ${lineY - 28} L1000 ${lineY + 13} L0 ${lineY + 13} Z`} fill="var(--scene-road)" />}
      <path d="M450 190 L-37 580 M550 190 L1037 580" fill="none" stroke="var(--scene-line)" strokeWidth="5" />
      {[1 / 3, 2 / 3].map(fraction => <g key={fraction}>{Array.from({ length: 10 }, (_, index) => {
        const depth = ((index + flow) / 10) ** 2
        const y = 190 + depth * 390
        const end = Math.min(580, y + 5 + depth * 34)
        return <path key={index} d={`M${laneX(fraction, y)} ${y} L${laneX(fraction, end)} ${end}`} stroke="var(--scene-line)" strokeWidth={2 + depth * 5} />
      })}</g>)}
      {crosswalk && lineY < 625 && <g>
        {Array.from({ length: 9 }, (_, i) => {
          const fraction = i / 9
          return <path key={i} d={`M${laneX(fraction, lineY)} ${lineY} L${laneX(fraction + .055, lineY)} ${lineY} L${laneX(fraction + .055, lineY + 13)} ${lineY + 13} L${laneX(fraction, lineY + 13)} ${lineY + 13} Z`} fill="var(--scene-line)" />
        })}
        <path d={`M${laneX(0, lineY + 26)} ${lineY + 26} L${laneX(1, lineY + 26)} ${lineY + 26}`} stroke="var(--scene-line)" strokeWidth={3 + p * 5} />
      </g>}
      {scene.landmark === '公交车站' && <g transform={`translate(${620 + p * 210} ${lineY}) scale(${.4 + p * .7})`}>
        <rect x="0" y="-100" width="100" height="100" fill="var(--scene-glass)" stroke="var(--scene-ink)" strokeWidth="3" />
        <path d="M-8 -104 H108 M8 0 H94 M15 -25 H85" stroke="var(--scene-ink)" strokeWidth="7" />
        <text x="50" y="-70" textAnchor="middle" fill="var(--scene-ink)" fontSize="21">公交站</text>
      </g>}
      {scene.landmark === '检查区' && <path d={`M${laneX(.67, lineY)} ${lineY} L${laneX(1, lineY)} ${lineY} L${laneX(1, lineY + 65)} ${lineY + 65} L${laneX(.67, lineY + 65)} ${lineY + 65} Z`} fill="none" stroke="var(--scene-warning)" strokeWidth="5" />}
      {light && <g transform={`translate(${620 + p * 130} ${lineY - 10}) scale(${.55 + p * .8})`}>
        <path d="M0 0 V-135" stroke="var(--scene-ink)" strokeWidth="5" /><rect x="-18" y="-160" width="36" height="88" rx="8" fill="var(--scene-ink)" />
        <circle cy="-139" r="11" fill={danger === 'red' ? 'var(--scene-stop)' : 'var(--scene-road)'} />
        <circle cy="-94" r="11" fill={danger !== 'red' ? 'var(--scene-go)' : 'var(--scene-road)'} />
      </g>}
      {danger === 'cross-traffic' && <TrafficCar side x={250 + frame.stageMs / scene.hazard.untilMs * 500} y={lineY - 8} scale={.4 + p * .9} />}
      {danger === 'pedestrian' && <g transform={`translate(${200 + frame.stageMs / scene.hazard.untilMs * 600} ${lineY + 5}) scale(${.4 + p})`}>
        <circle cy="-58" r="10" fill="var(--scene-person)" /><path d="M0 -45 V-22 M-17 -28 L0 -40 L16 -26 M0 -22 L-13 0 M0 -22 L14 0" stroke="var(--scene-person)" strokeWidth="7" strokeLinecap="round" fill="none" />
      </g>}
      {scene.kind === 'parking' && <g transform={`translate(${650 + p * 150} ${lineY}) scale(${.5 + p * .7})`}>
        <path d="M0 0 V-110" stroke="var(--scene-ink)" strokeWidth="5" /><rect x="-30" y="-150" width="60" height="60" fill="var(--scene-sign)" rx="3" /><text x="0" y="-104" fill="white" textAnchor="middle" fontSize="44" fontWeight="700">P</text>
      </g>}
      {scene.kind === 'look' && <g transform={`translate(${650 + p * 150} ${lineY}) scale(${.4 + p * .6})`}>
        <path d="M0 0 V-115" stroke="var(--scene-ink)" strokeWidth="5" /><path d="M-22 -155 H22 L40 -137 V-105 L22 -87 H-22 L-40 -105 V-137 Z" fill="var(--scene-stop)" /><text x="0" y="-109" textAnchor="middle" fill="white" fontSize="31" fontWeight="700">停</text>
      </g>}
      {!crosswalk && <path d="M500 350 V300 M480 320 L500 300 L520 320" stroke="var(--scene-line)" strokeWidth="8" fill="none" />}
    </g>
    <path d="M0 580 V560 Q500 507 1000 560 V580 Z" fill="var(--scene-dashboard)" />
    <path d="M280 580 Q285 537 500 537 Q715 537 720 580" fill="none" stroke="var(--scene-ink)" strokeWidth="8" />
    <path d="M420 565 H580" stroke="var(--scene-glass)" strokeWidth="4" />
  </svg>
}
function Mirror({ direction, scene, frame }: { direction: 'front' | 'left' | 'right'; scene: PlannedScene; frame: SceneFrame }) {
  const danger = hazardActive(scene, frame)
  const busy = direction === 'front' ? ['red', 'pedestrian', 'cross-traffic'].includes(danger) : danger === `rear-${direction}` || danger === 'cross-traffic'
  const label = direction === 'front' ? '前方观察' : direction === 'left' ? '左侧及左后方' : '右侧及右后方'
  return <div className={`exam-mirror ${direction === 'right' ? 'exam-mirror-right' : ''}`} aria-label={label}>
    <div className="flex items-center gap-2 border-b px-3 py-2 text-base font-medium"><Eye className="size-5" aria-hidden />{label}</div>
    <svg viewBox="0 0 300 100" className="h-16 w-full" aria-hidden>
      <rect width="300" height="100" fill="var(--scene-sky)" /><path d="M125 15 H175 L300 100 H0 Z" fill="var(--scene-road)" /><path d="M150 25 V100" stroke="var(--scene-line)" strokeWidth="3" strokeDasharray="12 10" />
      {busy && <TrafficCar x={direction === 'left' ? 104 : 196} y={75 + frame.stageMs % 1600 / 80} scale={.6} />}
    </svg>
    <p className="px-3 py-2 text-base">{direction === 'front' ? trafficDescription(scene, frame) : busy ? '有车辆接近，请留意通行时机' : '当前可见范围内暂无来车'}</p>
  </div>
}
export function SceneView({ scene, frame, maneuver, observation, stopped = false, replay = false }: { scene: PlannedScene; frame: SceneFrame; maneuver?: Maneuver | null; observation?: ExamState['lastObservation']; stopped?: boolean; replay?: boolean }) {
  const seenAt = observation ? frame.vehicle.observed[observation] : null
  const showMirror = observation && observation !== 'front' && (replay || (seenAt !== null && frame.elapsedMs - seenAt < 4500))
  return <div className="min-w-0 overflow-hidden rounded-lg border bg-card">
    <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-base">
      <span className="flex min-w-0 items-center gap-2 font-medium">{scene.direction === 'left' ? <ArrowUpLeft className="size-5 shrink-0" aria-hidden /> : scene.direction === 'right' ? <ArrowUpRight className="size-5 shrink-0" aria-hidden /> : <ArrowDownToLine className="size-5 shrink-0" aria-hidden />}{scene.navigation}</span>
      <span className="shrink-0 text-muted-foreground">{stopped ? '场景已暂停' : frame.vehicle.speed === 0 ? '车辆停稳' : frame.vehicle.speed === 4 ? '车辆慢行' : '自动行驶'}</span>
    </div>
    <div className="exam-scene relative" data-testid="exam-scene">
      <RoadImage scene={scene} frame={frame} maneuver={maneuver} />
      {showMirror && <Mirror direction={observation} scene={scene} frame={frame} />}
      {stopped && <div className="absolute inset-x-0 top-3 mx-auto w-fit rounded border bg-background/95 px-4 py-2 text-base">已暂停</div>}
    </div>
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t px-3 py-2 text-base" aria-label="道路信息">
      <span>路边标志：{scene.landmark}</span><span>{frame.distance < 24 ? '正在接近' : frame.distance < 60 ? ['lane', 'overtake'].includes(scene.kind) ? '虚线变道区' : '接近路口，留意交通' : frame.distance < 80 ? '路口前操作区' : '正在通过路段'}</span>
    </div>
    <p className="border-t px-3 py-2 text-base text-muted-foreground">{trafficDescription(scene, frame)}</p>
  </div>
}
