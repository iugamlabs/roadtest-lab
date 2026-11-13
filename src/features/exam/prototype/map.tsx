import { useIsMobile } from '@/hooks/use-mobile'
import { carPose, trafficBusy, type PrototypeState } from './model'

function Car({ x, y, angle = 0, self = false, indicator, brake = false }: { x: number; y: number; angle?: number; self?: boolean; indicator?: PrototypeState['indicator']; brake?: boolean }) {
  return <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <rect x="-18" y="-30" width="36" height="65" rx="10" fill={self ? 'var(--prototype-car)' : 'var(--prototype-other-car)'} stroke="var(--prototype-road-ink)" strokeWidth="2" />
    <path d="M-12 -13 L-10 -22 H10 L12 -13 Z M-12 19 L-10 26 H10 L12 19 Z" fill="var(--prototype-glass)" />
    <path d="M-12 -5 V13 M12 -5 V13" stroke="var(--prototype-glass)" strokeWidth="2" />
    <path d="M-6 -33 L0 -41 L6 -33" fill={self ? 'var(--prototype-car)' : 'var(--prototype-other-car)'} />
    {self && <><rect x="-17" y="29" width="8" height="5" rx="1" fill={brake ? 'var(--prototype-stop)' : 'var(--prototype-line)'} /><rect x="9" y="29" width="8" height="5" rx="1" fill={brake ? 'var(--prototype-stop)' : 'var(--prototype-line)'} /></>}
    {indicator && <g fill="var(--prototype-lamp)"><rect x={indicator === 'left' ? -24 : 17} y="-22" width="7" height="12" rx="2" /><rect x={indicator === 'left' ? -24 : 17} y="18" width="7" height="12" rx="2" /></g>}
  </g>
}
export function PrototypeMap({ state }: { state: PrototypeState }) {
  const mobile = useIsMobile()
  const car = carPose(state)
  const busy = trafficBusy(state) && state.phase !== 'ready'
  const pedestrianY = 185 + state.elapsedMs / 18000 * 155
  const rearY = 540 - state.progress * 180 + 220 - state.elapsedMs / 18000 * 290
  const description = state.fragment === 'turn' ? '大学路北行，前方右转进入工业区。' : '大学路北行，从右侧车道向左变更一条车道。'
  return <svg viewBox={mobile ? `${Math.max(90, car.x - 210)} 150 520 460` : '60 110 860 490'} className="prototype-map" role="img" aria-label={`五号线局部路线图。${description}${busy ? state.fragment === 'turn' ? '前方人行横道有行人。' : '左侧车道有车辆驶来。' : '当前交通冲突已解除。'}`}>
    <rect x="0" y="0" width="1100" height="800" fill="var(--background)" />
    <g fill="var(--muted)" stroke="var(--border)" strokeWidth="2">
      <rect x="335" y="20" width="300" height="155" rx="6" /><rect x="335" y="345" width="300" height="295" rx="6" />
      <rect x="790" y="20" width="260" height="155" rx="6" /><rect x="790" y="345" width="260" height="295" rx="6" />
    </g>
    <g fill="var(--prototype-road)"><path d="M150 0 H310 V200 H1100 V320 H310 V800 H150 Z" /><rect x="675" y="0" width="90" height="800" /></g>
    <g fill="none" stroke="var(--prototype-line)" strokeWidth="2.5">
      <path d="M155 0 V800 M305 0 V205 H1100 M305 315 H1100 M680 0 V200 M760 0 V200 M680 320 V800 M760 320 V800" />
      <path d="M190 0 V800 M230 0 V800 M270 0 V800" strokeDasharray="15 14" />
      <path d="M310 260 H675 M765 260 H1100" strokeDasharray="18 15" />
      <path d="M720 0 V200 M720 320 V800" strokeDasharray="18 15" />
      <path d="M160 345 H300" strokeWidth="5" />
      {Array.from({ length: 7 }, (_, i) => <path key={i} d={`M350 ${210 + i * 15} H390`} strokeWidth="7" />)}
      {[170, 210, 250, 290].map(x => <path key={x} d={`M${x} 460 V425 M${x - 5} 432 L${x} 425 L${x + 5} 432`} strokeWidth="2" />)}
      <path d="M500 290 H535 M528 285 L535 290 L528 295 M570 230 H535 M542 225 L535 230 L542 235" />
    </g>
    <g fill="var(--muted-foreground)" fontSize="23" textAnchor="middle" fontFamily="inherit">
      <text x="480" y="415">工业区</text><text x="480" y="450" fontSize="18">沿路线自动行驶</text>
      {['大', '学', '路'].map((text, i) => <text key={text} x="115" y={380 + i * 32}>{text}</text>)}
      <path d="M845 160 V130 M837 140 L845 130 L853 140" stroke="var(--muted-foreground)" strokeWidth="2" fill="none" /><text x="845" y="190" fontSize="18">北</text>
    </g>
    <path d={state.fragment === 'turn' ? 'M280 575 V310 Q280 280 310 280 H620' : 'M280 575 V370 C280 310 240 310 240 250 V170'} fill="none" stroke="var(--prototype-car)" strokeWidth="4" strokeDasharray="8 9" opacity=".55" />
    {state.observed && <g stroke="var(--prototype-observe)" strokeWidth="2" strokeDasharray="7 7" fill="var(--prototype-observe-soft)">
      {state.fragment === 'lane' ? <rect x="192" y="220" width="72" height="375" rx="25" /> : <rect x="325" y="182" width="90" height="164" rx="15" />}
    </g>}
    {busy && state.fragment === 'turn' && <g transform={`translate(370 ${pedestrianY})`} fill="var(--prototype-person)" stroke="var(--prototype-person)" strokeWidth="5" strokeLinecap="round">
      <circle cy="-13" r="7" stroke="none" /><path d="M0 0 V17 M-11 6 L0 1 L11 6 M0 17 L-9 30 M0 17 L9 30" fill="none" />
      <rect x="23" y="-13" width="75" height="28" rx="4" fill="var(--background)" stroke="none" /><text x="60" y="7" textAnchor="middle" stroke="none" fontSize="18">行人</text>
    </g>}
    {busy && state.fragment === 'lane' && <><Car x={240} y={rearY} /><text x="195" y={rearY} textAnchor="end" fill="var(--foreground)" fontSize="18">来车</text></>}
    <Car {...car} self indicator={state.indicator} brake={state.stopped || state.slow} />
    <g transform={`translate(${car.x + 40} ${car.y - 8})`}><rect x="0" y="-18" width="58" height="31" rx="5" fill="var(--background)" stroke="var(--border)" /><text x="29" y="4" textAnchor="middle" fontSize="18" fill="var(--foreground)">本车</text></g>
  </svg>
}
