'use client'

/**
 * IncomingCallWatcher — global voice-call notification popup.
 *
 * Mounted in AppShell so it runs on every authenticated page. When a row
 * is inserted into pending_calls with status='ringing' and
 * callee_id=current user, it surfaces a small Accept / Decline card.
 *
 * - Accept: navigates to /chat?call=<pendingCallId> which the chat page
 *   handles by calling acceptIncomingCall(). The actual WebRTC
 *   peer-connection is created there using the self-hosted stack
 *   (lib/webrtc/webrtc-client.ts + Supabase Realtime broadcast for
 *   signaling).
 * - Decline: updates pending_calls.status='declined' and writes a
 *   call_event row to the messages table.
 */

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Phone, PhoneOff } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { useIncomingCall, type IncomingCall } from '@/lib/realtime/useIncomingCall'
import { declineIncomingCall } from '@/lib/webrtc/webrtc-client'
import { Avatar } from '@/components/ui/Avatar'

interface Props {
  currentUserId: string | null
}

export default function IncomingCallWatcher({ currentUserId }: Props) {
  const incoming = useIncomingCall(currentUserId)
  const router = useRouter()
  const pathname = usePathname()
  const [declineBusy, setDeclineBusy] = useState(false)

  // If we're already on /chat with the matching ?call= param, hide the popup
  // (the chat page will show its own CallModal).
  const onChatWithCall =
    pathname.startsWith('/chat') &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('call') === incoming?.pendingCallId

  const visible = incoming && !onChatWithCall

  async function handleAccept() {
    if (!incoming) return
    router.push(`/chat?call=${incoming.pendingCallId}`)
  }

  async function handleDecline() {
    if (!incoming || declineBusy) return
    setDeclineBusy(true)
    try {
      const supabase = createClient()
      await declineIncomingCall({
        supabase,
        pendingCallId: incoming.pendingCallId,
        myId: currentUserId!,
        conversationId: incoming.conversationId,
        callerId: incoming.callerId,
      })
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[IncomingCallWatcher] decline failed:', err)
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
      declineBusy={declineBusy}
    />
  )
}

function IncomingCallCard({
  incoming,
  onAccept,
  onDecline,
  declineBusy,
}: {
  incoming: IncomingCall
  onAccept: () => void
  onDecline: () => void
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
