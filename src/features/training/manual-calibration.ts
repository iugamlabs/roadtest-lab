import { z } from 'zod'
import { calibratedEventDocumentSchema, routeIdSchema } from '../content/schema'
import { pauseTimeMs, type PracticeEvent } from './practice-events'

export type EventDocument = z.infer<typeof calibratedEventDocumentSchema>
const ms = z.number().int().nonnegative()
const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const manualCalibrationSchema = z.object({
  version: z.literal(1),
  routeId: routeIdSchema,
  videoSha256: hash,
  subtitleSha256: hash,
  durationMs: z.number().int().positive(),
  entries: z.array(z.object({
    eventId: z.string().min(1),
    sourcePauseMs: ms,
    sourceWindowStartMs: ms,
    sourceWindowEndMs: ms,
    pauseMs: ms,
  })).max(200),
}).refine(value => new Set(value.entries.map(entry => entry.eventId)).size === value.entries.length, { message: '校准项目重复' })
export type ManualCalibration = z.infer<typeof manualCalibrationSchema>
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
const storageKey = (source: EventDocument) => `roadtest.practice-calibration.v1.${source.routeId}`

export function resolveCalibration(source: EventDocument, input: unknown, durationMs?: number): { record: ManualCalibration; events: PracticeEvent[] } {
  const parsed = manualCalibrationSchema.safeParse(input)
  if (!parsed.success) throw new Error('校准记录格式不正确，请重新校准或选择正确的备份文件。')
  const record = parsed.data
  if (record.routeId !== source.routeId) throw new Error('这份校准不属于当前路线。')
  if (record.videoSha256 !== source.videoSha256 || record.subtitleSha256 !== source.subtitleSha256) throw new Error('路线素材已更新，旧校准未应用，请重新校准。')
  const overrides = new Map(record.entries.map(entry => [entry.eventId, entry]))
  if (record.entries.some(entry => !source.events.some(event => event.id === entry.eventId))) throw new Error('校准记录包含当前路线没有的项目。')
  const limit = durationMs ?? record.durationMs
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('请等待视频载入后再校准。')
  const events: PracticeEvent[] = source.events.map(event => {
    const entry = overrides.get(event.id)
    if (!entry) return event
    if (entry.sourcePauseMs !== event.practicePauseMs || entry.sourceWindowStartMs !== event.windowStartMs || entry.sourceWindowEndMs !== event.windowEndMs) throw new Error('项目默认时间已更新，旧校准未应用，请重新校准。')
    return { ...event, manualPauseMs: entry.pauseMs }
  })
  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const time = pauseTimeMs(event)
    if (time >= limit) throw new Error(`「${event.title}」的时间必须早于视频结尾。`)
    if (i > 0 && time <= pauseTimeMs(events[i - 1])) throw new Error(`「${event.title}」必须晚于「${events[i - 1].title}」，请检查相邻项目时间。`)
  }
  return { record, events: record.entries.length ? events : source.events }
}

export function makeCalibration(source: EventDocument, overrides: Record<string, number>, durationMs: number) {
  if (Object.keys(overrides).some(id => !source.events.some(event => event.id === id))) throw new Error('找不到要校准的项目。')
  const record = {
    version: 1 as const,
    routeId: source.routeId,
    videoSha256: source.videoSha256,
    subtitleSha256: source.subtitleSha256,
    durationMs,
    entries: source.events.flatMap(event => overrides[event.id] === undefined || overrides[event.id] === event.practicePauseMs ? [] : [{
      eventId: event.id,
      sourcePauseMs: event.practicePauseMs,
      sourceWindowStartMs: event.windowStartMs,
      sourceWindowEndMs: event.windowEndMs,
      pauseMs: overrides[event.id],
    }]),
  }
  return resolveCalibration(source, record, durationMs).record
}

export function readCalibration(source: EventDocument, storage?: StoragePort): { record: ManualCalibration | null; message: string } {
  let text: string | null
  try { text = (storage ?? localStorage).getItem(storageKey(source)) }
  catch { return { record: null, message: '浏览器未允许读取本机校准，当前使用默认时间。' } }
  if (!text) return { record: null, message: '' }
  try {
    return { record: resolveCalibration(source, JSON.parse(text)).record, message: '' }
  } catch (error) {
    return { record: null, message: error instanceof Error && !(error instanceof SyntaxError) ? error.message : '本机校准记录无法读取，当前使用默认时间。' }
  }
}

export function writeCalibration(source: EventDocument, record: ManualCalibration, storage?: StoragePort) {
  try {
    resolveCalibration(source, record)
    const target = storage ?? localStorage
    target.setItem(storageKey(source), JSON.stringify(record))
    return true
  } catch { return false }
}

// Decimal seconds and mm:ss.mmm both support exact millisecond edits.
export function parseCalibrationTime(value: string): number {
  const text = value.trim()
  const match = /^(?:(\d+):([0-5]\d)|([0-9]+))(?:\.(\d{1,3}))?$/.exec(text)
  if (!match) throw new Error('请输入分:秒（如 03:48.500），也可以输入秒数。')
  const seconds = match[3] !== undefined ? Number(match[3]) : Number(match[1]) * 60 + Number(match[2])
  const result = seconds * 1000 + Number((match[4] ?? '').padEnd(3, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('时间数值过大。')
  return result
}
export function formatCalibrationTime(ms: number) {
  const value = Math.max(0, Math.round(ms))
  return `${String(Math.floor(value / 60000)).padStart(2, '0')}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`
}
