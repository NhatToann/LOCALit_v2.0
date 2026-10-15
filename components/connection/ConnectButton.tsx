'use client'

/**
 * ConnectButton — unified button that handles every connection state and
 * surfaces a duration popup before sending a request.
 *
 * Replaces the older ad-hoc component (which did its own lookup with
 * hard-coded pending/accepted/declined branches). The lookup is delegated
 * to `useConnectionState`, the action UI is the new shared button palette
 * in `app/connections/page.tsx`, and the duration choice lives in
 * `DurationPicker`.
 *
 * Behaviour matrix:
 *
 *   • anonymous / signed-out viewer      → link to /login
 *   • viewer is the recipient            → hidden (hideWhenSelf)
 *   • no connection yet                  → "Connect" → opens DurationPicker
 *   • pending, I am requester            → "Cancel request"
 *   • pending, I am receiver             → "Accept" / "Decline"
 *   • active (not locked)                → "Message" + badge shows days left
 *   • active but locked                  → "Renew" (primary)
 *   • declined (any)                     → "Connect again" → DurationPicker
 */
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  UserPlus,
  Check,
  X,
  Loader2,
  MessageCircle,
  Send,
  RefreshCw,
  Handshake,
} from 'lucide-react'
import { useConnectionState } from '@/hooks/useConnectionState'
import { readUserIdFromToken } from '@/utils/supabase/client-binding'
import DurationPicker from './DurationPicker'

interface Props {
  recipientId: string
  recipientName: string
  /** Kept for backwards compatibility with the legacy component prop
   *  (we are now fully symmetric — both roles use the same flow). */
  viewerAs?: 'tourist' | 'buddy'
  hideWhenSelf?: boolean
  onConnectionChange?: () => void
  /**
   * RAM/RPC optimization: when the parent already owns a
   * useConnectionState fetch (e.g. a sibling badge or explainer), pass
   * it down so the button does not fire a second /api/connections/check
   * round-trip on mount. When omitted the button falls back to its own
   * internal fetch — safe, but doubled in those cases.
   */
  sharedState?: ReturnType<typeof useConnectionState>
}

export default function ConnectButton({
  recipientId,
  recipientName,
  hideWhenSelf = true,
  onConnectionChange,
  sharedState,
}: Props) {
  const router = useRouter()
  const [myId, setMyId] = useState<string | null>(null)
  const [showDurationPicker, setShowDurationPicker] = useState(false)
  // useState (not useTransition) for the action's pending flag.
  // useTransition.isPending never returns to false after router.refresh()
  // because the parent server-component re-render keeps the transition
  // in flight indefinitely on slow networks, leaving the button stuck
  // disabled. A plain boolean we toggle in try/finally is reliable.
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Use the parent's fetch if it supplied one; otherwise own it.
  const internal = useConnectionState(recipientId)
  const { state, loading, refetch } = sharedState ?? internal

  // Read viewer id (synchronous token decode — never awaits auth SDK).
  // useEffect with empty deps runs once on mount, so this never blocks
  // the SSR pass. We deliberately do NOT call setMyId from the render
  // body (would re-render every state update).
  useEffect(() => {
    setMyId(readUserIdFromToken())
  }, [])

  // Signed-out
  if (!myId) {
    return (
      <a
        href={`/login?next=${typeof window !== 'undefined' ? window.location.pathname : '/dashboard'}`}
        className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
      >
        <UserPlus size={14} aria-hidden="true" /> Sign in to connect
      </a>
    )
  }

  // Self-view
  if (hideWhenSelf && myId === recipientId) return null

  // Loading: silent placeholder
  if (loading && !state.hasConnection) {
    return (
      <span
        data-connect-state="loading"
        className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium text-muted border border-border-strong rounded-sm"
      >
        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
        <span className="sr-only">Checking connection status</span>
      </span>
    )
  }

  // --- Action handlers ---
  async function sendRequest(days: number) {
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch('/api/connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ recipient_id: recipientId, duration_days: days }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        if (res.status === 409) {
          // Already exists — refresh the lookup so the UI shows the right state.
          await refetch()
          return
        }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      setShowDurationPicker(false)
      await refetch()
      onConnectionChange?.()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  async function respond(action: 'accept' | 'reject') {
    if (!state.connectionId) return
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch(`/api/connections/${state.connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      await refetch()
      onConnectionChange?.()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  async function cancel() {
    if (!state.connectionId) return
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch(`/api/connections/${state.connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'cancel' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      await refetch()
      onConnectionChange?.()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  async function renew() {
    if (!state.connectionId) return
    setError(null)
    setIsPending(true)
    try {
      const res = await fetch(`/api/connections/${state.connectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'renew' }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `HTTP ${res.status}`)
      }
      await refetch()
      onConnectionChange?.()
      router.refresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setIsPending(false)
    }
  }

  // No connection — invite
  if (!state.hasConnection) {
    return (
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setShowDurationPicker(true)}
          className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          <UserPlus size={14} aria-hidden="true" />
          Connect with {recipientName.split(' ')[0]}
        </button>
        {error ? (
          <span className="text-xs text-danger" role="alert">
            {error}
          </span>
        ) : null}
        <DurationPicker
          open={showDurationPicker}
          recipientName={recipientName}
          onCancel={() => setShowDurationPicker(false)}
          onConfirm={sendRequest}
        />
      </div>
    )
  }

  // Pending — I sent it
  if (state.status === 'pending' && state.direction === 'i_sent') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-warning text-xs" role="status">
          <Loader2 size={10} className="inline animate-spin mr-1" aria-hidden="true" />
          Request pending
        </span>
        <button
          type="button"
          onClick={cancel}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-muted border border-border-strong hover:bg-paper disabled:opacity-50"
        >
          <X size={13} aria-hidden="true" /> Cancel
        </button>
        {error ? (
          <span className="text-xs text-danger" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  // Pending — they sent it
  if (state.status === 'pending' && state.direction === 'they_sent') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-info text-xs" role="status">
          <Send size={10} className="inline mr-1" aria-hidden="true" />
          New request
        </span>
        <button
          type="button"
          onClick={() => respond('accept')}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-success text-paper border border-success hover:opacity-90"
        >
          {isPending ? (
            <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={13} aria-hidden="true" />
          )}
          Accept
        </button>
        <button
          type="button"
          onClick={() => respond('reject')}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          <X size={13} aria-hidden="true" /> Decline
        </button>
        {error ? (
          <span className="text-xs text-danger self-center" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  // Accepted + locked — primary renew
  if (state.status === 'accepted' && state.isLocked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="badge badge-danger text-xs" role="status">
          <X size={10} className="inline mr-1" aria-hidden="true" />
          Connection expired
        </span>
        <button
          type="button"
          onClick={renew}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw size={14} aria-hidden="true" />
          )}
          Renew connection
        </button>
        {error ? (
          <span className="text-xs text-danger" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    )
  }

  // Accepted + not locked — message
  if (state.status === 'accepted') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-success text-xs" role="status">
          <Handshake size={10} className="inline mr-1" aria-hidden="true" />
          Connected
        </span>
        <a
          href={`/chat?with=${recipientId}`}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          <MessageCircle size={13} aria-hidden="true" />
          Message
        </a>
      </div>
    )
  }

  // Declined — retry
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setShowDurationPicker(true)}
        className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
      >
        <UserPlus size={14} aria-hidden="true" /> Connect again
      </button>
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
      <DurationPicker
        open={showDurationPicker}
        recipientName={recipientName}
        onCancel={() => setShowDurationPicker(false)}
        onConfirm={sendRequest}
      />
    </div>
  )
}
