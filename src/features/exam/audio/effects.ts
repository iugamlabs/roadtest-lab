import type { MapOperation, MapState } from '../map/model'

const signalUrl = new URL('./assets/turn-signal.mp3', import.meta.url).href
const brakeUrl = new URL('./assets/handbrake.mp3', import.meta.url).href
const departureUrl = new URL('./assets/departure.mp3', import.meta.url).href
export type Effect = 'switch' | 'observe' | 'slow' | 'stop' | 'go' | 'park' | 'blocked'
export function operationEffect(before: MapState, after: MapState, operation: MapOperation): Effect | null {
  if (before === after) return null
  if (after.interaction?.blocked) return 'blocked'
  return operation === 'left' || operation === 'right' || operation === 'park-p' ? 'switch' : operation === 'park-brake' ? 'park' : operation
}

/** Local samples + quiet synthesized cues. Never participates in scoring or timing. */
export class ExamEffects {
  private context: AudioContext | null = null
  private signalBuffer: AudioBuffer | null = null
  private brakeBuffer: AudioBuffer | null = null
  private departureBuffer: AudioBuffer | null = null
  private master: GainNode | null = null
  private signal: AudioBufferSourceNode | null = null
  private signalGain: GainNode | null = null
  private active = new Set<AudioScheduledSourceNode>()
  private loading = false
  private disposed = false
  private signalWanted = false
  private duck = false
  private reportError: () => void
  constructor(reportError: () => void = () => {}) { this.reportError = reportError }
  unlock() {
    if (this.disposed) return
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.connect(this.context.destination)
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(this.reportError)
      if (!this.loading) {
        this.loading = true
        const context = this.context
        const load = async (url: string) => {
          const response = await fetch(url)
          if (!response.ok) throw Error('音效加载失败')
          return context.decodeAudioData(await response.arrayBuffer())
        }
        void load(signalUrl).then(buffer => { if (!this.disposed) { this.signalBuffer = buffer; this.syncSignal(this.signalWanted, this.duck) } }).catch(this.reportError)
        void load(brakeUrl).then(buffer => { if (!this.disposed) this.brakeBuffer = buffer }).catch(this.reportError)
        void load(departureUrl).then(buffer => { if (!this.disposed) this.departureBuffer = buffer }).catch(this.reportError)
      }
    } catch { this.reportError() }
  }
  private sample(buffer: AudioBuffer, volume: number, loop = false) {
    const context = this.context!
    const source = context.createBufferSource(), gain = context.createGain()
    source.buffer = buffer; source.loop = loop; gain.gain.value = volume
    source.connect(gain); gain.connect(this.master!)
    this.active.add(source)
    source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect() }
    source.start()
    return { source, gain }
  }
  private stopSource(source: AudioScheduledSourceNode) {
    this.active.delete(source)
    try { source.stop() } catch { /* already stopped */ }
  }
  syncSignal(wanted: boolean, duck: boolean) {
    this.signalWanted = wanted; this.duck = duck
    if (this.context) this.master?.gain.setTargetAtTime(duck ? .4 : 1, this.context.currentTime, .05)
    if (!wanted) { if (this.signal) this.stopSource(this.signal); this.signal = null; this.signalGain = null; return }
    if (!this.context || !this.signalBuffer || this.disposed) return
    if (!this.signal) {
      const { source, gain } = this.sample(this.signalBuffer, .22, true)
      this.signal = source; this.signalGain = gain
    }
    this.signalGain?.gain.setTargetAtTime(duck ? .055 : .22, this.context.currentTime, .05)
  }
  play(effect: Effect) {
    this.unlock()
    const context = this.context
    if (!context || this.disposed) return
    // Replace one-shot feedback on rapid clicks rather than stacking loud sounds.
    for (const source of this.active) if (source !== this.signal) this.stopSource(source)
    if (effect === 'park' && this.brakeBuffer) { this.sample(this.brakeBuffer, .28); return }
    if (effect === 'go' && this.departureBuffer) { this.sample(this.departureBuffer, .65); return }
    const tone = (from: number, to: number, duration: number, offset = 0, volume = .07) => {
      const oscillator = context.createOscillator(), gain = context.createGain()
      const at = context.currentTime + offset
      oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(from, at); oscillator.frequency.exponentialRampToValueAtTime(to, at + duration)
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(volume, at + .012); gain.gain.exponentialRampToValueAtTime(.001, at + duration)
      oscillator.connect(gain); gain.connect(this.master!); this.active.add(oscillator)
      oscillator.onended = () => { this.active.delete(oscillator); oscillator.disconnect(); gain.disconnect() }
      oscillator.start(at); oscillator.stop(at + duration)
    }
    if (effect === 'switch') tone(650, 350, .07)
    else if (effect === 'observe') { tone(440, 440, .08); tone(580, 580, .1, .1) }
    else if (effect === 'go') { tone(180, 320, .24); tone(380, 470, .12, .14, .04) }
    else if (effect === 'blocked') { tone(230, 200, .12); tone(230, 200, .12, .16) }
    else {
      // Soft filtered friction for pedal/stop, avoiding a tire-screech warning.
      const duration = effect === 'slow' ? .28 : .48
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate)
      const data = buffer.getChannelData(0)
      let filtered = 0
      for (let i = 0; i < data.length; i++) { filtered = .88 * filtered + .12 * (Math.random() * 2 - 1); data[i] = filtered * Math.sin(Math.PI * i / data.length) }
      this.sample(buffer, .38)
      if (effect === 'stop' || effect === 'park') tone(160, 90, .14, .25)
    }
  }
  silence() {
    this.syncSignal(false, false)
    for (const source of this.active) this.stopSource(source)
    this.active.clear()
  }
  dispose() { this.disposed = true; this.silence(); void this.context?.close().catch(() => {}) }
}
