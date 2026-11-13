import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserSpeech } from './speech'

class FakeUtterance {
  lang = ''; voice: unknown; rate = 0; onend: (() => void) | null = null; onerror: (() => void) | null = null
  constructor(public text: string) {}
}
function setup(voices: { lang: string; localService: boolean }[] = [{ lang: 'zh-CN', localService: true }]) {
  let listener: (() => void) | undefined
  let utterance: FakeUtterance | undefined
  const synth = {
    getVoices: vi.fn(() => voices), cancel: vi.fn(),
    speak: vi.fn((value: FakeUtterance) => { utterance = value }),
    addEventListener: vi.fn((_event: string, callback: () => void) => { listener = callback }),
    removeEventListener: vi.fn((_event: string, callback: () => void) => { if (listener === callback) listener = undefined }),
  }
  vi.stubGlobal('window', { speechSynthesis: synth })
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  const callbacks = { end: vi.fn(), error: vi.fn() }
  return { synth, callbacks, utterance: () => utterance!, voicesChanged: () => listener?.() }
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('browser speech boundary', () => {
  it('prefers local Mandarin and waits for actual completion', () => {
    const env = setup([{ lang: 'zh-CN', localService: false }, { lang: 'zh-CN', localService: true }])
    new BrowserSpeech().speak('请靠边停车。', env.callbacks)
    expect(env.utterance().text).toBe('请靠边停车。')
    expect(env.utterance().voice).toMatchObject({ localService: true })
    expect(env.callbacks.end).not.toHaveBeenCalled()
    env.utterance().onend?.()
    vi.advanceTimersByTime(40000)
    expect(env.callbacks.end).toHaveBeenCalledOnce()
    expect(env.callbacks.error).not.toHaveBeenCalled()
  })
  it('loads late voices once and removes the voice listener', () => {
    const env = setup([])
    new BrowserSpeech().speak('前方路口右转。', env.callbacks)
    expect(env.synth.speak).not.toHaveBeenCalled()
    env.synth.getVoices.mockReturnValue([{ lang: 'zh-CN', localService: true }])
    env.voicesChanged(); env.voicesChanged()
    expect(env.synth.speak).toHaveBeenCalledOnce()
  })
  it('fails explicitly when Chinese voices or completion callbacks are unavailable', () => {
    const missing = setup([])
    new BrowserSpeech().speak('请停车。', missing.callbacks)
    vi.advanceTimersByTime(2500)
    expect(missing.callbacks.error).toHaveBeenCalledOnce()
    const hanging = setup()
    new BrowserSpeech().speak('请停车。', hanging.callbacks)
    vi.advanceTimersByTime(30000)
    expect(hanging.callbacks.error).toHaveBeenCalledOnce()
    expect(hanging.synth.cancel).toHaveBeenCalled()
  })
  it('ignores errors and completion after cancellation or unmount', () => {
    const env = setup()
    const cancel = new BrowserSpeech().speak('请停车。', env.callbacks)
    cancel()
    env.utterance().onend?.(); env.utterance().onerror?.()
    vi.advanceTimersByTime(40000)
    expect(env.callbacks.end).not.toHaveBeenCalled()
    expect(env.callbacks.error).not.toHaveBeenCalled()
  })
  it('reports an unsupported speech API without crashing', () => {
    vi.stubGlobal('window', {})
    const callbacks = { end: vi.fn(), error: vi.fn() }
    new BrowserSpeech().speak('请停车。', callbacks)
    vi.advanceTimersByTime(0)
    expect(callbacks.error).toHaveBeenCalledOnce()
  })
})
