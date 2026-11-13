import { describe, expect, it } from 'vitest'
import { buildReviewedDocument, serializeSrt } from './subtitle-review.mjs'
import { parseSrt } from './srt.mjs'

function fixture() {
  const asr = { routeId: '5', source: 'asr', cues: parseSrt('1\n00:00:01,123 --> 00:00:02,456\n进入大雪路\n\n2\n00:00:06,000 --> 00:00:07,000\n前方路口右转\n') }
  const ocr = { routeId: '5', source: 'ocr', cues: parseSrt('1\n00:00:01,000 --> 00:00:02,000\n进入大学路\n\n2\n00:00:03,500 --> 00:00:04,500\n随后恢复车速\n') }
  const review = { version: 1, routeId: '5', corrections: [{ cueId: '1', expectedRawText: '进入大雪路', text: '进入大学路', reason: 'OCR 支持地名校正', evidence: [{ routeId: '5', source: 'ocr', cueId: '1' }] }], supplements: [], issues: [] }
  return { routeId: '5', asr, ocr, review, sources: [asr, ocr] }
}

describe('ASR-led subtitle editing', () => {
  it('preserves every ASR cue, timing and raw wording while exporting only final wording', () => {
    const input = fixture()
    const before = structuredClone(input)
    const result = buildReviewedDocument(input)
    expect(input).toEqual(before)
    expect(result.cues.map(cue => [cue.startMs, cue.endMs, cue.rawText])).toEqual(input.asr.cues.map(cue => [cue.startMs, cue.endMs, cue.rawText]))
    expect(result.cues[0].sourceRefs).toEqual([{ routeId: '5', source: 'asr', cueId: '1' }, { routeId: '5', source: 'ocr', cueId: '1' }])
    expect(parseSrt(serializeSrt(result.cues))[0]).toMatchObject({ startMs: 1123, endMs: 2456, rawText: '进入大学路' })
    expect(result.cues[1]).toMatchObject({ contentKind: 'instruction-candidate', reviewStatus: 'needs-review' })
  })
  it('rejects stale corrections and missing evidence', () => {
    const input = fixture()
    input.review.corrections[0].expectedRawText = '先前的原文'
    expect(() => buildReviewedDocument(input)).toThrow('原文已变化')
    input.review.corrections[0].expectedRawText = '进入大雪路'
    input.review.corrections[0].evidence[0].cueId = '999'
    expect(() => buildReviewedDocument(input)).toThrow('找不到来源')
  })
  it('only inserts explicit OCR supplements in ASR gaps, with original timing and provenance', () => {
    const input = fixture()
    input.review.supplements = [{ cueId: '2', expectedRawText: '随后恢复车速', text: '随后恢复车速', reason: '补入清晰 OCR 漏段', evidence: [] }]
    const result = buildReviewedDocument(input)
    expect(result.cues.map(cue => cue.id)).toEqual(['asr-1', 'ocr-2', 'asr-2'])
    expect(result.cues[1]).toMatchObject({ startMs: 3500, source: 'ocr', reviewStatus: 'needs-review' })
    input.review.supplements[0] = { cueId: '1', expectedRawText: '进入大学路', text: '进入大学路', reason: '重叠不可补入', evidence: [] }
    expect(() => buildReviewedDocument(input)).toThrow('与 ASR 重叠')
  })
  it('rejects duplicate edits, invalid issue references and mismatched routes', () => {
    const input = fixture()
    input.review.corrections.push(input.review.corrections[0])
    expect(() => buildReviewedDocument(input)).toThrow('重复修订')
    input.review.corrections.pop()
    input.review.issues.push({ cueIds: ['999'], reason: '疑点' })
    expect(() => buildReviewedDocument(input)).toThrow('找不到来源')
    input.review.routeId = '7'
    expect(() => buildReviewedDocument(input)).toThrow('路线或修订版本不一致')
  })
})
