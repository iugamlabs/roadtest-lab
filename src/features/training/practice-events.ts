import { z } from 'zod'
import { calibratedEventSchema } from '../content/schema'

// Preserve source timing/evidence. Only this separate runtime field moves a pause.
export const practiceEventSchema = calibratedEventSchema.and(z.object({ manualPauseMs: z.number().int().nonnegative().optional() }))
export type PracticeEvent = z.infer<typeof practiceEventSchema>
export function pauseTimeMs(event: PracticeEvent) { return event.manualPauseMs ?? event.practicePauseMs }
