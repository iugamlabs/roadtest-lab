import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Moon, Sun } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'

export const themes = ['light', 'dark'] as const
export const themeSchema = z.enum(themes)
export type Theme = z.infer<typeof themeSchema>
export const defaultTheme: Theme = 'light'
export const THEME_STORAGE_KEY = 'roadtest.theme.v1'

const lightThemeColor = '#ffffff'
const darkThemeColor = '#171717'

export function readTheme(storage: Pick<Storage, 'getItem'> = localStorage): Theme {
  try {
    const result = themeSchema.safeParse(JSON.parse(storage.getItem(THEME_STORAGE_KEY) ?? 'null'))
    return result.success ? result.data : defaultTheme
  } catch {
    return defaultTheme
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? darkThemeColor : lightThemeColor)
}

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => boolean; toggleTheme: () => boolean } | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(readTheme)

  useEffect(() => { applyTheme(theme) }, [theme])

  function setTheme(value: Theme) {
    const parsed = themeSchema.parse(value)
    setThemeState(parsed)
    applyTheme(parsed)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(parsed))
      return true
    } catch {
      return false
    }
  }

  function toggleTheme() {
    return setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return <ThemeContext value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('ThemeProvider is missing')
  return context
}

/** Large icon toggle for the sidebar; works collapsed or expanded. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const label = isDark ? '切换为浅色模式' : '切换为深色模式'
  return <Button type="button" variant="outline" className={className ?? 'min-h-14 w-full justify-start gap-3 px-3 text-base group-data-[collapsible=icon]:size-[56px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0'} onClick={() => { toggleTheme() }} aria-label={label} title={label} aria-pressed={isDark}>
    {isDark ? <Sun className="!size-6 shrink-0" aria-hidden /> : <Moon className="!size-6 shrink-0" aria-hidden />}
    <span className="group-data-[collapsible=icon]:hidden">{isDark ? '浅色模式' : '深色模式'}</span>
  </Button>
}
