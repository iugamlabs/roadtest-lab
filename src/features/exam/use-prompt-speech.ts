import { useEffect, useState } from 'react'
import { BrowserSpeech } from './speech'

export function usePromptSpeech(prompt: string | undefined, enabled: boolean, suspended: boolean) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
    if (!prompt || !enabled || suspended || document.hidden) return

    const cancel = new BrowserSpeech().speak(prompt, {
      end: () => {},
      error: () => setFailed(true),
    })
    const stopInBackground = () => { if (document.hidden) cancel() }
    document.addEventListener('visibilitychange', stopInBackground)
    return () => {
      document.removeEventListener('visibilitychange', stopInBackground)
      cancel()
    }
  }, [prompt, enabled, suspended, attempt])

  return { failed, replay: () => setAttempt(previous => previous + 1) }
}
