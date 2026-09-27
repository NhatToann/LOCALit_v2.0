'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@teispace/next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

type Choice = 'light' | 'dark' | 'system'

interface Props {
  userId: string | null
}

const OPTIONS: Array<{ id: Choice; label: string; Icon: typeof Sun }> = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
]

export default function ThemeToggle({ userId }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  // Avoid hydration mismatch — next-themes returns `undefined` until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  async function pick(next: Choice) {
    setTheme(next)
    if (userId) {
      // Server-side mirror so the user's preference sticks across devices.
      // Failures are silent — localStorage is the source of truth on this device.
      try {
        const supabase = createClient()
        await supabase.from('profiles').update({ theme_pref: next }).eq('id', userId)
      } catch {
        /* network blip — next page load will retry */
      }
    }
  }

  const current: Choice = (mounted && (theme as Choice)) || 'system'

  return (
    <div
      role="group"
      aria-label="Theme"
      className="px-3 py-2 border-b border-border"
    >
      <p className="text-[11px] uppercase tracking-wider text-muted mb-1.5">
        Theme
      </p>
      <div className="flex items-center gap-1 border border-border rounded-sm p-0.5 bg-paper">
        {OPTIONS.map((o) => {
          const Icon = o.Icon
          const active = current === o.id
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o.id)}
              aria-pressed={active}
              className={`flex-1 inline-flex items-center justify-center gap-1 h-7 text-xs rounded-sm transition-colors duration-150 ${
                active
                  ? 'bg-primary text-paper'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Icon size={12} aria-hidden="true" />
              <span>{o.label}</span>
            </button>
          )
        })}
      </div>
      <p
        className="text-[10px] text-subtle mt-1.5"
        aria-live="polite"
        suppressHydrationWarning
      >
        {mounted ? `Active: ${resolvedTheme}` : 'Loading…'}
      </p>
    </div>
  )
}
