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
