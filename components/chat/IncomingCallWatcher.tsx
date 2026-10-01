'use client'

/**
 * IncomingCallWatcher — global voice-call notification popup.
 *
 * Mounted in AppShell so it runs on every authenticated page. When a row
 * is inserted into pending_calls with status='ringing' and
 * callee_id=current user, it surfaces a small Accept / Decline card.
 *
 * Accept: navigates to /chat?call=<pendingCallId> which the chat page
 *   handles by joining the LiveKit room.
 * Decline: marks the pending_calls row as declined and dismisses the
 *   popup. No voice session is created.
 *
 * Anti-double-of (2026-10-01):
 *   After the user accepts the call, two UIs can briefly coexist:
 *     (a) this notification popup (top-right)
 *     (b) the chat-page's <CallModal /> rendered by <ActiveCallSheet />
 *   We hide this popup as soon as `activeCallStore` shows an active
 *   call with the same pendingCallId. The previous signal — waiting
 *   for the realtime UPDATE event on `pending_calls.status='accepted'`
 *   to propagate — was racy: the chat-page could be rendering the
 *   CallModal for 100-500 ms before the DB UPDATE round-tripped and
 *   the realtime subscription fired `setIncoming(null)`.
 */

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Phone, PhoneOff, MessageSquare } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { useIncomingCall, type IncomingCall } from '@/lib/realtime/useIncomingCall'
import { useActiveCall } from '@/lib/realtime/useActiveCallStore'
import { chimeDecline, chimeAccept } from '@/lib/webrtc/call-effects'
import { postCallLog } from '@/lib/webrtc/call-log'
import { Avatar } from '@/components/ui/Avatar'

const DEBUG_CALL = process.env.NEXT_PUBLIC_CALL_DEBUG === '1'

interface Props {
  currentUserId: string | null
}

export default function IncomingCallWatcher({ currentUserId }: Props) {
  const incoming = useIncomingCall(currentUserId)
  const router = useRouter()
  const pathname = usePathname()
  const activeCall = useActiveCall()
  const [declineBusy, setDeclineBusy] = useState(false)
  // Locally mark a call as "being accepted" so the popup dismisses
  // INSTANTLY when Accept is clicked — before router.push() has even
  // finished navigating. Without this, the popup stays on screen for
  // ~100-300ms while Next.js swaps the route, and a slow nav (e.g.
  // a code-split /chat chunk) can let the user click Accept twice
  // and end up with two prompt dialogs and two LiveKit rooms.
  // We keep this state for ~10s after Accept — long enough to
  // cover any reasonable navigation round-trip and the time it takes
  // the chat page to update pending_calls.status='accepted' (which
  // is what eventually tells `useIncomingCall` to drop the row).
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  useEffect(() => {
    if (DEBUG_CALL && incoming) {
      // eslint-disable-next-line no-console
      console.log('[dlog] IncomingCallWatcher: incoming detected', {
        pendingCallId: incoming.pendingCallId,
        callerName: incoming.callerName,
      })
    }
  }, [incoming])

  // If we're already on /chat (with or without ?call= param), hide the popup.
  // The chat page renders its own CallModal via the /chat?call=X deep-link
  // effect plus ActiveCallSheet — surfacing BOTH the popup and the modal at
  // once causes two Accept/Decline buttons stacked on screen. By hiding the
  // popup whenever the user is anywhere under /chat/*, the chat page owns
  // the call UI exclusively (the deep-link useEffect below also auto-navigates
  // the user to /chat?call=X so the CallModal appears without them clicking).
  const onChatPage = pathname.startsWith('/chat')
  const onChatWithCall =
    onChatPage &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('call') === incoming?.pendingCallId

  // Also hide while we're navigating to accept this row.
  const acceptingThisCall = incoming != null && acceptingId === incoming.pendingCallId

  // And hide as soon as `activeCallStore` shows an active call with the
  // same pendingCallId. This is the safe synchronisation point: the
  // chat page sets the store IMMEDIATELY after it accepts the row
  // (lib/webrtc/livekit-client.ts onState -> chat/page.tsx onState
  // -> activeCallStore.setActive). Subscribing to it via
  // useSyncExternalStore means the watcher re-renders the same tick.
  const activeCallForSameId =
    incoming != null && activeCall?.callId === incoming.pendingCallId

  const visible =
    incoming != null && !onChatPage && !onChatWithCall && !acceptingThisCall && !activeCallForSameId

  // When the user is already on /chat and a call comes in, auto-navigate
  // to /chat?call=<id> so the chat page's deep-link effect picks it up
  // and renders the CallModal. We use router.replace so the back button
  // still returns to /chat (not to whatever page they came from).
  useEffect(() => {
    if (!onChatPage || !incoming || acceptingThisCall) return
    if (typeof window === 'undefined') return
    const currentCallParam = new URLSearchParams(window.location.search).get('call')
    if (currentCallParam === incoming.pendingCallId) return
    router.replace(`/chat?call=${incoming.pendingCallId}`)
  }, [onChatPage, incoming?.pendingCallId, acceptingThisCall, router])

  function handleAccept() {
    if (!incoming) return
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] IncomingCallWatcher: handleAccept', incoming.pendingCallId)
    }
    chimeAccept()
    // Mark locally first (immediate hide), then navigate. The
    // 10s timeout gives the chat page plenty of time to:
    //   1. mount + read ?call=
    //   2. acceptCall() → update pending_calls.status='accepted'
    //   3. useIncomingCall re-fetches and drops the row
    // If the navigation fails entirely, the timeout still expires
    // and the user can hit Accept again (the row will be back in
    // 'ringing' state because the DB update didn't happen).
    setAcceptingId(incoming.pendingCallId)
    setTimeout(() => setAcceptingId(null), 10_000)
    router.push(`/chat?call=${incoming.pendingCallId}`)
  }

  async function handleDecline() {
    if (!incoming || declineBusy) return
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] IncomingCallWatcher: handleDecline', incoming.pendingCallId)
    }
    setDeclineBusy(true)
    chimeDecline()
    try {
      const supabase = createClient()
      // LiveKit handles the actual room state. For decline we just
      // mark the pending row so the caller's UI shows "declined".
      const { error: updateErr } = await supabase
        .from('pending_calls')
        .update({ status: 'declined', ended_at: new Date().toISOString() })
        .eq('id', incoming.pendingCallId)
        .eq('callee_id', currentUserId!)
      if (updateErr) throw updateErr
      // Emit a call-log message into the conversation so both sides
      // see "Missed voice call" in their chat history.
      void postCallLog({
        conversationId: incoming.conversationId,
        callId: incoming.pendingCallId,
        mode: 'voice',
        outcome: 'declined',
        durationSeconds: 0,
        partnerId: incoming.callerId,
        isOutgoing: false,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[IncomingCallWatcher] decline failed:', err)
    } finally {
      setDeclineBusy(false)
    }
  }

  /**
   * Quick-reply (per call-flow spec): decline AND inject a canned
   * text message into the conversation so the caller sees a
   * chat-reply instead of a silent decline. We use
   * `meta.outcome = 'cancelled'` + `kind = 'call_log'` so the chat
   * list still renders the "missed call" row, AND we insert a real
   * text message for the auto-reply.
   */
  async function handleQuickReply() {
    if (!incoming || declineBusy) return
    setDeclineBusy(true)
    chimeDecline()
    try {
      const supabase = createClient()
      // Mark the pending call as declined so the caller's UI updates.
      await supabase
        .from('pending_calls')
        .update({ status: 'declined', ended_at: new Date().toISOString() })
        .eq('id', incoming.pendingCallId)
        .eq('callee_id', currentUserId!)
      // Insert the canned text message.
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('messages').insert({
          conversation_id: incoming.conversationId,
          sender_id: user.id,
          content: "I'm busy right now — I'll message you in a few minutes.",
        } as never)
      }
      // And a call-log row for the conversation list.
      void postCallLog({
        conversationId: incoming.conversationId,
        callId: incoming.pendingCallId,
        mode: 'voice',
        outcome: 'cancelled',
        durationSeconds: 0,
        partnerId: incoming.callerId,
        isOutgoing: false,
      })
      // Open the chat for the conversation so the user sees the
      // sent message + the call-log row.
      router.push(`/chat?conversation=${incoming.conversationId}`)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[IncomingCallWatcher] quick-reply failed:', err)
    } finally {
      setDeclineBusy(false)
    }
  }

  if (!visible) return null

  return (
    <IncomingCallCard
      incoming={incoming}
      onAccept={handleAccept}
      onDecline={handleDecline}
      onQuickReply={handleQuickReply}
      declineBusy={declineBusy}
    />
  )
}

function IncomingCallCard({
  incoming,
  onAccept,
  onDecline,
  onQuickReply,
  declineBusy,
}: {
  incoming: IncomingCall
  onAccept: () => void
  onDecline: () => void
  onQuickReply: () => void
  declineBusy: boolean
}) {
  // Auto-dismiss after 45s (matches DB expires_at)
  const [secondsLeft, setSecondsLeft] = useState(45)
  useEffect(() => {
    const createdAt = new Date(incoming.createdAt).getTime()
    const tick = () => {
      const elapsed = Math.floor((Date.now() - createdAt) / 1000)
      const remaining = Math.max(0, 45 - elapsed)
      setSecondsLeft(remaining)
      if (remaining === 0) {
        onDecline()
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [incoming.createdAt, onDecline])

  return (
    <div
      role="alertdialog"
      aria-label="Incoming voice call"
      className="fixed top-20 right-4 z-[60] w-[min(360px,calc(100vw-2rem))] bg-surface border border-border-strong rounded-sm shadow-[0_2px_8px_rgba(15,15,15,0.08)] overflow-hidden"
    >
      <div className="p-5">
        <p className="text-eyebrow text-primary mb-3">Incoming voice call</p>
        <div className="flex items-center gap-4">
          <Avatar name={incoming.callerName} src={incoming.callerAvatar} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-ink truncate">
              {incoming.callerName}
            </h2>
            <p className="text-xs text-muted mt-0.5">Ringing · {secondsLeft}s</p>
          </div>
        </div>
      </div>
      <div className="flex border-t border-border">
        <button
          type="button"
          onClick={onQuickReply}
          disabled={declineBusy}
          aria-label="Reply with a quick message and decline"
          title="Send a quick reply and decline"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 text-xs font-medium text-ink bg-surface border-r border-border hover:bg-paper disabled:opacity-50"
        >
          <MessageSquare size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Busy</span>
        </button>
        <button
          type="button"
          onClick={onDecline}
          disabled={declineBusy}
          aria-label="Decline call"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 text-sm font-medium text-danger bg-surface border-r border-border hover:bg-danger-bg disabled:opacity-50"
        >
          <PhoneOff size={16} aria-hidden="true" />
          Decline
        </button>
        <button
          type="button"
          onClick={onAccept}
          aria-label="Accept call"
          className="flex-1 inline-flex items-center justify-center gap-2 h-12 text-sm font-medium text-paper bg-success hover:opacity-90"
        >
          <Phone size={16} aria-hidden="true" />
          Accept
        </button>
      </div>
    </div>
  )
}
