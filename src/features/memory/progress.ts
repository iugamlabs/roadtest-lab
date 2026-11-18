import { z } from 'zod'
import { routeIdSchema, type CalibratedEvent, type RouteId } from '@/features/content/schema'
import { memoryRatingSchema, type MemoryAnswer } from './model'

const progressEntrySchema = z.object({
  eventId: z.string().regex(/^[567]-[a-z0-9-]+$/),
  rating: memoryRatingSchema,
  usedHint: z.boolean(),
  attempts: z.number().int().min(1).max(1_000_000),
  updatedAt: z.number().int().nonnegative(),
}).refine(entry => !entry.usedHint || entry.rating !== 'independent')
export type MemoryProgressEntry = z.infer<typeof progressEntrySchema>
const progressSchema = z.object({
  version: z.literal(1), routeId: routeIdSchema,
  videoSha256: z.string().regex(/^[a-f0-9]{64}$/),
  subtitleSha256: z.string().regex(/^[a-f0-9]{64}$/),
  lessonSignature: z.string().min(1).max(50_000),
  entries: z.array(progressEntrySchema).max(100),
}).superRefine((value, ctx) => {
  if (value.entries.some(entry => !entry.eventId.startsWith(`${value.routeId}-`)) || new Set(value.entries.map(entry => entry.eventId)).size !== value.entries.length) ctx.addIssue({ code: 'custom', message: '路线记忆记录不一致' })
})
export type MemorySource = { routeId: RouteId; videoSha256: string; subtitleSha256: string; events: CalibratedEvent[] }
type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>
const storageKey = (routeId: RouteId) => `roadtest.route-memory.v1.${routeId}`
const lessonSignature = (source: MemorySource) => JSON.stringify(source.events.map(event => [event.id, event.title, event.kind, event.direction, event.windowStartMs, event.windowEndMs, event.guidance]))

export function readMemoryProgress(storage: StorageReader, source: MemorySource): { entries: MemoryProgressEntry[]; notice: string } {
  try {
    const raw = storage.getItem(storageKey(source.routeId))
    if (!raw) return { entries: [], notice: '' }
    const parsed = progressSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return { entries: [], notice: '之前的记忆记录无法读取，可以重新练习。' }
    const data = parsed.data
    if (data.routeId !== source.routeId || data.videoSha256 !== source.videoSha256 || data.subtitleSha256 !== source.subtitleSha256 || data.lessonSignature !== lessonSignature(source)) return { entries: [], notice: '路线内容已更新，请重新回忆核对。' }
    return { entries: data.entries.filter(entry => source.events.some(event => event.id === entry.eventId)), notice: '' }
  } catch { return { entries: [], notice: '本机记录暂时不可用，仍可完成本次练习。' } }
}

export function recordMemoryAnswer(entries: MemoryProgressEntry[], answer: MemoryAnswer, updatedAt = Date.now()): MemoryProgressEntry[] {
  return [...entries.filter(entry => entry.eventId !== answer.eventId), {
    ...answer,
    rating: answer.usedHint && answer.rating === 'independent' ? 'prompted' as const : answer.rating,
    attempts: Math.min(1_000_000, (entries.find(entry => entry.eventId === answer.eventId)?.attempts ?? 0) + 1), updatedAt,
  }]
}

export function saveMemoryProgress(storage: StorageWriter, source: MemorySource, entries: MemoryProgressEntry[]) {
  try {
    const data = progressSchema.parse({ version: 1, routeId: source.routeId, videoSha256: source.videoSha256, subtitleSha256: source.subtitleSha256, lessonSignature: lessonSignature(source), entries })
    storage.setItem(storageKey(source.routeId), JSON.stringify(data))
    return true
  } catch { return false }
}
