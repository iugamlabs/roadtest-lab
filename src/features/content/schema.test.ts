import { describe, expect, it } from 'vitest'
import { trainingEventSchema, subtitleDocumentSchema } from './schema'
import { settingsSchema, defaultSettings } from '@/features/settings/settings'

describe('content boundaries', () => {
  it('rejects impossible event windows and unsupported route IDs', () => {
    const event = { id: 'test', routeId: '5', kind: 'lane-change', windowStartMs: 100, windowEndMs: 200, sourceCueIds: ['49'], reviewStatus: 'needs-review', guidance: '待核对' }
    expect(trainingEventSchema.safeParse(event).success).toBe(true)
    expect(trainingEventSchema.safeParse({ ...event, windowEndMs: 50 }).success).toBe(false)
    expect(trainingEventSchema.safeParse({ ...event, routeId: '8' }).success).toBe(false)
    expect(trainingEventSchema.safeParse({ ...event, sourceCueIds: [] }).success).toBe(false)
  })
  it('keeps OCR/ASR documents distinguishable and rejects broken cues', () => {
    const doc = { version: 1, routeId: '6', source: 'asr', sourceFile: 'test.srt', cues: [{ id: '1', startMs: 500, endMs: 1000, rawText: '原文', correctedText: null, reviewStatus: 'unreviewed' }] }
    expect(subtitleDocumentSchema.safeParse(doc).success).toBe(true)
    expect(subtitleDocumentSchema.safeParse({ ...doc, source: 'guessed' }).success).toBe(false)
    expect(subtitleDocumentSchema.safeParse({ ...doc, cues: [{ ...doc.cues[0], endMs: 300 }] }).success).toBe(false)
  })
  it('rejects masks extending outside the video and unsupported playback rates', () => {
    expect(settingsSchema.safeParse(defaultSettings).success).toBe(true)
    expect(settingsSchema.safeParse({ ...defaultSettings, maskTop: 90, maskHeight: 30 }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...defaultSettings, playbackRate: '10' }).success).toBe(false)
    for (const playbackRate of ['0.75', '1', '1.25', '1.5', '1.75', '2']) expect(settingsSchema.safeParse({ ...defaultSettings, playbackRate }).success).toBe(true)
  })
})
