import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reviewedSubtitleDocumentSchema, subtitleDocumentSchema, subtitleText } from './schema'

const root = new URL('../../../', import.meta.url)
const json = (path: string) => JSON.parse(readFileSync(new URL(path, root), 'utf8'))

describe('published subtitle corpus', () => {
  for (const routeId of ['5', '6', '7']) {
    it(`route ${routeId} preserves ASR timing and a resolvable source for every final cue`, () => {
      const doc = reviewedSubtitleDocumentSchema.parse(json(`public/data/route-${routeId}.subtitles.json`))
      const asr = subtitleDocumentSchema.parse(json(`content/subtitle-sources/route-${routeId}.asr.json`))
      const ocr = subtitleDocumentSchema.parse(json(`public/data/route-${routeId}.ocr.json`))
      expect(doc.routeId).toBe(routeId)
      expect(doc.cues.filter(cue => cue.source === 'asr')).toHaveLength(asr.cues.length)
      expect(doc.summary.asrCueCount).toBe(asr.cues.length)
      expect(doc.summary.correctionCount).toBe(doc.cues.filter(cue => cue.source === 'asr' && cue.correctedText !== null).length)
      expect(doc.summary.supplementCount).toBe(doc.cues.filter(cue => cue.source === 'ocr').length)
      expect(doc.summary.pendingCueCount).toBe(doc.cues.filter(cue => cue.reviewStatus === 'needs-review').length)
      for (const cue of doc.cues) {
        const source = (cue.source === 'asr' ? asr : ocr).cues.find(value => value.id === cue.sourceCueId)!
        expect(source).toBeDefined()
        expect([cue.startMs, cue.endMs, cue.rawText]).toEqual([source.startMs, source.endMs, source.rawText])
        for (const ref of cue.sourceRefs) {
          const path = ref.source === 'asr' ? `content/subtitle-sources/route-${ref.routeId}.asr.json` : `public/data/route-${ref.routeId}.ocr.json`
          expect(subtitleDocumentSchema.parse(json(path)).cues.some(value => value.id === ref.cueId)).toBe(true)
        }
        expect(subtitleText(cue).trim()).not.toBe('')
        expect(subtitleText(cue)).not.toMatch(/【待校对】|此处字幕未识别/)
      }
      expect(reviewedSubtitleDocumentSchema.safeParse({ ...doc, cues: [doc.cues[0], ...doc.cues] }).success).toBe(false)
      expect(reviewedSubtitleDocumentSchema.safeParse({ ...doc, cues: [...doc.cues].reverse() }).success).toBe(false)
    })
  }
  it('shows corrected wording and keeps ambiguous instructions pending internally', () => {
    const doc = reviewedSubtitleDocumentSchema.parse(json('public/data/route-5.subtitles.json'))
    const corrected = doc.cues.find(cue => cue.id === 'asr-12')!
    expect(corrected.rawText).toContain('大雪路')
    expect(subtitleText(corrected)).toContain('大学路')
    expect(doc.cues.find(cue => cue.id === 'asr-190')?.reviewStatus).toBe('needs-review')
    expect(doc.cues.find(cue => cue.id === 'asr-81')?.reviewStatus).toBe('needs-review')
  })
})
