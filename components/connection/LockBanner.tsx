'use client'

/**
 * LockBanner — dismissible banner shown above the chat / itinerary when
 * the underlying connection is locked (expired, not renewed).
 *
 * The banner renders the partner's name, the expiry date, and a primary
 * "Renew" action that hits /api/connections/[id] with action='renew'.
 * The dismiss button hides the banner for the rest of the session (in-
 * memory only — a hard reload brings it back).
 */

import { useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw, X, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface Props {
  connectionId: string
  partnerName: string
  partnerId: string
  expiresAt: string | null
  /** Where the "open chat" link should go (e.g. /chat or /itinerary/[id]). */
  contextHref: string
  contextLabel?: string
}

export default function LockBanner({
  connectionId,
  partnerName,
  partnerId,
  expiresAt,
  contextHref,
  contextLabel = 'Open chat',
}: Props) {
  const [dismissed, setDismissed] = useState(false)
  // useState (not useTransition) for the action's pending flag.
  // useTransition.isPending never returns to false after router.refresh()
  // because the parent server-component re-render keeps the transition
  // in flight indefinitely on slow networks, leaving the button stuck
  // disabled. A plain boolean we toggle in try/finally is reliable.
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (dismissed) return null

  const expiredOn = expiresAt
    ? new Date(expiresAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'recently'

  async function renew() {
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'renew' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      // Hard refresh so server components re-evaluate connection state.
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 px-4 py-3 mb-4 border border-danger bg-danger-bg rounded-sm text-sm"
    >
      <AlertTriangle size={16} className="text-danger shrink-0" aria-hidden="true" />
      <p className="flex-1 min-w-0 text-ink">
        <span className="font-medium">Connection with {partnerName} expired</span> on{' '}
        {expiredOn}. Renew to keep chatting and editing your shared itinerary.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {error ? (
          <span className="text-xs text-danger" role="status">
            {error}
          </span>
        ) : null}
        <Link
          href={`/profile/${partnerId}`}
          className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium rounded-sm text-muted border border-border-strong hover:bg-paper"
        >
          <ExternalLink size={12} aria-hidden="true" />
          {partnerName.split(' ')[0]}'s profile
        </Link>
        <Link
          href={contextHref}
          className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium rounded-sm text-ink border border-border-strong hover:bg-paper"
        >
          {contextLabel}
        </Link>
        <button
          type="button"
          onClick={renew}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={12} aria-hidden="true" />
          )}
          Renew
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="p-1 text-muted hover:text-ink rounded-sm"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
