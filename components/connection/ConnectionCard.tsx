'use client'

/**
 * ConnectionCard — one row in /connections. Shows partner, status, days
 * left, and contextual actions (Accept / Decline / Renew / Cancel).
 *
 * Designed to be a self-contained server-component-friendly client island
 * so the list can be re-rendered without re-fetching all the rows.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check,
  X,
  RefreshCw,
  MessageCircle,
  Send,
  AlertTriangle,
  Loader2,
  Handshake,
} from 'lucide-react'
import { useSafeTimeout } from '@/hooks/useSafeTimeout'

export interface ConnectionRow {
  id: string
  requester_id: string
  recipient_id: string
  status: 'pending' | 'accepted' | 'declined'
  duration_days: number | null
  accepted_at: string | null
  expires_at: string | null
  locked_at: string | null
  renewed_at: string | null
  is_locked: boolean
  days_remaining: number | null
  partner_id: string
  partner: {
    id: string
    full_name: string
    avatar_url: string | null
    role: 'tourist' | 'buddy' | 'admin'
  } | null
}

interface Props {
  row: ConnectionRow
  viewerId: string
}

export default function ConnectionCard({ row, viewerId }: Props) {
  const router = useRouter()
  // useState (not useTransition) for the action's pending flag.
  // useTransition.isPending never returns to false after router.refresh()
  // because the parent server-component re-render keeps the transition
  // in flight indefinitely on slow networks, leaving the button stuck
  // disabled. A plain boolean we toggle ourselves in the try/finally
  // below is the simpler, more reliable primitive.
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toastTimer = useSafeTimeout()
  const [showSuccess, setShowSuccess] = useState(false)
  const partner = row.partner
  const iAmRequester = row.requester_id === viewerId

  async function action(req: 'accept' | 'reject' | 'cancel' | 'renew') {
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch(`/api/connections/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: req }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      setShowSuccess(true)
      toastTimer.schedule(() => setShowSuccess(false), 1800)
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  if (!partner) {
    return (
      <li className="border border-border bg-surface-glass rounded-sm p-4 text-sm text-muted">
        Unknown partner (id: {row.partner_id})
      </li>
    )
  }

  // Status pill colour
  const statusTone =
    row.status === 'pending' && iAmRequester
      ? 'badge-warning'
      : row.status === 'pending'
        ? 'badge-info'
        : row.is_locked
          ? 'badge-danger'
          : row.days_remaining !== null && row.days_remaining <= 1
            ? 'badge-warning'
            : 'badge-success'

  const statusLabel = (() => {
    if (row.status === 'pending') {
      const daysHint = row.duration_days
        ? ` · ${row.duration_days}-day plan`
        : ''
      return iAmRequester
        ? `Request pending${daysHint}`
        : `New request${daysHint}`
    }
    if (row.is_locked) return 'Expired'
    if (row.days_remaining !== null) {
      if (row.days_remaining <= 0) return 'Expires today'
      if (row.days_remaining === 1) return '1 day left'
      return `${row.days_remaining} days left`
    }
    return 'Active'
  })()

  return (
    <li className="border border-border bg-surface-glass rounded-sm p-4 flex flex-wrap items-center gap-4">
      <Link
        href={partner.role === 'buddy' ? `/buddies/${partner.id}` : `/tourists/${partner.id}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center text-paper font-semibold shrink-0 overflow-hidden"
          style={{ backgroundColor: '#134E4A' }}
          aria-hidden="true"
        >
          {partner.avatar_url ? (
            <img
              src={partner.avatar_url}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            partner.full_name.charAt(0)
          )}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink truncate">
            {partner.full_name}
          </span>
          <span className="block text-xs text-muted">
            {partner.role === 'buddy' ? 'Buddy' : 'Tourist'}
            {row.duration_days != null ? ` · ${row.duration_days}-day connection` : ''}
          </span>
        </span>
      </Link>

      <span className={`badge ${statusTone} text-xs`} role="status">
        {row.is_locked ? (
          <X size={10} className="inline mr-1" aria-hidden="true" />
        ) : row.status === 'pending' ? (
          <Send size={10} className="inline mr-1" aria-hidden="true" />
        ) : row.days_remaining !== null && row.days_remaining <= 1 ? (
          <AlertTriangle size={10} className="inline mr-1" aria-hidden="true" />
        ) : (
          <Handshake size={10} className="inline mr-1" aria-hidden="true" />
        )}
        {statusLabel}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {row.status === 'pending' && !iAmRequester ? (
          <>
            <button
              type="button"
              onClick={() => action('accept')}
              disabled={isPending}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-success text-paper border border-success hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <Check size={12} aria-hidden="true" />
              )}
              Accept
            </button>
            <button
              type="button"
              onClick={() => action('reject')}
              disabled={isPending}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
            >
              <X size={12} aria-hidden="true" /> Decline
            </button>
          </>
        ) : null}

        {row.status === 'pending' && iAmRequester ? (
          <button
            type="button"
            onClick={() => action('cancel')}
            disabled={isPending}
            className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-muted border border-border-strong hover:bg-paper disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            ) : (
              <X size={12} aria-hidden="true" />
            )}
            Cancel request
          </button>
        ) : null}

        {row.status === 'accepted' ? (
          <>
            <Link
              href={`/chat?with=${partner.id}`}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              <MessageCircle size={12} aria-hidden="true" />
              Message
            </Link>
            <button
              type="button"
              onClick={() => action('renew')}
              disabled={isPending}
              className={`inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm border disabled:opacity-50 ${
                row.is_locked
                  ? 'bg-primary text-paper border-primary hover:bg-primary-hover'
                  : 'bg-transparent text-ink border-border-strong hover:bg-paper'
              }`}
            >
              {isPending ? (
                <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={12} aria-hidden="true" />
              )}
              {row.is_locked ? 'Renew' : 'Renew early'}
            </button>
            <button
              type="button"
              onClick={() => action('cancel')}
              disabled={isPending}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-muted border border-border-strong hover:bg-paper disabled:opacity-50"
            >
              <X size={12} aria-hidden="true" /> End
            </button>
          </>
        ) : null}

        {row.status === 'declined' ? (
          <span className="text-xs text-muted">Declined</span>
        ) : null}
      </div>

      {error ? (
        <span className="text-xs text-danger basis-full" role="alert">
          {error}
        </span>
      ) : null}
      {showSuccess ? (
        <span className="text-xs text-success basis-full" role="status">
          ✓ Updated
        </span>
      ) : null}
    </li>
  )
}
