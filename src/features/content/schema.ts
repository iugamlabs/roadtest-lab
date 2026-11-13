import { z } from 'zod'

export const routeIdSchema = z.enum(['5', '6', '7'])
export type RouteId = z.infer<typeof routeIdSchema>
export const subtitleCueSchema = z.object({
  id: z.string(),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  rawText: z.string().min(1),
  correctedText: z.string().nullable(),
  reviewStatus: z.enum(['unreviewed', 'needs-review', 'verified']),
}).refine(cue => cue.endMs > cue.startMs, { message: '字幕结束时间必须晚于开始时间' })
export const subtitleDocumentSchema = z.object({
  version: z.literal(1),
  routeId: routeIdSchema,
  source: z.enum(['ocr', 'asr']),
  sourceFile: z.string(),
  cues: z.array(subtitleCueSchema),
})
export type SubtitleCue = z.infer<typeof subtitleCueSchema>

// Editorial metadata stays in the repository/data; learners see one subtitle text.
const sourceRefSchema = z.object({
  routeId: routeIdSchema,
  source: z.enum(['asr', 'ocr']),
  cueId: z.string().min(1),
})
export const reviewedSubtitleCueSchema = z.object({
  id: z.string().min(1),
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(),
  rawText: z.string().min(1),
  correctedText: z.string().min(1).nullable(),
  reviewStatus: z.enum(['text-reviewed', 'needs-review']),
  source: z.enum(['asr', 'ocr']),
  sourceCueId: z.string().min(1),
  sourceRefs: z.array(sourceRefSchema).min(1),
  editReason: z.string().min(1).nullable(),
  reviewNotes: z.array(z.string().min(1)),
  contentKind: z.enum(['instruction-candidate', 'commentary', 'ocr-supplement']),
}).refine(cue => cue.endMs > cue.startMs, { message: '字幕结束时间必须晚于开始时间' })
export const reviewedSubtitleDocumentSchema = z.object({
  version: z.literal(1),
  routeId: routeIdSchema,
  primarySource: z.literal('asr'),
  reviewScope: z.literal('text-only'),
  summary: z.object({
    asrCueCount: z.number().int().nonnegative(),
    correctionCount: z.number().int().nonnegative(),
    supplementCount: z.number().int().nonnegative(),
    pendingCueCount: z.number().int().nonnegative(),
    unmatchedOcrCueIds: z.array(z.string()),
  }),
  cues: z.array(reviewedSubtitleCueSchema).min(1),
}).refine(document => {
  const ids = new Set(document.cues.map(cue => cue.id))
  return ids.size === document.cues.length && document.cues.every((cue, index) => index === 0 || cue.startMs >= document.cues[index - 1].startMs)
}, { message: '字幕 ID 不可重复，且必须按时间排列' })
export type ReviewedSubtitleCue = z.infer<typeof reviewedSubtitleCueSchema>

export function subtitleText(cue: Pick<ReviewedSubtitleCue, 'rawText' | 'correctedText'>) {
  return cue.correctedText ?? cue.rawText
}

// Content authoring contract. Empty until the source video has been reviewed.
export const trainingEventSchema = z.object({
  id: z.string(),
  routeId: routeIdSchema,
  kind: z.enum(['turn', 'lane-change', 'brake', 'uturn', 'overtake', 'parking', 'stop-and-observe', 'straight']),
  direction: z.enum(['left', 'right']).optional(),
  instructionMs: z.number().int().nonnegative().optional(),
  windowStartMs: z.number().int().nonnegative(),
  windowEndMs: z.number().int().positive(),
  sourceCueIds: z.array(z.string()).min(1),
  reviewStatus: z.enum(['needs-review', 'verified']),
  guidance: z.string(),
}).refine(event => event.windowEndMs > event.windowStartMs, { message: '事件结束时间必须晚于开始时间' })
export type TrainingEvent = z.infer<typeof trainingEventSchema>
