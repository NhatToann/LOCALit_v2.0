'use client'

/**
 * FocusRequestPopover — a centered modal-style popover that appears
 * anywhere in the app when someone sends you a Focus request.
 *
 * 2026-10-10: per user request, the focus request now surfaces as a
 * pop-up rather than only inside the chat page. This component is
 * mounted globally in `AppShell` so the recipient gets the prompt
 * regardless of which page they're on. On Accept, we navigate to
 * /focus/<sessionId> (the respond route creates the session and
 * returns its id). On Decline, we close the popover and let the
 * requester see the focus_declined notification in their bell.
 *
 * Why a popover and not the bell: the user wants this to be
 * unmissable (a Focus request is a real-time, 5-minute window). A
 * quiet row in a notification list risks the user missing it.
 *
 * Hydration on mount: we pull any pre-existing pending request so
 * the popover is correct after a hard reload, not just realtime
 * INSERTs.
 */

import { useEffect, useState, useRef, useCallback } from 'react'
import { MapPinPlus, X, Check } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { navigate } from '@/lib/navigation'
import type { FocusRequest, Profile } from '@/lib/types'

interface IncomingRequest {
  request: FocusRequest
  requester: Profile | null
}

interface Props {
  userId: string | null
}

export default function FocusRequestPopover({ userId }: Props) {
  const [pending, setPending] = useState<IncomingRequest | null>(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState<number>(Date.now())
  const [hydrated, setHydrated] = useState(false)
  const cancelledRef = useRef(false)

  // Tick every second so the countdown in the popover stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Hydrate any pre-existing pending request on mount.
  useEffect(() => {
    if (!userId) {
      setHydrated(true)
      return
    }
    cancelledRef.current = false
    let cancelled = false
    void (async () => {
      try {
        const supabase = createClient()
        const nowIso = new Date().toISOString()
        const { data: row } = await supabase
          .from('focus_requests')
          .select('*')
          .eq('recipient_id', userId)
          .eq('status', 'pending')
          .gt('expires_at', nowIso)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (cancelled || !row) return
        const { data: requester } = await supabase
          .from('safe_profiles')
          .select('*')
          .eq('id', row.requester_id)
          .maybeSingle()
        if (cancelled) return
        setPending({ request: row as FocusRequest, requester: requester as Profile | null })
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  // Subscribe to focus_requests INSERTs for this user. Uses a
  // module-scoped channel name so re-mounts don't double-bind.
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`focus-popover-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'focus_requests',
          filter: `recipient_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as FocusRequest
          if (row.status !== 'pending') return
          // Hydrate requester profile so the popover can show their
          // name and avatar.
          const { data: requester } = await supabase
            .from('safe_profiles')
            .select('*')
            .eq('id', row.requester_id)
            .maybeSingle()
          if (cancelledRef.current) return
          setPending({ request: row, requester: requester as Profile | null })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'focus_requests',
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as FocusRequest
          // If the requester cancelled it themselves, or it expired,
          // close the popover.
          if (row.status === 'cancelled' || row.status === 'expired') {
            setPending((prev) => (prev?.request.id === row.id ? null : prev))
          }
          // accept/decline updates come from us, so we handle the
          // navigation in acceptFocus / declineFocus.
        },
      )
      .subscribe()
    return () => {
      cancelledRef.current = true
      void supabase.removeChannel(channel)
    }
  }, [userId])

  // Auto-close when the request expires locally (5-min TTL).
  useEffect(() => {
    if (!pending) return
    const ms = new Date(pending.request.expires_at).getTime() - now
    if (ms <= 0) {
      setPending(null)
    }
  }, [pending, now])

  const acceptFocus = useCallback(async () => {
    if (!pending) return
    setBusy(true)
    try {
      const res = await fetch(`/api/focus/${pending.request.id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        // eslint-disable-next-line no-alert
        alert(j.message ?? j.error ?? 'Could not accept the Focus request.')
        return
      }
      const j = await res.json()
      const sessionId = j.session?.id
      setPending(null)
      if (sessionId) {
        // Hard navigation so the focus page mounts cleanly and
        // doesn't conflict with whatever route the user was on.
        window.location.assign(`/focus/${sessionId}`)
      } else {
        navigate('/chat')
      }
    } finally {
      setBusy(false)
    }
  }, [pending])

  const declineFocus = useCallback(async () => {
    if (!pending) return
    setBusy(true)
    try {
      const res = await fetch(`/api/focus/${pending.request.id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        // eslint-disable-next-line no-alert
        alert(j.message ?? j.error ?? 'Could not decline the Focus request.')
        return
      }
      setPending(null)
    } finally {
      setBusy(false)
    }
  }, [pending])

  if (!hydrated || !pending) return null

  const ms = new Date(pending.request.expires_at).getTime() - now
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  const timeRemaining = `${mm}:${ss.toString().padStart(2, '0')}`
  const requesterName = pending.requester?.full_name ?? 'Your buddy'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Focus request from ${requesterName}`}
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-ink/40"
      onClick={(e) => {
        // Click outside the card to dismiss. We DON'T auto-decline —
        // the user has to choose.
        if (e.target === e.currentTarget && !busy) setPending(null)
      }}
    >
      <div className="w-full max-w-sm bg-focus-surface border border-focus-primary rounded-sm overflow-hidden">
        <div className="flex items-start gap-3 p-4 border-b border-focus-border">
          <span
            className="flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-sm bg-focus-primary text-white"
            aria-hidden="true"
          >
            <MapPinPlus size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-focus-text">
              {requesterName} wants to start a Focus session
            </p>
            <p className="text-xs text-focus-muted mt-1">
              You&apos;ll share your live map for an immersive Da Nang trip.
            </p>
            <p className="text-xs text-focus-muted mt-1 tabular-nums">
              {timeRemaining} remaining to respond
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPending(null)}
            disabled={busy}
            className="flex-shrink-0 p-1 rounded-sm text-focus-muted hover:text-focus-text disabled:opacity-40"
            aria-label="Dismiss without responding"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="p-4 flex gap-2">
          <button
            type="button"
            onClick={declineFocus}
            disabled={busy}
            className="flex-1 h-10 px-3 text-sm font-medium rounded-sm bg-focus-surface text-focus-text border border-focus-border hover:bg-focus-border disabled:opacity-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={acceptFocus}
            disabled={busy}
            className="flex-1 h-10 px-3 text-sm font-semibold rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
          >
            <Check size={14} aria-hidden="true" />
            {busy ? 'Joining…' : 'Accept'}
          </button>
        </div>
      </div>
    </div>
  )
}
