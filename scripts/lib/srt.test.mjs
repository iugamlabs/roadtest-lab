import { describe, expect, it } from 'vitest'
import { parseSrt } from './srt.mjs'

describe('SRT source import', () => {
  it('preserves BOM/CRLF source text and millisecond precision without inventing corrections', () => {
    const [cue] = parseSrt('\uFEFF1\r\n00:03:48,500 --> 00:03:50,980\r\n请变更车道\r\n【待校对】原文\r\n')
    expect(cue).toEqual({ id: '1', startMs: 228500, endMs: 230980, rawText: '请变更车道\n【待校对】原文', correctedText: null, reviewStatus: 'unreviewed' })
  })
  it('does not silently accept corrupt or reversed timestamps', () => {
    expect(() => parseSrt('1\n00:61:00,000 --> 00:62:00,000\n原文')).toThrow()
    expect(() => parseSrt('1\n00:00:02,000 --> 00:00:01,000\n原文')).toThrow()
    expect(() => parseSrt('1\n没有时间\n原文')).toThrow()
  })
  it('returns an empty list for empty input', () => expect(parseSrt('')).toEqual([]))
})
