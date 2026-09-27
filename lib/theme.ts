// Theme: light | dark | system.
// Persisted to localStorage AND profiles.theme_pref (when logged in).
// Uses the `dark` class on <html> to switch palette (see app/globals.css).

export type Theme = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'localit-theme'

export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  return 'system'
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === 'undefined') return
  if (theme === 'system') {
    window.localStorage.removeItem(THEME_STORAGE_KEY)
  } else {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', isDark)
  root.style.colorScheme = isDark ? 'dark' : 'light'
}
