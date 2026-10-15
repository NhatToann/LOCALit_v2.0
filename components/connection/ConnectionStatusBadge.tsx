'use client'

/**
 * ConnectionStatusBadge — small inline badge that renders the current
 * connection state with a user-facing label and tooltip.
 *
 *   • pending (i sent)      → "Request pending"     (warning)
 *   • pending (they sent)   → "Awaiting your reply" (info)
 *   • active                → "Active · Xd left"    (success, with renew)
 *   • active (≤1 day left)  → "Active · 1d left"    (warning)
 *   • locked                → "Expired"             (danger)
 *
 * The badge is a button when there's an action (renew, open connections
 * page). Otherwise it is a span with role="status" so screen readers
 * announce the state.
 */
import { Clock, AlertTriangle, Check, X, RefreshCw, Send, Hourglass } from 'lucide-react'
import type { ConnectionState } from '@/hooks/useConnectionState'

interface Props {
  state: ConnectionState
  onRenew?: () => void
  onOpenConnections?: () => void
  size?: 'sm' | 'md'
}

export default function ConnectionStatusBadge({
  state,
  onRenew,
  onOpenConnections,
  size = 'sm',
}: Props) {
  if (!state.hasConnection) return null

  const padding = size === 'sm' ? 'px-2 h-6 text-xs' : 'px-3 h-8 text-sm'
  const iconSize = size === 'sm' ? 10 : 13

  // Pending request
  if (state.status === 'pending') {
    if (state.direction === 'i_sent') {
      return (
        <span
          className={`badge badge-warning ${padding}`}
          role="status"
          aria-label="Connection request pending"
        >
          <Hourglass size={iconSize} className="inline mr-1" aria-hidden="true" />
          Request pending
        </span>
      )
    }
    return (
      <span
        className={`badge badge-info ${padding}`}
        role="status"
        aria-label="New connection request"
      >
        <Send size={iconSize} className="inline mr-1" aria-hidden="true" />
        New request
      </span>
    )
  }

  // Active or locked
  if (state.status === 'accepted') {
    if (state.isLocked) {
      return (
        <button
          type="button"
          onClick={onOpenConnections ?? onRenew}
          className={`badge badge-danger ${padding} cursor-pointer hover:opacity-80`}
          title="This connection has expired. Click to renew."
        >
          <X size={iconSize} className="inline mr-1" aria-hidden="true" />
          Expired
        </button>
      )
    }

    const days = state.daysRemaining ?? 0
    const isWarning = days <= 1
    const label = isWarning
      ? `Active · ${days <= 0 ? 'expires today' : `${days}d left`}`
      : `Active · ${days}d left`

    if (isWarning && onRenew) {
      return (
        <button
          type="button"
          onClick={onRenew}
          className={`badge badge-warning ${padding} cursor-pointer hover:opacity-80`}
          title={`Expires in ${days} day${days === 1 ? '' : 's'}. Click to renew.`}
        >
          <AlertTriangle size={iconSize} className="inline mr-1" aria-hidden="true" />
          {label}
        </button>
      )
    }
    return (
      <span
        className={`badge badge-success ${padding}`}
        role="status"
        title={`Renews in ${days} day${days === 1 ? '' : 's'}`}
      >
        <Check size={iconSize} className="inline mr-1" aria-hidden="true" />
        {label}
      </span>
    )
  }

  // declined — surface as muted, no action
  if (state.status === 'declined') {
    return (
      <span
        className={`badge badge-neutral ${padding}`}
        role="status"
        aria-label="Connection declined"
      >
        <X size={iconSize} className="inline mr-1" aria-hidden="true" />
        Declined
      </span>
    )
  }

  return null
}
