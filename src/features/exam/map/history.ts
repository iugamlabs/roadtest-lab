import { z } from 'zod'
import { routeIdSchema } from '../../content/schema'
import { MAP_RULE_VERSION, faultSchema, mapOperationSchema, type MapState } from './model'
import { mapRoute } from './routes'

export const MAP_HISTORY_KEY = 'roadtest.map-assessments.v1'
// v1 saved the old default-off preference even without a user action.
// Start the new audio experience enabled once, then preserve every explicit choice.
export const MAP_SETTINGS_KEY = 'roadtest.map-settings.v2'
export const mapSettingsSchema = z.object({ voice: z.boolean(), sound: z.boolean().default(true) })
export const mapResultSchema = z.object({
  version: z.literal(MAP_RULE_VERSION), id: z.string().min(1), routeId: routeIdSchema,
  seed: z.number().int().min(0).max(0xffffffff), finishedAt: z.string().datetime(),
  score: z.number().int().min(0).max(100), outcome: z.enum(['passed', 'failed', 'aborted']),
  elapsedMs: z.number().nonnegative(), completed: z.array(z.string()).max(64), faults: z.array(faultSchema).max(100),
  operations: z.array(z.object({ sceneId: z.string(), atMs: z.number().nonnegative(), operation: mapOperationSchema })).max(2000),
}).superRefine((result, ctx) => {
  const route = mapRoute(result.routeId)
  const ids = new Set(route.scenes.map(scene => scene.id))
  if (result.completed.some(id => !ids.has(id)) || new Set(result.completed).size !== result.completed.length) ctx.addIssue({ code: 'custom', message: '完成项目不属于路线或存在重复' })
  if (result.faults.some(fault => !ids.has(fault.sceneId) || route.scenes[fault.snapshot.index]?.id !== fault.sceneId || fault.snapshot.leg >= route.scenes[fault.snapshot.index].actions.length)) ctx.addIssue({ code: 'custom', message: '扣分路况与路线不符' })
  if (result.operations.some(op => !ids.has(op.sceneId) || op.atMs > result.elapsedMs)) ctx.addIssue({ code: 'custom', message: '操作记录与会话不符' })
  if (result.score !== Math.max(0, 100 - result.faults.length * 10)) ctx.addIssue({ code: 'custom', message: '分数与扣分记录不符' })
  if (result.outcome === 'passed' && (result.score < 90 || result.completed.length !== route.scenes.length)) ctx.addIssue({ code: 'custom', message: '合格应完成整条路线且达到90分' })
  if (result.outcome === 'failed' && result.score >= 90) ctx.addIssue({ code: 'custom', message: '不合格结果与成绩不符' })
})
export type MapResult = z.infer<typeof mapResultSchema>
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export function mapResult(state: MapState, id: string, finishedAt = new Date().toISOString()): MapResult {
  if (state.phase !== 'finished' || state.mode !== 'assessment' || state.single !== null || !state.outcome) throw new Error('仅记录整条路线的操作考核结果')
  return mapResultSchema.parse({ version: MAP_RULE_VERSION, id, finishedAt, routeId: state.route.id, seed: state.seed,
    score: state.score, outcome: state.outcome, elapsedMs: state.elapsedMs, completed: state.completed, faults: state.faults, operations: state.operations })
}
export function readMapHistory(storage: StoragePort): MapResult[] {
  try {
    const records: unknown = JSON.parse(storage.getItem(MAP_HISTORY_KEY) ?? '[]')
    if (!Array.isArray(records)) return []
    return records.slice(0, 12).flatMap(record => { const result = mapResultSchema.safeParse(record); return result.success ? [result.data] : [] })
  } catch { return [] }
}
export function saveMapResult(storage: StoragePort, result: MapResult) {
  const checked = mapResultSchema.parse(result)
  try { storage.setItem(MAP_HISTORY_KEY, JSON.stringify([checked, ...readMapHistory(storage).filter(record => record.id !== checked.id)].slice(0, 12))); return true } catch { return false }
}
export function readMapSettings(storage: StoragePort) {
  try { return mapSettingsSchema.parse(JSON.parse(storage.getItem(MAP_SETTINGS_KEY) ?? '{"voice":true,"sound":true}')) } catch { return { voice: true, sound: true } }
}
