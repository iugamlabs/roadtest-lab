import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateCalibration, publishCalibration, evidenceSeconds } from './calibration.mjs'
import { calibratedEventDocumentSchema } from '../../src/features/content/schema'

const root = new URL('../../', import.meta.url)
const bytes = path => readFileSync(new URL(path, root))
const json = path => JSON.parse(bytes(path))
function fixture(id = '5') {
  return {
    doc: json(`content/event-calibrations/route-${id}.json`),
    subtitles: json(`public/data/route-${id}.subtitles.json`),
    bytes: bytes(`public/data/route-${id}.subtitles.json`),
    media: json('content/event-calibrations/media.json').media.find(media => media.routeId === id),
  }
}
const validate = f => validateCalibration(f.doc, f.subtitles, f.bytes, f.media)

describe('video calibration provenance and publication', () => {
  for (const id of ['5', '6', '7']) {
    it(`route ${id} resolves every command candidate and publishes only visually usable practice events`, () => {
      const f = fixture(id)
      const before = structuredClone(f.doc)
      const doc = validate(f)
      const output = publishCalibration(doc)
      expect(f.doc).toEqual(before)
      expect(calibratedEventDocumentSchema.parse(output).examEvents).toEqual([])
      expect(json(`public/data/route-${id}.events.json`)).toEqual(output)
      expect(output.events.every(event => event.timingStatus === 'visual-reviewed' && !event.blockers.length)).toBe(true)
      expect(doc.annotations.some(item => item.kind === 'school-exit')).toBe(true)
      expect(doc.events.some(event => /学校/.test(event.title) && event.category === 'command')).toBe(false)
    })
  }
  it('rejects changed subtitles, changed media and dangling provenance instead of silently reusing timing', () => {
    const f = fixture()
    f.bytes = Buffer.from('{}')
    expect(() => validate(f)).toThrow('字幕已变化')
    const g = fixture()
    g.media.sha256 = '0'.repeat(64)
    expect(() => validate(g)).toThrow('视频指纹已变化')
    const h = fixture()
    h.doc.events[0].sourceCueIds.push('asr-missing')
    expect(() => validate(h)).toThrow('来源字幕缺失')
  })
  it('rejects dropped command candidates, false commentary anchors and out-of-media evidence', () => {
    const f = fixture()
    f.doc.events = f.doc.events.filter(event => !event.instructionCueIds.includes('asr-50'))
    expect(() => validate(f)).toThrow('口令候选未处理')
    const g = fixture('6')
    const turn = g.doc.events.find(event => event.id === '6-return-turn')
    turn.instructionMs = 290050
    expect(() => validate(g)).toThrow()
    const h = fixture()
    h.doc.events[0].evidence[0].atMs = h.media.durationMs + 1
    expect(() => validate(h)).toThrow('时间超出视频')
  })
  it('retains waiting gaps, distinguishes the late stop from the earlier command, and excludes unsafe demonstrations', () => {
    const f = fixture('7')
    const stop = validate(f).events.find(event => event.id === '7-stop-look-2')
    expect(stop.instructionMs).toBe(591050)
    // The car ahead turns out around 11:07; the camera car approaches later.
    expect(stop.windowStartMs).toBeGreaterThan(670000)
    const turn = validate(f).events.find(event => event.id === '7-return-turn')
    expect(turn.windowStartMs).toBeGreaterThanOrEqual(stop.windowEndMs)
    const g = fixture('6')
    const doc = validate(g)
    expect(doc.annotations.some(item => item.kind === 'negative-example')).toBe(true)
    expect(publishCalibration(doc).excludedEventIds).toContain('6-return-turn')
    expect(doc.events.some(event => event.category === 'route-choice' && event.windowStartMs >= 583000 && event.windowStartMs < 592000)).toBe(false)
  })
  it('never upgrades guessed or blocked events into scoring data and clamps screenshot requests to real footage', () => {
    const doc = validate(fixture())
    doc.events[0].timingStatus = 'needs-review'
    doc.events[0].blockers = ['待核对']
    const output = publishCalibration(doc)
    expect(output.events.map(event => event.id)).not.toContain(doc.events[0].id)
    expect(output.examEvents).toEqual([])
    expect(calibratedEventDocumentSchema.safeParse({ ...output, examEvents: [doc.events[1]] }).success).toBe(false)
    expect(evidenceSeconds({ windowStartMs: 0, windowEndMs: 787800 }, 787833)).toEqual([0, 2, 786, 787])
  })
})
