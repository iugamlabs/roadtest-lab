import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calibratedEventDocumentSchema } from '../content/schema'
import { createTrainingState, trainingReducer } from './engine'
import { TrainingController, type VideoPort } from './controller'
import { formatCalibrationTime, makeCalibration, parseCalibrationTime, readCalibration, resolveCalibration, writeCalibration } from './manual-calibration'
import { pauseTimeMs } from './practice-events'

const source = (id = '5') => calibratedEventDocumentSchema.parse(JSON.parse(readFileSync(`public/data/route-${id}.events.json`, 'utf8')))
const durationMs = 694000
function storage() {
  const records = new Map<string, string>()
  return { records, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value) } }
}

describe('manual pause calibration', () => {
  it('preserves source windows and review status even when a manual time is outside the AI window', () => {
    const doc = source()
    const before = structuredClone(doc)
    const event = doc.events[0]
    expect(event.windowStartMs).toBeGreaterThan(1000)
    const record = makeCalibration(doc, { [event.id]: 1000 }, durationMs)
    const { events } = resolveCalibration(doc, record)
    expect(pauseTimeMs(events[0])).toBe(1000)
    expect(events[0]).toMatchObject({ practicePauseMs: event.practicePauseMs, windowStartMs: event.windowStartMs, windowEndMs: event.windowEndMs, ruleStatus: 'unverified', audioStatus: 'asr-only' })
    expect(doc).toEqual(before)
    expect(doc.examEvents).toEqual([])
  })
  it('applies manual time to normal triggering, direct retry, preview and skip accounting', () => {
    const doc = source()
    const { events } = resolveCalibration(doc, makeCalibration(doc, { '5-exit-look': 1000 }, durationMs))
    let state = trainingReducer(createTrainingState(events), { type: 'start', positionMs: 0, now: 0 })
    state = trainingReducer(state, { type: 'position', positionMs: 1100, now: 1100 })
    expect(state.activeId).toBe('5-exit-look')
    expect(state.positionMs).toBe(1000)
    state = trainingReducer(state, { type: 'retry', eventId: '5-exit-look', preview: false, now: 1200 })
    expect(state.positionMs).toBe(1000)
    state = trainingReducer(state, { type: 'retry', eventId: '5-exit-look', preview: true, now: 1300 })
    expect(state.positionMs).toBe(0)
    state = trainingReducer(state, { type: 'seek', positionMs: 2000, now: 1400 })
    expect(state.progress['5-exit-look']).toBe('skipped')
    expect(state.progress['5-exit-turn']).toBeUndefined()
    const adjusted = resolveCalibration(doc, makeCalibration(doc, { '5-exit-turn': 25000 }, durationMs)).events
    const preview = trainingReducer(createTrainingState(adjusted), { type: 'retry', eventId: '5-exit-turn', preview: true, now: 0 })
    expect(preview.positionMs).toBe(20000)
  })
  it('corrects media overshoot to the manual pause and never triggers again at the source pause', () => {
    const doc = source()
    const { events } = resolveCalibration(doc, makeCalibration(doc, { '5-exit-look': 1000 }, durationMs))
    type Mutable<T> = { -readonly [K in keyof T]: T[K] }
    const video: Mutable<VideoPort> = { currentTime: 0, paused: true, seeking: false, readyState: 4, play: async () => { video.paused = false }, pause: () => { video.paused = true } }
    const c = new TrainingController(events, video, () => 0)
    c.start()
    video.currentTime = 1.5
    c.timeUpdate()
    expect(video.currentTime).toBe(1)
    c.seeked()
    for (const operation of ['brake', 'stop', 'observe-left', 'observe-right', 'execute'] as const) c.operate(operation)
    c.continue()
    video.currentTime = 13.5
    c.timeUpdate()
    expect(c.getSnapshot().phase).toBe('road')
    expect(c.getSnapshot().activeId).toBeNull()
  })
  it('rejects negative, nonfinite, fractional millisecond and end-of-video values', () => {
    const doc = source()
    for (const time of [-1, NaN, Infinity, 1.5, durationMs, durationMs + 1]) {
      const id = time >= durationMs ? '5-parking' : '5-exit-look'
      expect(() => makeCalibration(doc, { [id]: time }, durationMs)).toThrow()
    }
    expect(() => makeCalibration(doc, { unknown: 1000 }, durationMs)).toThrow('找不到')
  })
  it('rejects coincident and reversed pauses instead of silently changing event order', () => {
    const doc = source()
    expect(() => makeCalibration(doc, { '5-exit-look': 21000 }, durationMs)).toThrow('必须晚于')
    expect(() => makeCalibration(doc, { '5-exit-look': 22000 }, durationMs)).toThrow('必须晚于')
    expect(() => makeCalibration(doc, { '5-exit-turn': 10000 }, durationMs)).toThrow('必须晚于')
    expect(() => createTrainingState(doc.events.map((event, i) => i === 1 ? { ...event, manualPauseMs: 13000 } : event))).toThrow()
  })
  it('round-trips per-route storage and rejects changed video, subtitles, baselines, unknown IDs and duplicate IDs', () => {
    const doc = source()
    const record = makeCalibration(doc, { '5-exit-look': 1000 }, durationMs)
    const s = storage()
    expect(writeCalibration(doc, record, s)).toBe(true)
    expect(readCalibration(doc, s).record).toEqual(record)
    expect(readCalibration(source('7'), s).record).toBeNull()
    expect(() => resolveCalibration(source('7'), record)).toThrow('不属于')
    expect(() => resolveCalibration({ ...doc, videoSha256: '0'.repeat(64) }, record)).toThrow('素材已更新')
    expect(() => resolveCalibration({ ...doc, subtitleSha256: '0'.repeat(64) }, record)).toThrow('素材已更新')
    const changed = structuredClone(doc); changed.events[0].practicePauseMs++
    expect(() => resolveCalibration(changed, record)).toThrow('默认时间已更新')
    expect(() => resolveCalibration(doc, { ...record, entries: [{ ...record.entries[0], eventId: '6-return-turn' }] })).toThrow('没有的项目')
    expect(() => resolveCalibration(doc, { ...record, entries: [...record.entries, ...record.entries] })).toThrow('格式不正确')
  })
  it('falls back on invalid or stale storage without deleting a recoverable backup', () => {
    const doc = source()
    const s = storage()
    const key = 'roadtest.practice-calibration.v1.5'
    s.setItem(key, '{invalid')
    expect(readCalibration(doc, s)).toMatchObject({ record: null, message: expect.stringContaining('无法读取') })
    const record = makeCalibration(doc, { '5-exit-look': 1000 }, durationMs)
    s.setItem(key, JSON.stringify({ ...record, videoSha256: '0'.repeat(64) }))
    expect(readCalibration(doc, s)).toMatchObject({ record: null, message: expect.stringContaining('素材已更新') })
    expect(s.getItem(key)).not.toBeNull()
    const denied = { getItem: () => { throw new Error('access denied') }, setItem: () => { throw new Error('quota') } }
    expect(readCalibration(doc, denied).message).toContain('未允许读取')
    expect(writeCalibration(doc, record, denied)).toBe(false)
  })
  it('supports individual/all restore and uses actual loaded media length when checking a backup', () => {
    const doc = source()
    const record = makeCalibration(doc, { '5-exit-look': 1000, '5-exit-turn': 25000 }, durationMs)
    expect(record.entries).toHaveLength(2)
    const restored = makeCalibration(doc, { '5-exit-turn': 25000 }, durationMs)
    expect(resolveCalibration(doc, restored).events[0].manualPauseMs).toBeUndefined()
    const all = makeCalibration(doc, {}, durationMs)
    expect(resolveCalibration(doc, all).events).toBe(doc.events)
    expect(() => resolveCalibration(doc, record, 600000)).toThrow('早于视频结尾')
    expect(makeCalibration(doc, { '5-exit-look': doc.events[0].practicePauseMs }, durationMs).entries).toEqual([])
  })
  it('does not expose excluded events for manual calibration', () => {
    const doc = source('6')
    expect(() => makeCalibration(doc, { '6-return-turn': 300000 }, 711000)).toThrow('找不到')
  })
})

describe('manual calibration time input', () => {
  it('parses minutes, seconds and decimal milliseconds without float truncation', () => {
    for (const [text, expected] of [['03:48.500', 228500], ['228.5', 228500], ['0', 0], ['00:00.001', 1], [' 1.1 ', 1100], ['12:59.999', 779999]] as const) expect(parseCalibrationTime(text)).toBe(expected)
    expect(formatCalibrationTime(228500)).toBe('03:48.500')
  })
  it('rejects malformed, negative, overprecise and out-of-range clock fields', () => {
    for (const text of ['', '-1', '1e3', 'Infinity', 'NaN', '00:60', '1:2', '1.2345', '1:00:00', '0x10', '999999999999999999999999999']) expect(() => parseCalibrationTime(text)).toThrow()
  })
})
