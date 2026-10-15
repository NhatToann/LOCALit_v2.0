'use client'

/**
 * DurationPicker — popup that asks the user how long a connection should
 * last before it auto-locks.
 *
 * Presets: 1, 7, 14, 30 days (1-30 allowed).
 * The caller's `default_connection_duration` (from `profiles`) is the
 * pre-selected value. A "Remember this" checkbox writes the choice back
 * to the caller's profile so the next popup auto-fills.
 *
 * Used by the Connect button before sending a request.
 */

import { useEffect, useState } from 'react'
import { Calendar, Clock, X, Loader2 } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

interface Props {
  open: boolean
  recipientName: string
  onCancel: () => void
  onConfirm: (days: number) => Promise<void> | void
}

const PRESETS = [1, 7, 14, 30]

export default function DurationPicker({
  open,
  recipientName,
  onCancel,
  onConfirm,
}: Props) {
  const [days, setDays] = useState<number>(7)
  const [custom, setCustom] = useState<string>('')
  const [remember, setRemember] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Pre-fill from the caller's stored default.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user || cancelled) return
        const { data } = await supabase
          .from('profiles')
          .select('default_connection_duration')
          .eq('id', user.id)
          .maybeSingle()
        if (!cancelled && data?.default_connection_duration) {
          setDays(data.default_connection_duration)
        }
      } catch {
        // ignore — fallback to default 7
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open])

  if (!open) return null

  const finalDays = custom
    ? Math.max(1, Math.min(30, parseInt(custom, 10) || 7))
    : days

  async function submit() {
    setSubmitting(true)
    try {
      if (remember) {
        // Fire-and-forget: persist the choice for next time. Do NOT await
        // here — the profile PATCH goes through Supabase's anon auth and
        // round-trips through getUser() (which can take 1-3s on first
        // hydration), and we want onConfirm to fire immediately so the
        // POST /api/connections call isn't held hostage.
        void (async () => {
          try {
            const supabase = createClient()
            const {
              data: { user },
            } = await supabase.auth.getUser()
            if (user) {
              await supabase
                .from('profiles')
                .update({ default_connection_duration: finalDays })
                .eq('id', user.id)
            }
          } catch {
            // non-blocking
          }
        })()
      }
      await onConfirm(finalDays)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="duration-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-surface border border-border rounded-sm shadow-sm p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between mb-3">
          <h2
            id="duration-picker-title"
            className="text-section-title flex items-center gap-1.5"
          >
            <Clock size={16} aria-hidden="true" />
            Connection duration
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 -mr-1 text-muted hover:text-ink rounded-sm"
            aria-label="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <p className="text-sm text-muted mb-4 max-w-prose">
          How many days should this connection with{' '}
          <strong className="text-ink">{recipientName}</strong> stay open?
          You can renew it any time before it expires.
        </p>

        <fieldset className="mb-4">
          <legend className="text-eyebrow text-muted mb-2">Preset</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={!custom && days === p}
                onClick={() => {
                  setDays(p)
                  setCustom('')
                }}
                className={`inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm border transition-colors ${
                  !custom && days === p
                    ? 'bg-primary text-paper border-primary'
                    : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                }`}
              >
                {p} {p === 1 ? 'day' : 'days'}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mb-4">
          <label
            htmlFor="duration-custom"
            className="text-eyebrow text-muted block mb-1"
          >
            Or enter a custom value (1–30 days)
          </label>
          <input
            id="duration-custom"
            type="number"
            min={1}
            max={30}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={`${finalDays}`}
            className="form-input w-full"
          />
        </div>

        <label className="flex items-center gap-2 mb-4 text-sm text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4"
          />
          Remember this choice for next time
        </label>

        <footer className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1 h-9 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Calendar size={13} aria-hidden="true" />
            )}
            Send request · {finalDays} {finalDays === 1 ? 'day' : 'days'}
          </button>
        </footer>
      </div>
    </div>
  )
}
