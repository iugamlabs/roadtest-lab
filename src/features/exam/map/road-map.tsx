import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { pathData, poseAt, roadRects } from './geometry'
import { mapCarPose, mapTraffic, trafficMessage, type MapFrame } from './model'
import type { MapRoute } from './routes'

function Car({ x, y, angle = 0, self = false, indicator, brake }: { x: number; y: number; angle?: number; self?: boolean; indicator?: MapFrame['indicator']; brake?: boolean }) {
  return <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect x="-15" y="-28" width="30" height="58" rx="8" fill={self ? 'var(--prototype-car)' : 'var(--prototype-other-car)'} stroke="var(--prototype-road-ink)" strokeWidth="1.5" />
    <path d="M-10 -11 L-8 -21 H8 L10 -11 Z M-10 15 L-8 23 H8 L10 15 Z" fill="var(--prototype-glass)" />
    <path d="M-5 -31 L0 -37 L5 -31" fill={self ? 'var(--prototype-car)' : 'var(--prototype-other-car)'} />
    {self && <g fill={brake ? 'var(--prototype-stop)' : 'var(--prototype-line)'}><rect x="-13" y="25" width="7" height="4" /><rect x="6" y="25" width="7" height="4" /></g>}
    {indicator && <g fill="var(--prototype-lamp)"><rect x={indicator === 'left' ? -21 : 15} y="-20" width="6" height="11" rx="2" /><rect x={indicator === 'left' ? -21 : 15} y="16" width="6" height="11" rx="2" /></g>}
  </g>
}
function Roads({ detail = true }: { detail?: boolean }) {
  return <>
    <g fill="var(--muted)" stroke="var(--border)" strokeWidth="2">
      <rect x="280" y="220" width="130" height="410" rx="5" /><rect x="280" y="800" width="130" height="160" rx="5" />
      <rect x="280" y="1150" width="300" height="530" rx="5" /><rect x="600" y="210" width="240" height="420" rx="5" />
      <rect x="600" y="800" width="240" height="25" rx="3" /><rect x="600" y="960" width="240" height="15" rx="3" />
    </g>
    <g fill="var(--prototype-road)">{roadRects.map((road, i) => <rect key={i} x={road.x} y={road.y} width={road.width} height={road.height} />)}</g>
    {detail && <g stroke="var(--prototype-line)" fill="none" strokeWidth="2">
      {roadRects.flatMap((road, i) => Array.from({ length: road.lanes - 1 }, (_, n) => road.vertical
        ? <path key={`${i}-${n}`} d={`M${road.x + (n + 1) * road.width / road.lanes} ${road.y} v${road.height}`} strokeDasharray="14 13" />
        : <path key={`${i}-${n}`} d={`M${road.x} ${road.y + (n + 1) * road.height / road.lanes} h${road.width}`} strokeDasharray="14 13" />))}
      <path d="M75 0 V1900 M245 0 V1740 M445 150 V670 M555 150 V670 M885 770 V850 M975 770 V850" />
      {[430, 800, 1250, 1570].map(y => <g key={y}>{[95,140,185,230].map(x => <path key={x} d={`M${x} ${y} v-28 m-5 6 l5 -6 l5 6`} />)}</g>)}
    </g>}
    {detail && <g fill="var(--muted-foreground)" textAnchor="middle" fontSize="21" fontFamily="inherit">
      {[430, 1250, 1570].map(y => <g key={y}>{['大','学','路'].map((text, i) => <text key={text} x="35" y={y + i * 27}>{text}</text>)}</g>)}
      <text x="720" y="390">工业区</text><text x="355" y="430">北侧路段</text>
      <text x="710" y="1195">工业区横向道路</text><text x="355" y="1845">考场出口</text>
    </g>}
  </>
}
export function MapRoadView({ route, seed, frame, showPlan = true, stopped = false, replay = false }: { route: MapRoute; seed: number; frame: MapFrame; showPlan?: boolean; stopped?: boolean; replay?: boolean }) {
  const container = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 1000, height: 400 })
  const mobile = useIsMobile()
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; if (rect.width && rect.height) setSize({ width: rect.width, height: rect.height }) })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const car = mapCarPose(route, frame)
  const scene = route.scenes[frame.index]
  const decision = poseAt(scene.actions[frame.leg], 0)
  const angle = decision.angle * Math.PI / 180
  const right = { x: Math.cos(angle), y: Math.sin(angle) }, forward = { x: Math.sin(angle), y: -Math.cos(angle) }
  const traffic = mapTraffic(route, seed, frame)
  const hazardKind = mapTraffic(route, seed, { ...frame, phase: 'decision', stageMs: frame.trafficAtMs ?? 0, trafficAtMs: frame.trafficAtMs ?? 0 })
  const fraction = Math.max(0, Math.min(1, (frame.stageMs - (frame.trafficAtMs ?? frame.stageMs)) / 10000))
  const worldWidth = mobile ? 430 : 900, worldHeight = worldWidth * size.height / size.width
  const heading = car.angle * Math.PI / 180
  const viewX = Math.max(0, Math.min(1070 - worldWidth, car.x + Math.sin(heading) * worldWidth * .15 - worldWidth / 2))
  const viewY = Math.max(0, Math.min(1900 - worldHeight, car.y - Math.cos(heading) * worldHeight * .15 - worldHeight / 2))
  const cross = { x: decision.x + forward.x * 65, y: decision.y + forward.y * 65 }
  const other = traffic.startsWith('rear') ? {
    x: car.x + right.x * (traffic === 'rear-left' ? -35 : 35) + forward.x * (-140 + fraction * 230),
    y: car.y + right.y * (traffic === 'rear-left' ? -35 : 35) + forward.y * (-140 + fraction * 230),
    angle: car.angle,
  } : { x: cross.x + right.x * (-90 + fraction * 180), y: cross.y + right.y * (-90 + fraction * 180), angle: decision.angle + 90 }
  const person = { x: cross.x + right.x * (-70 + fraction * 140), y: cross.y + right.y * (-70 + fraction * 140) }
  const landmark = scene.landmark === '公交车站' || scene.landmark === '检查区' || scene.kind === 'parking'
  return <div className="map-route-canvas prototype-map-wrap relative" ref={container}>
    <svg viewBox={`${viewX} ${viewY} ${worldWidth} ${worldHeight}`} className="prototype-map" role="img" aria-label={`${route.name}局部道路。${trafficMessage(traffic)}。${stopped ? '已暂停' : frame.stopped ? '本车已停稳' : frame.phase === 'decision' ? '已到操作位置，等待操作' : '自动沿路线行驶'}`}>
      <rect x="-2000" y="-2000" width="6000" height="6000" fill="var(--background)" />
      <Roads />
      {showPlan && <path d={pathData(route.trace)} fill="none" stroke="var(--prototype-car)" strokeWidth="3" strokeDasharray="7 10" opacity=".35" />}
      {frame.observed && <g transform={`translate(${decision.x} ${decision.y}) rotate(${decision.angle})`} stroke="var(--prototype-observe)" strokeWidth="1.5" strokeDasharray="6 6" fill="var(--prototype-observe-soft)" opacity=".8">
        {scene.kind === 'lane' || scene.kind === 'overtake' ? <rect x={scene.kind === 'overtake' ? frame.leg ? 15 : -65 : scene.direction === 'left' ? -65 : 15} y="-90" width="50" height="220" rx="20" /> : <rect x="-80" y="-100" width="160" height="70" rx="15" />}
      </g>}
      {['look','turn','uturn','slow'].includes(scene.kind) && <g transform={`translate(${cross.x} ${cross.y}) rotate(${decision.angle})`} stroke="var(--prototype-line)" strokeWidth="6">
        {Array.from({ length: 8 }, (_, i) => <path key={i} d={`M${-65 + i * 18} -12 v24`} />)}<path d="M-70 36 H70" strokeWidth="3" />
      </g>}
      {landmark && <g transform={`translate(${decision.x + right.x * 70} ${decision.y + right.y * 70})`}>
        <rect x="-32" y="-20" width="64" height="38" rx="4" fill="var(--background)" stroke="var(--prototype-observe)" strokeWidth="2" />
        <text textAnchor="middle" y="4" fill="var(--foreground)" fontFamily="inherit" fontSize="15">{scene.kind === 'parking' ? '停车区' : scene.landmark === '公交车站' ? '公交站' : '检查区'}</text>
      </g>}
      {hazardKind === 'red' && <g transform={`translate(${cross.x + right.x * 88} ${cross.y + right.y * 88})`}><rect x="-12" y="-25" width="24" height="50" rx="5" fill="var(--prototype-road-ink)" /><circle cy="-12" r="8" fill={traffic === 'red' ? 'var(--prototype-stop)' : 'var(--prototype-road)'} /><circle cy="12" r="8" fill={traffic !== 'red' ? 'var(--prototype-go)' : 'var(--prototype-road)'} /></g>}
      {traffic !== 'clear' && traffic !== 'red' && traffic !== 'pedestrian' && <Car {...other} />}
      {traffic === 'pedestrian' && <g transform={`translate(${person.x} ${person.y})`} stroke="var(--prototype-person)" strokeWidth="4" strokeLinecap="round" fill="none"><circle cy="-13" r="6" fill="var(--prototype-person)" stroke="none" /><path d="M0 -3 V13 M-10 3 L0 -2 L10 3 M0 13 L-8 25 M0 13 L8 25" /></g>}
      <Car {...car} self indicator={frame.indicator} brake={frame.stopped || frame.slow} />
      <rect x={car.x + 25} y={car.y - 12} width="42" height="22" rx="4" fill="var(--background)" stroke="var(--border)" />
      <text x={car.x + 46} y={car.y + 3} textAnchor="middle" fill="var(--foreground)" fontSize="13" fontFamily="inherit">本车</text>
    </svg>
    <div className="map-route-overview absolute right-3 top-3 rounded-md border bg-background/95 p-1" aria-hidden="true"><svg viewBox="0 0 1070 1900" className="h-full w-full"><Roads detail={false} /><path d={pathData(route.trace)} stroke="var(--prototype-car)" strokeWidth="14" fill="none" /><circle cx={car.x} cy={car.y} r="32" fill="var(--prototype-stop)" stroke="var(--background)" strokeWidth="10" /></svg><span className="block text-center text-xs text-muted-foreground">全线</span></div>
    {frame.observed && !['review','finished'].includes(frame.phase) && <div className="map-route-look absolute left-3 top-3 max-w-[58%] rounded-md border bg-background/95 px-3 py-2 text-base" role={replay ? undefined : 'status'}><span className="font-medium">观察范围已展开</span><p className="mt-1">{trafficMessage(traffic)}</p></div>}
  </div>
}
