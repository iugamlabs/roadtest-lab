import type { PracticeEvent } from './practice-events'
import { createTrainingState, trainingReducer, type Operation, type Suspension, type TrainingAction } from './engine'

export type VideoPort = Pick<HTMLVideoElement, 'currentTime' | 'paused' | 'seeking' | 'readyState' | 'play' | 'pause'>

// Owns media commands; the reducer remains independent of React and DOM events.
export class TrainingController {
  private state
  private listeners = new Set<() => void>()
  private internalSeek: number | null = null
  private disposed = false
  private playRequest = 0

  constructor(events: PracticeEvent[], private video: VideoPort, private now = () => performance.now()) {
    this.state = createTrainingState(events, now())
  }
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private send(action: Omit<Extract<TrainingAction, { type: 'suspend' }>, 'now'> | TrainingAction) {
    if (this.disposed) return
    this.state = trainingReducer(this.state, { ...action, now: 'now' in action ? action.now : this.now() })
    this.listeners.forEach(listener => listener())
  }
  private suspend(reason: Suspension, value: boolean) { this.send({ type: 'suspend', reason, value }) }
  private moveTo(ms: number) {
    const seconds = ms / 1000
    if (Math.abs(this.video.currentTime - seconds) < .001 && !this.video.seeking) {
      this.internalSeek = null
      this.send({ type: 'seeked', positionMs: ms, now: this.now() })
      return
    }
    this.internalSeek = seconds
    this.send({ type: 'transport', seeking: true, now: this.now() })
    this.video.currentTime = seconds
  }
  async play() {
    this.suspend('user', false)
    if (this.state.suspensions.some(reason => reason !== 'buffering') || this.state.seeking) return
    if (this.state.enabled && this.state.phase !== 'road') return
    const request = ++this.playRequest
    try {
      await this.video.play()
      if (this.disposed || request !== this.playRequest) return
      if (this.state.suspensions.length || this.state.enabled && this.state.phase !== 'road') this.video.pause()
    } catch {
      if (!this.disposed && request === this.playRequest) {
        this.suspend('user', true)
        this.send({ type: 'notice', message: '视频暂时无法播放，请点击播放视频重试。', now: this.now() })
      }
    }
  }
  pause() {
    this.playRequest++
    this.suspend('user', true)
    this.video.pause()
  }
  start() {
    this.pause()
    this.send({ type: 'start', positionMs: this.video.currentTime * 1000, now: this.now() })
    void this.play()
  }
  stop() {
    this.pause()
    this.send({ type: 'stop', now: this.now() })
  }
  operate(operation: Operation) { this.send({ type: 'operate', operation, now: this.now() }) }
  tick = () => { if (this.state.enabled && this.state.phase === 'practice') this.send({ type: 'tick', now: this.now() }) }
  timeUpdate = () => {
    if (this.video.seeking || this.internalSeek !== null || this.video.paused) return
    const before = this.state.phase
    this.send({ type: 'position', positionMs: this.video.currentTime * 1000, now: this.now() })
    if (before === 'road' && this.state.phase === 'practice') {
      this.video.pause()
      // Correct timeupdate overshoot to the exact practice pause, without a user seek.
      this.moveTo(this.state.positionMs)
    }
  }
  toggle() {
    if (this.state.enabled && this.state.phase === 'practice') {
      this.suspend('user', !this.state.suspensions.includes('user'))
    } else if (this.video.paused) { void this.play() } else { this.pause() }
  }
  retry(eventId: string, preview = false, single = false) {
    this.pause()
    this.suspend('user', preview)
    this.send({ type: 'retry', eventId, preview, single, now: this.now() })
    this.moveTo(this.state.positionMs)
  }
  continue() {
    if (this.state.phase !== 'review') return
    this.suspend('user', false)
    this.send({ type: 'continue', now: this.now() })
    if (this.getSnapshot().phase === 'road') void this.play()
  }
  seek(seconds: number) {
    this.pause()
    this.suspend('buffering', false)
    this.send({ type: 'seek', positionMs: seconds * 1000, now: this.now() })
    this.moveTo(seconds * 1000)
  }
  seeking = () => {
    if (this.internalSeek !== null && Math.abs(this.video.currentTime - this.internalSeek) < .5) return
    this.internalSeek = null
    if (!this.state.seeking) {
      this.pause()
      this.suspend('buffering', false)
      this.send({ type: 'seek', positionMs: this.video.currentTime * 1000, now: this.now() })
    }
  }
  seeked = () => {
    if (this.video.seeking) return
    this.internalSeek = null
    this.send({ type: 'seeked', positionMs: this.video.currentTime * 1000, now: this.now() })
  }
  waiting = () => { if (!this.video.paused) this.suspend('buffering', true) }
  stalled = () => { if (this.video.readyState < 3) this.waiting() }
  canPlay = () => { this.suspend('buffering', false); this.suspend('media-error', false) }
  playing = () => {
    this.suspend('buffering', false)
    if (this.state.suspensions.length || this.state.enabled && this.state.phase !== 'road') this.video.pause()
  }
  mediaPaused = () => {
    if (this.video.paused && this.state.phase === 'road') this.suspend('user', true)
  }
  ended = () => { this.send({ type: 'ended', now: this.now() }) }
  error = () => { this.suspend('media-error', true); this.pause() }
  setHidden(hidden: boolean) {
    this.suspend('hidden', hidden)
    if (hidden) this.pause()
  }
  setMap(open: boolean) {
    this.suspend('map', open)
    if (open) this.pause()
  }
  dispose() {
    this.disposed = true
    this.playRequest++
    this.listeners.clear()
    this.video.pause()
  }
}
