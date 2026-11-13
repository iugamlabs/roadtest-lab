import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { calibratedEventDocumentSchema } from '../content/schema'
import { TrainingController, type VideoPort } from './controller'
import { currentStep } from './engine'

const events = calibratedEventDocumentSchema.parse(JSON.parse(readFileSync('public/data/route-5.events.json', 'utf8'))).events
type Mutable<T> = { -readonly [K in keyof T]: T[K] }
function fixture() {
  let now = 0
  const video: Mutable<VideoPort> = { currentTime: 0, paused: true, seeking: false, readyState: 4, pause: vi.fn(() => { video.paused = true }), play: vi.fn(async () => { video.paused = false }) }
  const controller = new TrainingController(events, video, () => now)
  const finishSeek = () => { video.seeking = false; controller.seeked() }
  const node = () => { controller.retry('5-lane-command'); finishSeek() }
  return { controller, video, finishSeek, node, at: (ms: number) => { now = ms; controller.tick() } }
}

describe('training media integration', () => {
  it('corrects overshoot and consumes its own seek without abandoning a practice', () => {
    const { controller: c, video, finishSeek } = fixture()
    c.start()
    video.currentTime = 13.4
    c.timeUpdate()
    expect(video.paused).toBe(true)
    expect(video.currentTime).toBe(13)
    expect(c.getSnapshot().activeId).toBe('5-exit-look')
    expect(c.getSnapshot().seeking).toBe(true)
    c.seeking()
    finishSeek()
    c.mediaPaused()
    expect(c.getSnapshot().suspensions).toEqual([])
    expect(c.getSnapshot().attempts).toEqual([])
    expect(c.getSnapshot().phase).toBe('practice')
  })
  it('continues the independent operation clock during an intentional node video pause', () => {
    const { controller: c, node, at } = fixture()
    node()
    c.operate('signal-left')
    c.operate('observe-left')
    c.mediaPaused()
    at(3000)
    expect(currentStep(c.getSnapshot())?.operation).toBe('execute')
    expect(c.getSnapshot().elapsedMs).toBe(3000)
  })
  it('freezes hidden time and requires explicit resumption on return', () => {
    const { controller: c, video, node, at } = fixture()
    node()
    c.operate('signal-left')
    c.operate('observe-left')
    at(1000)
    c.setHidden(true)
    at(60000)
    c.setHidden(false)
    at(70000)
    expect(video.paused).toBe(true)
    expect(c.getSnapshot().elapsedMs).toBe(1000)
    expect(c.getSnapshot().suspensions).toEqual(['user'])
    c.toggle()
    at(72000)
    expect(c.getSnapshot().elapsedMs).toBe(3000)
  })
  it('freezes both map and user suspension until the user continues', () => {
    const { controller: c, node, at } = fixture()
    node()
    at(500)
    c.setMap(true)
    at(10000)
    c.setMap(false)
    expect(c.getSnapshot().suspensions).toEqual(['user'])
    c.operate('signal-left')
    expect(c.getSnapshot().stepIndex).toBe(0)
    c.toggle()
    at(11000)
    expect(c.getSnapshot().elapsedMs).toBe(1500)
  })
  it('allows explicit continuation from a completed review after returning from the map', () => {
    const { controller: c, video, finishSeek } = fixture()
    c.start()
    video.currentTime = 13
    c.timeUpdate()
    finishSeek()
    for (const operation of ['brake', 'stop', 'observe-left', 'observe-right', 'execute'] as const) c.operate(operation)
    expect(c.getSnapshot().phase).toBe('review')
    c.setMap(true)
    c.setMap(false)
    c.continue()
    expect(c.getSnapshot().phase).toBe('road')
    expect(c.getSnapshot().suspensions).toEqual([])
    expect(video.paused).toBe(false)
  })
  it('does not trigger on buffering, manual pause, or a timeupdate from a seek', () => {
    const { controller: c, video, finishSeek } = fixture()
    c.start()
    c.waiting()
    video.currentTime = 13
    c.timeUpdate()
    expect(c.getSnapshot().activeId).toBeNull()
    c.playing()
    c.timeUpdate()
    expect(c.getSnapshot().activeId).toBe('5-exit-look')
    c.seek(40)
    finishSeek()
    c.timeUpdate()
    expect(c.getSnapshot().activeId).toBeNull()
    expect(c.getSnapshot().progress['5-bus-1']).toBe('skipped')
    expect(c.getSnapshot().progress['5-exit-look']).toBe('skipped')
  })
  it('does not freeze on a network stall while buffered video is still playable', () => {
    const { controller: c, video } = fixture()
    c.start()
    c.stalled()
    expect(c.getSnapshot().suspensions).toEqual([])
    video.readyState = 2
    c.stalled()
    expect(c.getSnapshot().suspensions).toContain('buffering')
    c.canPlay()
    expect(c.getSnapshot().suspensions).toEqual([])
  })
  it('allows the user to retry playback after pausing during buffering', async () => {
    const { controller: c, video } = fixture()
    c.start()
    c.waiting()
    c.pause()
    const resumed = c.play()
    c.playing()
    await resumed
    expect(video.play).toHaveBeenCalledTimes(2)
    expect(video.paused).toBe(false)
    expect(c.getSnapshot().suspensions).toEqual([])
  })
  it('abandons a practice when seeking externally, and ignores stale pause events after playback starts', async () => {
    const { controller: c, video, node, at } = fixture()
    node()
    at(1500)
    video.currentTime = 50
    video.seeking = true
    c.seeking()
    expect(c.getSnapshot().phase).toBe('road')
    expect(c.getSnapshot().seeking).toBe(true)
    video.seeking = false
    c.seeked()
    await c.play()
    c.mediaPaused()
    expect(c.getSnapshot().suspensions).toEqual([])
    expect(c.getSnapshot().attempts[0]).toMatchObject({ outcome: 'abandoned', elapsedMs: 1500 })
  })
  it('starts a direct retry at an unchanged position without waiting for a seeked event', () => {
    const { controller: c, node, at } = fixture()
    node()
    c.operate('signal-left')
    at(5000)
    c.retry('5-lane-command')
    expect(c.getSnapshot().elapsedMs).toBe(0)
    expect(c.getSnapshot().seeking).toBe(false)
    expect(c.getSnapshot().vehicle.indicator).toBe('off')
    at(5500)
    expect(c.getSnapshot().elapsedMs).toBe(500)
  })
  it('does not autoplay a single item preview or resume after closing a map', () => {
    const { controller: c, video, finishSeek } = fixture()
    c.retry('5-lane-command', true)
    finishSeek()
    expect(video.play).not.toHaveBeenCalled()
    expect(c.getSnapshot().phase).toBe('road')
    expect(c.getSnapshot().scope).toBe('5-lane-command')
    c.setMap(true)
    c.setMap(false)
    expect(video.play).not.toHaveBeenCalled()
  })
  it('keeps failures paused, clears media-error only after recovery, and cancels subscriptions on dispose', async () => {
    const { controller: c, video } = fixture()
    video.play = vi.fn(async () => { throw new Error('blocked') })
    await c.play()
    expect(c.getSnapshot().suspensions).toContain('user')
    c.error()
    expect(c.getSnapshot().suspensions).toContain('media-error')
    c.canPlay()
    expect(c.getSnapshot().suspensions).toEqual(['user'])
    const listener = vi.fn()
    c.subscribe(listener)
    c.dispose()
    c.setHidden(true)
    c.tick()
    expect(listener).not.toHaveBeenCalled()
    expect(video.paused).toBe(true)
  })
  it('prevents late autoplay promise completion from resuming a hidden page', async () => {
    const { controller: c, video } = fixture()
    let resolve!: () => void
    video.play = vi.fn(() => new Promise<void>(done => { resolve = done }))
    const pending = c.play()
    c.setHidden(true)
    video.paused = false
    c.playing()
    resolve()
    await pending
    expect(video.paused).toBe(true)
    expect(c.getSnapshot().suspensions).toContain('hidden')
  })
})
