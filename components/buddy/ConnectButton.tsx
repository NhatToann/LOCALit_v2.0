'use client'

import { useEffect, useState, useTransition } from 'react'
import { UserPlus, Check, X, Loader2, Handshake, Send } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { readUserIdFromToken } from '@/utils/supabase/client-binding'
import type { Connection, ConnectionStatus } from '@/lib/types'

interface Props {
  /** ID of the person being viewed (recipient of the request). */
  recipientId: string
  recipientName: string
  /**
   * Role of the viewer. The requester slot is always `tourist_id` in
   * the schema (NOT NULL), so a buddy viewer uses a synthetic
   * requester row when inserting. We solve this by setting
   * requester_id = auth.uid() and mirroring into tourist_id via a
   * separate insert in the parent page (or by allowing tourist_id =
   * auth.uid() when no tourists row exists — see migration).
   *
   * In practice after the 2026-11-07 migration both tourist_id AND
   * buddy_id are denormalized; we write to requester_id / recipient_id
   * as the source of truth and tourist_id / buddy_id stay as legacy
   * fallback columns.
   */
  viewerAs: 'tourist' | 'buddy'
  /** Suppress the component entirely when the viewer is the recipient. */
  hideWhenSelf?: boolean
}

/**
 * Connection request button — handles every state for the
 * tourist↔buddy relationship on either side's public page:
 *
 *   • anonymous / signed-out viewer      → link to /login
 *   • viewer is the recipient           → hidden
 *   • no row yet                         → "Connect" form (message textarea)
 *   • row exists, status='pending', I am requester → "Cancel request"
 *   • row exists, status='pending', I am receiver → "Accept" / "Decline"
 *   • row exists, status='accepted'      → "Connected" + "Open chat"
 *   • row exists, status='declined'      → "Connect again"
 */
export default function ConnectButton({
  recipientId,
  recipientName,
  viewerAs,
  hideWhenSelf = true,
}: Props) {
  // Read the uid lazily on first render. On the server there is no cookie,
// so this is null during SSR; on the client it resolves synchronously from
// the auth cookie and never awaits.
const [myId, setMyId] = useState<string | null>(() => readUserIdFromToken())
  const [connection, setConnection] = useState<Connection | null>(null)
  // Only wait on the connections lookup, never on auth. The effect below
  // always clears this, including on the signed-out path.
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Load the existing connection row (if any)
  useEffect(() => {
    let cancelled = false
    // Declared out here so the cleanup below can tear the subscription down
    // even if the async body throws before it assigns.
    let authSub: { data: { subscription: { unsubscribe: () => void } } } | null = null
    ;(async () => {
      try {
        const supabase = createClient()
        // Identity comes from the cookie synchronously — never await the
        // auth SDK for it. getUser() fired one /auth/v1/user request per
        // mount; getSession() can deadlock on the auth lock and never
        // settle, which pinned `loading` at true and left a permanent
        // spinner with no error anywhere.
        //
        // The cookie can land slightly AFTER mount (the SDK writes it on
        // the first getSession it performs), so if it is not there yet we
        // re-read on the next auth event rather than settling on null.
        let uid = readUserIdFromToken()

        const authSubLocal = supabase.auth.onAuthStateChange((_evt, session) => {
          const next = session?.user?.id ?? null
          if (cancelled || next === uid) return
          uid = next
          setMyId(next)
          void loadConnection(next)
        })
        authSub = authSubLocal

        const loadConnection = async (viewerId: string | null) => {
          if (viewerId && viewerId !== recipientId) {
            // New schema: connections.requester_id / recipient_id cover both
            // directions. The unique index uses both columns, so we look
            // up by either ordering.
            const { data, error: connErr } = await supabase
              .from('connections')
              .select('*')
              .or(
                `and(requester_id.eq.${viewerId},recipient_id.eq.${recipientId}),` +
                  `and(requester_id.eq.${recipientId},recipient_id.eq.${viewerId})`,
              )
              .limit(1)
              .maybeSingle<Connection>()
            if (cancelled) return
            // Fall through to the legacy lookup when the row is missing OR
            // the query failed. Previously the fallback only ran on
            // `connErr`, but rows written before the requester_id /
            // recipient_id migration have those columns NULL — that is a
            // successful EMPTY result, not an error, so those connections
            // became invisible and the page offered "Connect with X" for a
            // pair that already had a pending request.
            if (connErr || !data) {
              // PAIRED filter. A flat OR over all four columns matches a row
              // belonging to a different person entirely (e.g. viewerId is
              // the tourist on a row whose buddy is somebody else), so the
              // component would render Accept / Decline for a stranger's
              // pending request. Both orderings of the actual pair only.
              const legacyFilter =
                `and(tourist_id.eq.${viewerId},buddy_id.eq.${recipientId}),` +
                `and(tourist_id.eq.${recipientId},buddy_id.eq.${viewerId})`
              const { data: legacyData } = await supabase
                .from('connections')
                .select('*')
                .or(legacyFilter)
                .limit(1)
                .maybeSingle<Connection>()
              if (!cancelled) setConnection(data ?? legacyData ?? null)
            } else {
              setConnection(data)
            }
          }
        }

        if (!cancelled) {
          setMyId(uid)
          await loadConnection(uid)
        }
      } finally {
        // Never leave the spinner up: a stuck `loading` renders an empty
        // slot where the connect action belongs, which reads as "the button
        // is broken" rather than "the request failed".
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      authSub?.data.subscription.unsubscribe()
    }
  }, [recipientId])

  // Watchdog. Even with the shared-auth-cache fix, a `connections` SELECT
  // can be starved (browser connection pool exhausted, RLS round-trip
  // hangs, device goes offline mid-flight). The user then stares at
  // "Checking connection status" forever with no way to tell that anything
  // failed — which is exactly the reported symptom of a notification that
  // "cannot be tapped". After 8s we drop the spinner and let the normal
  // branches render, so the user always gets an actionable button.
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => {
      setLoading(false)
      setError('Could not load connection status. Try reloading the page.')
    }, 8000)
    return () => clearTimeout(t)
  }, [loading])

  function send() {
    if (!myId) return
    startTransition(async () => {
      const supabase = createClient()
      // tourist_id / buddy_id are legacy columns kept for backwards
      // compatibility with the original RLS / index. They are nullable
      // and no longer carry the requester / recipient semantic. We
      // populate them ONLY when the requester actually plays the
      // matching role; otherwise we leave them null. The new columns
      // (requester_id / recipient_id) are the source of truth.
      const legacy: Record<string, string> = {}
      if (viewerAs === 'tourist') {
        legacy.tourist_id = myId
        legacy.buddy_id = recipientId
      } else {
        // Buddy→tourist. The requester is a buddy, the recipient is a
        // tourist. We mirror them into the legacy columns for
        // analytics queries that still read tourist_id/buddy_id.
        legacy.buddy_id = myId
        legacy.tourist_id = recipientId
      }
      const { data, error: insErr } = await supabase
        .from('connections')
        .insert({
          ...legacy,
          requester_id: myId,
          recipient_id: recipientId,
          requester_role: viewerAs,
          recipient_role: viewerAs === 'tourist' ? 'buddy' : 'tourist',
          status: 'pending',
          message: message.trim() || null,
        })
        .select()
        .single<Connection>()
      if (insErr) { setError(insErr.message); return }
      setConnection(data)
      setShowForm(false)
      setMessage('')
    })
  }

  function cancelRequest() {
    if (!connection) return
    startTransition(async () => {
      const supabase = createClient()
      const { error: delErr } = await supabase
        .from('connections')
        .delete()
        .eq('id', connection.id)
      if (delErr) { setError(delErr.message); return }
      setConnection(null)
    })
  }

  function respond(newStatus: ConnectionStatus) {
    if (!connection) return
    startTransition(async () => {
      const supabase = createClient()
      const { data, error: upErr } = await supabase
        .from('connections')
        .update({
          status: newStatus,
          accepted_at: newStatus === 'accepted' ? new Date().toISOString() : null,
        })
        .eq('id', connection.id)
        .select()
        .single<Connection>()
      if (upErr) { setError(upErr.message); return }
      setConnection(data)
    })
  }

  // While the connections lookup is in flight we render nothing rather than
  // a spinner. A spinner here was the visible symptom of a much bigger
  // problem: the lookup is fast, but any delay or re-render left `loading`
  // true and the user saw a gap where the connect action should be. The
  // gap read as "the button is broken".
  if (loading && !connection) {
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

  // ----- Branch 2: signed out
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

  // ----- Branch 3: viewing my own public page
  if (hideWhenSelf && myId === recipientId) return null

  // ----- Branch 4: no row yet → invite form
  if (!connection) {
    if (!showForm) {
      return (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <UserPlus size={14} aria-hidden="true" /> Connect with {recipientName.split(' ')[0]}
          </button>
          {error ? (
            <span className="text-xs text-danger" role="alert">{error}</span>
          ) : null}
        </div>
      )
    }
    return (
      <div className="w-full max-w-md border border-border rounded-sm bg-surface p-3">
        <p className="text-xs text-muted mb-2">
          Send <strong>{recipientName}</strong> a short intro so they know why you want to connect.
        </p>
        <textarea
          rows={3}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hi! I'm visiting Da Nang in November and would love a local guide for the night food tour."
          className="form-input form-textarea mb-2"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={send}
            disabled={isPending}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {isPending ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={13} aria-hidden="true" />
            )}
            Send request
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setMessage(''); setError(null) }}
            disabled={isPending}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <X size={13} aria-hidden="true" /> Cancel
          </button>
          {error ? (
            <span className="text-xs text-danger self-center" role="alert">{error}</span>
          ) : null}
        </div>
      </div>
    )
  }

  // ----- Branch 5: row exists. Determine direction (am I requester or receiver?).
  const iAmRequester = (connection.requester_id ?? connection.tourist_id) === myId

  // Pending, I'm the requester → show "Cancel request"
  if (connection.status === 'pending' && iAmRequester) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-warning text-xs" role="status">
          <Loader2 size={10} className="inline animate-spin mr-1" aria-hidden="true" />
          Request pending
        </span>
        <button
          type="button"
          onClick={cancelRequest}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-muted border border-border-strong hover:bg-paper"
        >
          <X size={13} aria-hidden="true" /> Cancel
        </button>
        {error ? (
          <span className="text-xs text-danger self-center" role="alert">{error}</span>
        ) : null}
      </div>
    )
  }

  // Pending, I'm the receiver → show "Accept" / "Decline"
  if (connection.status === 'pending' && !iAmRequester) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-info text-xs" role="status">
          <UserPlus size={10} className="inline mr-1" aria-hidden="true" />
          New connection request
        </span>
        <button
          type="button"
          onClick={() => respond('accepted')}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-success text-paper border border-success hover:opacity-90"
        >
          {isPending ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
          Accept
        </button>
        <button
          type="button"
          onClick={() => respond('declined')}
          disabled={isPending}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          <X size={13} aria-hidden="true" /> Decline
        </button>
        {error ? (
          <span className="text-xs text-danger self-center" role="alert">{error}</span>
        ) : null}
      </div>
    )
  }

  // Accepted
  if (connection.status === 'accepted') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge badge-success text-xs">
          <Handshake size={10} className="inline mr-1" aria-hidden="true" />
          Connected
        </span>
        <a
          href={`/chat?with=${recipientId}`}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          Open chat
        </a>
      </div>
    )
  }

  // Declined (or any unknown state) — give the requester a way to
  // retry. We DELETE the prior declined row before re-opening the
  // form so the partial unique index
  // (requester_id, recipient_id) doesn't reject the new insert.
  function retryAfterDecline() {
    if (!connection) { setShowForm(true); return }
    startTransition(async () => {
      const supabase = createClient()
      const { error: delErr } = await supabase
        .from('connections')
        .delete()
        .eq('id', connection.id)
      if (delErr) { setError(delErr.message); return }
      setConnection(null)
      setShowForm(true)
    })
  }
  return (
    <button
      type="button"
      onClick={retryAfterDecline}
      disabled={isPending}
      className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
    >
      <UserPlus size={13} aria-hidden="true" /> Connect again
    </button>
  )
}