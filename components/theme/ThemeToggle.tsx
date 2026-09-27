'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import {
  type Theme,
  getStoredTheme,
  setStoredTheme,
  applyTheme,
} from '@/lib/theme'
import { createClient } from '@/utils/supabase/auth'

interface Props {
  userId: string | null
}

const OPTIONS: Array<{ id: Theme; label: string; Icon: typeof Sun }> = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
]

export default function ThemeToggle({ userId }: Props) {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    setTheme(getStoredTheme())
  }, [])

  async function pick(next: Theme) {
    setTheme(next)
    setStoredTheme(next)
    applyTheme(next)
    if (userId) {
      const supabase = createClient()
      await supabase.from('profiles').update({ theme_pref: next }).eq('id', userId)
    }
  }

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
          const active = theme === o.id
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
    </div>
  )
}
