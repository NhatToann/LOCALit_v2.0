'use client'

import { useEffect, useState, useTransition } from 'react'
import { UserPlus, Check, X, Loader2, Handshake, Send } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
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
  const [myId, setMyId] = useState<string | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Load current user + the existing connection row (if any)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: userData } = await supabase.auth.getUser()
        if (cancelled) return
        const uid = userData.user?.id ?? null
        setMyId(uid)

        if (uid && uid !== recipientId) {
          // New schema: connections.requester_id / recipient_id cover both
          // directions. The unique index uses both columns, so we look
          // up by either ordering.
          const { data, error: connErr } = await supabase
            .from('connections')
            .select('*')
            .or(
              `and(requester_id.eq.${uid},recipient_id.eq.${recipientId}),and(requester_id.eq.${recipientId},recipient_id.eq.${uid})`,
            )
            .limit(1)
            .maybeSingle<Connection>()
          if (!cancelled) {
            if (connErr) {
              // Fallback for legacy rows that have no requester_id set
              const { data: legacyData } = await supabase
                .from('connections')
                .select('*')
                .or(`tourist_id.eq.${uid},buddy_id.eq.${uid}`)
                .or(`tourist_id.eq.${recipientId},buddy_id.eq.${recipientId}`)
                .limit(1)
                .maybeSingle<Connection>()
              setConnection(legacyData ?? null)
            } else {
              setConnection(data ?? null)
            }
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [recipientId])

  function send() {
    if (!myId) return
    startTransition(async () => {
      const supabase = createClient()
      // Legacy columns tourist_id/buddy_id remain NOT NULL — we mirror
      // requester_id/recipient_id values into them so existing RLS +
      // indexes continue to work. New consumers should read
      // requester_id / recipient_id; legacy rows still resolve.
      const legacy = viewerAs === 'tourist'
        ? { tourist_id: myId, buddy_id: recipientId }
        : { tourist_id: myId, buddy_id: recipientId } // schema has only these two; the requester as a buddy still writes tourist_id=myId for legacy compat
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

  // ----- Branch 1: still loading
  if (loading) {
    return (
      <span className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium bg-transparent border border-border-strong text-muted rounded-sm" aria-hidden="true">
        <Loader2 size={14} className="animate-spin" />
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
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          <UserPlus size={14} aria-hidden="true" /> Connect with {recipientName.split(' ')[0]}
        </button>
      )
    }
    return (
      <div className="w-full max-w-md border border-border rounded-sm bg-[#FFFFFF] p-3">
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
          href={`/chat?buddy=${recipientId}`}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          Open chat
        </a>
      </div>
    )
  }

  // Declined (or any unknown state) — give the requester a way to retry
  return (
    <button
      type="button"
      onClick={() => { setConnection(null); setShowForm(true) }}
      disabled={isPending}
      className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
    >
      <UserPlus size={13} aria-hidden="true" /> Connect again
    </button>
  )
}