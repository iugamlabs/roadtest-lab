export interface SpeechCallbacks { end: () => void; error: () => void }
export interface SpeechPort { speak(text: string, callbacks: SpeechCallbacks): () => void }

/** One utterance at a time, with cancellation and a bounded voice-load/play wait. */
export class BrowserSpeech implements SpeechPort {
  speak(text: string, callbacks: SpeechCallbacks) {
    let cancelled = false
    let settled = false
    let started = false
    let timeout: ReturnType<typeof setTimeout> | undefined
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
    const clean = () => { clearTimeout(timeout); synth?.removeEventListener('voiceschanged', voicesChanged) }
    const finish = (error: boolean) => {
      if (cancelled || settled) return
      settled = true; clean()
      if (error) synth?.cancel()
      if (error) callbacks.error(); else callbacks.end()
    }
    const trySpeak = (fallback = false) => {
      if (!synth || started || cancelled || settled) return
      const voices = synth.getVoices().filter(voice => /^zh(?:-|_)/i.test(voice.lang))
      if (!voices.length && !fallback) return
      started = true
      clearTimeout(timeout)
      synth.removeEventListener('voiceschanged', voicesChanged)
      try {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'zh-CN'
        const voice = voices.find(voice => voice.localService && /CN/i.test(voice.lang)) ?? voices.find(voice => /CN/i.test(voice.lang)) ?? voices[0]
        // Some browsers expose no voice list but can still resolve zh-CN themselves.
        if (voice) utterance.voice = voice
        utterance.rate = 0.9
        utterance.onend = () => finish(false)
        utterance.onerror = () => finish(true)
        timeout = setTimeout(() => finish(true), 30000)
        synth.speak(utterance)
      } catch { finish(true) }
    }
    function voicesChanged() { trySpeak() }
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') timeout = setTimeout(() => finish(true), 0)
    else {
      synth.cancel()
      timeout = setTimeout(() => trySpeak(true), 1500)
      synth.addEventListener('voiceschanged', voicesChanged)
      trySpeak()
    }
    return () => { cancelled = true; clean(); synth?.cancel() }
  }
}
