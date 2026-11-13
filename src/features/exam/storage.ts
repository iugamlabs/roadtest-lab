import { z } from 'zod'
import { routeIdSchema } from '../content/schema'
import { EXAM_RULE_VERSION, faultSchema, operationSchema, type ExamState } from './engine'

export const examSettingsSchema = z.object({ voice: z.boolean() })
export const resultSchema = z.object({
  version: z.literal(EXAM_RULE_VERSION), id: z.string().min(1), routeId: routeIdSchema,
  seed: z.number().int().min(0).max(0xffffffff), finishedAt: z.string().datetime(), score: z.number().int().min(0).max(100),
  outcome: z.enum(['passed', 'failed', 'aborted']), elapsedMs: z.number().nonnegative(), completed: z.array(z.string()).max(64),
  faults: z.array(faultSchema).max(100),
  operations: z.array(z.object({ sceneId: z.string(), atMs: z.number().nonnegative(), operation: operationSchema })).max(2000),
}).superRefine((result, ctx) => {
  if (result.score !== Math.max(0, 100 - result.faults.reduce((sum, fault) => sum + fault.cost, 0))) ctx.addIssue({ code: 'custom', message: '成绩与扣分记录不符' })
  if (result.outcome === 'passed' && result.score < 90) ctx.addIssue({ code: 'custom', message: '低于90分不能合格' })
  if (result.outcome === 'failed' && result.score >= 90) ctx.addIssue({ code: 'custom', message: '不合格成绩与结果不符' })
})
export type ExamResult = z.infer<typeof resultSchema>
export const HISTORY_KEY = 'roadtest.scenario-exams.v1'
export const SETTINGS_KEY = 'roadtest.scenario-settings.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export function readHistory(storage: StoragePort): ExamResult[] {
  try {
    const raw = JSON.parse(storage.getItem(HISTORY_KEY) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.slice(0, 12).flatMap(item => { const parsed = resultSchema.safeParse(item); return parsed.success ? [parsed.data] : [] })
  } catch { return [] }
}
export function saveResult(storage: StoragePort, result: ExamResult) {
  const checked = resultSchema.parse(result)
  const history = [checked, ...readHistory(storage).filter(item => item.id !== checked.id)].slice(0, 12)
  try { storage.setItem(HISTORY_KEY, JSON.stringify(history)); return true } catch { return false }
}
export function resultFrom(state: ExamState, id: string, finishedAt = new Date().toISOString()): ExamResult {
  if (state.phase !== 'finished' || !state.outcome) throw new Error('考试尚未结束')
  return resultSchema.parse({ version: EXAM_RULE_VERSION, id, finishedAt, routeId: state.routeId, seed: state.seed, score: state.score, outcome: state.outcome,
    elapsedMs: state.elapsedMs, completed: state.completed, faults: state.faults, operations: state.operations })
}
