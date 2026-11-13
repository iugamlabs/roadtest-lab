import { createContext, useContext, useState, type ReactNode } from 'react'
import { z } from 'zod'

export const playbackRates = ['0.75', '1', '1.25', '1.5', '1.75', '2'] as const
export const playbackRateSchema = z.enum(playbackRates)
export const settingsSchema = z.object({
  playbackRate: playbackRateSchema,
  originalAudio: z.boolean(),
  blurSubtitles: z.boolean(),
  maskTop: z.number().min(0).max(90),
  maskHeight: z.number().min(5).max(40),
}).refine(value => value.maskTop + value.maskHeight <= 100, {
  message: '遮罩位置与高度之和不能超过 100%。', path: ['maskHeight'],
})
export type Settings = z.infer<typeof settingsSchema>
export const defaultSettings: Settings = { playbackRate: '1', originalAudio: true, blurSubtitles: false, maskTop: 82, maskHeight: 8 }
const storageKey = 'roadtest.settings.v1'
function readSettings(): Settings {
  try {
    const result = settingsSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? 'null'))
    return result.success ? result.data : defaultSettings
  } catch { return defaultSettings }
}
const SettingsContext = createContext<{ settings: Settings; save: (value: Settings) => boolean } | null>(null)
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(readSettings)
  function save(value: Settings) {
    const parsed = settingsSchema.parse(value)
    setSettings(parsed)
    try { localStorage.setItem(storageKey, JSON.stringify(parsed)); return true } catch { return false }
  }
  return <SettingsContext value={{ settings, save }}>{children}</SettingsContext>
}
export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) throw new Error('SettingsProvider is missing')
  return context
}
