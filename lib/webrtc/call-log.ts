/**
 * call-log — emit a message into the conversation thread when a call
 * ends.
 *
 * Per the voice/video-call spec (2026-10-01):
 *   "Tự động đính kèm 1 Call Log Message vào khung chat
 *    (Ví dụ: 'Cuộc gọi thoại - 02:45' hoặc 'Cuộc gọi nhỡ')."
 *
 * Implementation notes:
 *   - We INSERT into public.messages with a synthetic `kind` column
 *     that downstream UI can read for special rendering.
 *   - The conversation row must exist (it's the FK target). For
 *     calls between strangers, ensureConversation() must be called
 *     before startLiveKitCall() — chat/page.tsx already does this.
 *   - RLS: the message insert uses the authenticated browser client. The
 *     user must be a participant in `conversations`; the RLS policy
 *     enforces that.
 *
 * We deliberately do NOT use messages.content with the raw duration
 * string because the rendering layer treats content as Markdown.
 * Instead we store a structured `meta` jsonb payload and let the
 * chat list render a small icon + label.
 */

import { createClient } from '@/utils/supabase/auth'

export type CallOutcome =
  | 'completed' // connected and reached `ended` normally
  | 'missed'    // caller placed the call but callee didn't accept in 45s
  | 'declined'  // callee actively declined
  | 'failed'    // mic/camera denied, network, or other failure
  | 'cancelled' // caller hung up before callee accepted

export interface CallLogInput {
  conversationId: string
  callId: string
  mode: 'voice' | 'video'
  outcome: CallOutcome
  /** Duration in seconds (only meaningful when outcome === 'completed'). */
  durationSeconds: number
  /** The other party's user id — for the UI subtitle. */
  partnerId: string
  /** Whether the current user was the caller. Used to flip "missed"
   *  vs "no answer" labels. */
  isOutgoing: boolean
}

interface MessageInsert {
  conversation_id: string
  sender_id: string
  content: string
  /** Marker column so the chat list renders a special row instead of
   *  the Markdown bubble. Schema:
   *    messages.kind  text NULL  (default NULL = normal text)
   *    messages.meta  jsonb NULL (default NULL = no extra data)
   */
  kind: 'call_log'
  meta: {
    callId: string
    mode: 'voice' | 'video'
    outcome: CallOutcome
    durationSeconds: number
    partnerId: string
    isOutgoing: boolean
  }
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * Short, human-readable label for the message bubble. Stored in
 * `content` so even if the UI is unaware of `kind=call_log`, the
 * message is still meaningful in fallback rendering.
 */
function labelFor(input: CallLogInput): string {
  const kind = input.mode === 'video' ? 'Video call' : 'Voice call'
  switch (input.outcome) {
    case 'completed':
      return `${kind} · ${fmtDuration(input.durationSeconds)}`
    case 'missed':
      return input.isOutgoing ? `${kind} · No answer` : `Missed ${kind.toLowerCase()}`
    case 'declined':
      return input.isOutgoing ? `${kind} · Declined` : `Declined ${kind.toLowerCase()}`
    case 'cancelled':
      return `${kind} · Cancelled`
    case 'failed':
      return `${kind} · Failed`
    default:
      return kind
  }
}

/**
 * Insert a call-log message. Safe to invoke even if the conversation
 * has been deleted in the meantime (the FK will throw, we log and
 * no-op rather than blocking the call-end UI).
 */
export async function postCallLog(
  input: CallLogInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient()
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser()
    if (userErr || !user) {
      return { ok: false, error: 'Not authenticated' }
    }
    const row: MessageInsert = {
      conversation_id: input.conversationId,
      sender_id: user.id,
      content: labelFor(input),
      kind: 'call_log',
      meta: {
        callId: input.callId,
        mode: input.mode,
        outcome: input.outcome,
        durationSeconds: input.durationSeconds,
        partnerId: input.partnerId,
        isOutgoing: input.isOutgoing,
      },
    }
    const { error: insErr } = await supabase
      .from('messages')
      .insert(row as never)
    if (insErr) {
      return { ok: false, error: insErr.message }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}