import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMapSession, mapReducer } from '../map/model'
import { ExamEffects, operationEffect } from './effects'

function audioEnvironment() {
  const sources: { loop: boolean; stop: ReturnType<typeof vi.fn> }[] = []
  const volumes: number[] = []
  const source = () => {
    const node = { loop: false, connect: vi.fn(), disconnect: vi.fn(), onended: null as (() => void) | null,
      start: vi.fn(), stop: vi.fn(() => { queueMicrotask(() => node.onended?.()) }) }
    sources.push(node)
    return node
  }
  class Context {
    state = 'suspended'; currentTime = 0; destination = {}; sampleRate = 24000
    resume = vi.fn(async () => { this.state = 'running' })
    close = vi.fn(async () => { this.state = 'closed' })
    decodeAudioData = vi.fn(async () => ({}))
    createBufferSource = source
    createGain = () => ({ gain: { value: 0, setTargetAtTime: vi.fn((value: number) => volumes.push(value)), setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() })
    createOscillator = () => ({ ...source(), frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } })
    createBuffer = (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) })
  }
  vi.stubGlobal('AudioContext', Context)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })))
  return { sources, volumes }
}
afterEach(() => vi.unstubAllGlobals())
describe('exam audio lifecycle', () => {
  it('does not signal a successful pass for rejected or unavailable operations', () => {
    const ready = createMapSession('5', 42)
    expect(operationEffect(ready, mapReducer(ready, { type: 'operate', operation: 'go' }), 'go')).toBeNull()
    let state = mapReducer(ready, { type: 'start' })
    for (let i = 0; i < 120; i++) state = mapReducer(state, { type: 'tick', deltaMs: 100 })
    const rejected = mapReducer(state, { type: 'operate', operation: 'go' })
    expect(operationEffect(state, rejected, 'go')).toBe('blocked')
  })
  it('loops only an enabled indicator, ducks under speech, and stops all sounds on pause/disposal', async () => {
    const env = audioEnvironment(), failed = vi.fn(), audio = new ExamEffects(failed)
    audio.unlock()
    audio.syncSignal(true, false)
    await vi.waitFor(() => expect(env.sources.filter(source => source.loop)).toHaveLength(1))
    audio.syncSignal(true, true)
    expect(env.volumes.at(-1)).toBeLessThan(env.volumes.at(-2)!)
    audio.play('slow')
    audio.silence()
    expect(env.sources.every(source => source.stop.mock.calls.length > 0)).toBe(true)
    expect(env.sources.find(source => source.loop)?.stop).toHaveBeenCalledOnce()
    audio.syncSignal(true, false)
    expect(env.sources.filter(source => source.loop)).toHaveLength(2)
    audio.dispose()
    audio.syncSignal(true, false)
    expect(env.sources.filter(source => source.loop)).toHaveLength(2)
    expect(failed).not.toHaveBeenCalled()
  })
  it('does not restart the indicator when a sample arrives after mute or unmount', async () => {
    const env = audioEnvironment()
    let respond: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { respond = resolve })))
    const audio = new ExamEffects()
    audio.unlock(); audio.syncSignal(true, false); audio.silence(); audio.dispose()
    respond({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(env.sources).toHaveLength(0)
  })
  it('reports unavailable audio without throwing into the training engine', () => {
    vi.stubGlobal('AudioContext', undefined)
    const failed = vi.fn(), audio = new ExamEffects(failed)
    expect(() => audio.play('stop')).not.toThrow()
    expect(failed).toHaveBeenCalledOnce()
  })
})
