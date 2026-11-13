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

// Media calibration is a separate review scope from driving/examination rules.
// Frame inspection must never silently grant permission to score an event.
const msSchema = z.number().int().nonnegative()
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const calibratedEventSchema = z.object({
  id: z.string().regex(/^[567]-[a-z0-9-]+$/),
  title: z.string().min(1),
  kind: z.enum(['turn', 'lane-change', 'brake', 'uturn', 'overtake', 'parking', 'stop-and-observe', 'straight']),
  direction: z.enum(['left', 'right']).nullable(),
  category: z.enum(['command', 'silent', 'route-choice']),
  instructionCueIds: z.array(z.string().min(1)),
  instructionMs: msSchema.nullable(),
  instructionStatus: z.enum(['asr-caption-supported', 'commentary-only', 'not-applicable']),
  sourceCueIds: z.array(z.string().min(1)).min(1),
  windowStartMs: msSchema,
  windowEndMs: msSchema,
  practicePauseMs: msSchema,
  timingStatus: z.enum(['visual-reviewed', 'needs-review']),
  uncertaintyMs: z.number().int().positive(),
  evidence: z.array(z.object({ atMs: msSchema, observation: z.string().min(1) })).min(2),
  guidance: z.string().min(1),
  notes: z.array(z.string().min(1)),
  blockers: z.array(z.string().min(1)),
  // Deliberately literal until a separately sourced rule review is implemented.
  ruleStatus: z.literal('unverified'),
  audioStatus: z.literal('asr-only'),
}).superRefine((event, ctx) => {
  if (event.windowEndMs <= event.windowStartMs) ctx.addIssue({ code: 'custom', message: '动作区间必须递增' })
  if (event.practicePauseMs < event.windowStartMs || event.practicePauseMs >= event.windowEndMs) ctx.addIssue({ code: 'custom', message: '练习暂停点必须位于动作区间内' })
  if ((event.instructionMs === null) !== (event.instructionCueIds.length === 0)) ctx.addIssue({ code: 'custom', message: '口令时间必须与口令来源同时提供' })
  if (event.category !== 'command' && event.instructionMs !== null) ctx.addIssue({ code: 'custom', message: '无口令项目不能伪造口令时间' })
  if (event.instructionStatus === 'commentary-only' && event.instructionMs !== null) ctx.addIssue({ code: 'custom', message: '讲解起点不能充当口令时间' })
  if (['turn', 'lane-change', 'uturn', 'parking'].includes(event.kind) && event.direction === null && !event.blockers.length) ctx.addIssue({ code: 'custom', message: '方向未确定的项目必须说明阻塞原因' })
  if (event.timingStatus === 'needs-review' && !event.blockers.length) ctx.addIssue({ code: 'custom', message: '待核对项目必须说明阻塞原因' })
})
export type CalibratedEvent = z.infer<typeof calibratedEventSchema>

export const routeCalibrationSchema = z.object({
  version: z.literal(1),
  routeId: routeIdSchema,
  reviewScope: z.literal('sampled-video-timing'),
  videoSha256: hashSchema,
  subtitleSha256: hashSchema,
  events: z.array(calibratedEventSchema).min(1),
  annotations: z.array(z.object({
    id: z.string().min(1),
    startMs: msSchema,
    endMs: msSchema,
    kind: z.enum(['school-exit', 'speed-explanation', 'traffic-wait', 'editorial-hold', 'negative-example', 'conditional-choice', 'finish']),
    sourceCueIds: z.array(z.string().min(1)),
    note: z.string().min(1),
  })),
  issues: z.array(z.object({
    id: z.string().min(1),
    startMs: msSchema,
    endMs: msSchema,
    question: z.string().min(1),
    impact: z.string().min(1),
  })),
})

export function isPracticeReady(event: CalibratedEvent) {
  return event.timingStatus === 'visual-reviewed' && event.blockers.length === 0
}

// These files describe media timing only. Formal exam publication is blocked.
export function isExamReady(_event: CalibratedEvent): boolean {
  return false
}

export const calibrationMediaSchema = z.object({
  version: z.literal(1),
  media: z.array(z.object({
    routeId: routeIdSchema,
    file: z.string().regex(/^raw\/[^/]+\.mp4$/),
    sha256: hashSchema,
    durationMs: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    frameRate: z.literal('30/1'),
    hasAudio: z.boolean(),
  })).length(3),
}).refine(doc => new Set(doc.media.map(media => media.routeId)).size === 3, { message: '三条路线必须各有一份原片记录' })

export const calibratedEventDocumentSchema = z.object({
  version: z.literal(1),
  routeId: routeIdSchema,
  reviewScope: z.literal('sampled-video-timing'),
  videoSha256: hashSchema,
  subtitleSha256: hashSchema,
  events: z.array(calibratedEventSchema),
  excludedEventIds: z.array(z.string().min(1)),
  examEvents: z.array(z.never()).max(0),
}).superRefine((doc, ctx) => {
  if (doc.events.some(event => !event.id.startsWith(`${doc.routeId}-`) || !isPracticeReady(event))) ctx.addIssue({ code: 'custom', message: '练习事件不能混入未通过复核的项目或其他路线' })
  const ids = doc.events.map(event => event.id)
  if (new Set([...ids, ...doc.excludedEventIds]).size !== ids.length + doc.excludedEventIds.length) ctx.addIssue({ code: 'custom', message: '事件或排除项 ID 重复' })
  if (doc.events.some((event, index) => index > 0 && event.practicePauseMs < doc.events[index - 1].practicePauseMs)) ctx.addIssue({ code: 'custom', message: '练习事件必须按暂停时间排列' })
})
