import { z } from 'zod'

export const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() })
export type Point = z.infer<typeof pointSchema>
export const point = (x: number, y: number): Point => ({ x, y })
export const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const between = (a: Point, b: Point, t: number) => t >= 1 - 1e-10 ? b : t <= 1e-10 ? a : point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

/** Round authored corners inside their road footprint, using the same samples
 * for drawing, car positions and headings. No DOM or browser path sampling. */
export function rounded(points: Point[]): Point[] {
  if (points.length < 3) return points
  const result = [points[0]]
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1]
    const ab = distance(a, b), bc = distance(b, c)
    if (!ab || !bc) continue
    const radius = Math.min(18, ab / 3, bc / 3)
    const before = between(b, a, radius / ab), after = between(b, c, radius / bc)
    result.push(before)
    for (let step = 1; step <= 8; step++) {
      const t = step / 8
      result.push(point((1 - t) ** 2 * before.x + 2 * (1 - t) * t * b.x + t ** 2 * after.x,
        (1 - t) ** 2 * before.y + 2 * (1 - t) * t * b.y + t ** 2 * after.y))
    }
  }
  result.push(points.at(-1)!)
  return result
}
export function pathLength(path: Point[]) { return path.slice(1).reduce((sum, p, i) => sum + distance(path[i], p), 0) }
export function poseAt(path: Point[], progress: number) {
  const length = pathLength(path)
  let remaining = Math.max(0, Math.min(1, progress)) * length
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], segment = distance(a, b)
    if (!segment) continue
    if (remaining <= segment || i === path.length - 1) return { ...between(a, b, Math.min(1, remaining / segment)), angle: Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI }
    remaining -= segment
  }
  return { ...(path[0] ?? point(0, 0)), angle: 0 }
}
export const pathData = (path: Point[]) => path.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')

export const roadRects = [
  { x: 70, y: 0, width: 180, height: 1900, lanes: 4, vertical: true },
  { x: 440, y: 150, width: 120, height: 1020, lanes: 4, vertical: true },
  { x: 880, y: 670, width: 100, height: 440, lanes: 2, vertical: true },
  { x: 160, y: 670, width: 820, height: 100, lanes: 2, vertical: false },
  { x: 440, y: 850, width: 540, height: 100, lanes: 2, vertical: false },
  { x: 160, y: 990, width: 820, height: 120, lanes: 4, vertical: false },
  { x: 225, y: 1740, width: 185, height: 60, lanes: 1, vertical: false },
] as const
export function onRoad(p: Point) {
  return roadRects.some(road => p.x >= road.x && p.x <= road.x + road.width && p.y >= road.y && p.y <= road.y + road.height)
}
