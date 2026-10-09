'use client'

import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  MessageCircle,
  Send,
  Search,
  Phone,
  Video,
  PhoneOff,
  Paperclip,
  MapPinPlus,
  Smile,
  X,
  Edit3,
  Trash2,
  Reply,
  Star,
  MapPin,
  Calendar,
  Image as ImageIcon,
  Check,
  CheckCheck,
  Clock,
  Pin,
  Languages,
  DollarSign,
  MoreHorizontal,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Message, Conversation, MessageReaction, Profile, FocusRequest } from '@/lib/types'
import { Avatar, EmptyState } from '@/components/ui/Avatar'
import FocusRequestBanner from '@/components/focus/FocusRequestBanner'
import { useMessageStream } from '@/lib/realtime/useMessageStream'
import { useTyping } from '@/lib/realtime/useTyping'
import { usePresence } from '@/lib/realtime/usePresence'
import { uploadChatAttachment } from '@/lib/attachments/upload'
import {
  startLiveKitCall,
  type LiveKitCallClient,
} from '@/lib/webrtc/livekit-client'
import {
  releaseMediaPermissions,
} from '@/lib/webrtc/media'
import VideoCallModal from '@/components/chat/VideoCallModal'
import {
  registerActiveCallClient,
  unregisterActiveCallClient,
} from '@/components/layout/ActiveCallSheet'
import { postCallLog } from '@/lib/webrtc/call-log'
import { activeCallStore } from '@/lib/realtime/useActiveCallStore'
import { useAbortFactory } from '@/hooks/useAbort'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🙏']
const MAX_MESSAGE_LEN = 1000
const EDIT_WINDOW_MS = 15 * 60 * 1000
const DEBUG_CALL = process.env.NEXT_PUBLIC_CALL_DEBUG === '1'

// LiveKit-backed call state machine. Mirrors the prior WebRTC
// CallState type so the rest of the chat page (CallModal, headlines,
// auto-dismiss timers) keeps working without changes.
type CallMode = 'voice' | 'video'
type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'declined'
  | 'missed'
  | 'ended'
  | 'failed'

interface ConvSummary {
  id: string
  partner_id: string
  partner_name: string
  partner_avatar: string | null
  partner_role: 'tourist' | 'buddy' | null
  partner_city: string | null
  partner_languages: string[]
  partner_hourly_rate: number | null
  partner_rating_avg: number | null
  is_partner_online: boolean
  last_message_preview: string | null
  last_message_at: string | null
  unread: number
  pinned_message_id: string | null
  typing_user_id: string | null
}

function ChatInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const buddyParam = searchParams.get('buddy')
  // "with" is the symmetric param a buddy uses to open a chat with a
  // tourist (the tourist-side uses ?buddy=). Both reuse the same
  // openConversationWithBuddy() helper which branches on myRole.
  const withParam = searchParams.get('with')
  const callParam = searchParams.get('call')
  const convParam = searchParams.get('c')
  const qParam = searchParams.get('q')

  const openWithParam = withParam || buddyParam

  // RAM OPTIMIZATION (2026-10-08): per-call AbortController factory
  // for the conversations list reload. loadConversations is invoked
  // from 3 different effects (mount, 30s interval, realtime refresh)
  // — without abort, a slow in-flight request held the response in
  // the socket buffer for 30-60s after unmount.
  const { makeController } = useAbortFactory()

  const [myId, setMyId] = useState<string | null>(null)
  const [myName, setMyName] = useState<string>('')
  const [myRole, setMyRole] = useState<'tourist' | 'buddy' | null>(null)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<Message[]>([])
  const [initialReactions, setInitialReactions] = useState<MessageReaction[]>([])
  // (2026-10-02 fix) Composer draft is persisted to localStorage so a
  // page reload (or accidental tab close) doesn't wipe a half-typed
  // message. The draft is keyed by conversation so different threads
  // keep their own in-flight text. We restore on conversation
  // activation and clear on send / conversation switch.
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingContent, setEditingContent] = useState('')
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [emojiFor, setEmojiFor] = useState<string | null>(null)
  const [showSearch, setShowSearch] = useState(!!qParam)
  const [searchQ, setSearchQ] = useState(qParam ?? '')
  const [uploading, setUploading] = useState(false)
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [callClient, setCallClient] = useState<LiveKitCallClient | null>(null)
  const [callMode, setCallMode] = useState<CallMode>('voice')
  const [callState, setCallState] = useState<CallState>('idle')
  /** True if we are the caller. False if we are the callee who accepted
   *  an incoming call. Controls which CallModal buttons are shown. */
  const [isOutgoing, setIsOutgoing] = useState(true)
  /** Wall-clock timestamp when the call reached `connected`. Used to
   *  compute the duration label that lands in the chat-log message.
   */
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null)
  /** Partner info for the active call. Used by CallModal when activeConv
   *  isn't loaded yet (callee on /chat?call=X before conversations
   *  hydrate). Cleared on callState=idle. */
  const [callPartner, setCallPartner] = useState<{
    name: string
    avatar: string | null
  } | null>(null)

  // ===== Focus Mode state (2026-10-09) =====
  const [focusOutgoing, setFocusOutgoing] = useState<FocusRequest | null>(null)
  const [focusIncoming, setFocusIncoming] = useState<FocusRequest | null>(null)
  const [focusBusy, setFocusBusy] = useState(false)
  const [focusError, setFocusError] = useState<string | null>(null)
  /** Hidden <audio> element ref. Receives the remote MediaStream from the
   *  WebRTC peer via srcObject so the browser plays the peer's audio.
   *  Without this, the connection reaches 'connected' state but no audio
   *  plays — see fix 2026-09-28 (Bug 1: "connected but no audio"). */
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastSentRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const videoInputRef = useRef<HTMLInputElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    init()
  }, [])

  // Periodically refresh the conversations list so the heartbeat-driven
  // `is_partner_online` value (which comes from `profiles.is_online` on
  // each conversation's partner) flips in under ~30s without a page
  // reload. Without this, the buddy would show offline until the user
  // navigates away and back. We only refresh while the tab is visible.
  useEffect(() => {
    if (!myId) return
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      void loadConversations(myId)
    }, 30_000)
    return () => clearInterval(id)
  }, [myId])

  useEffect(() => {
    if (openWithParam && myId) openConversationWithBuddy(openWithParam)
  }, [openWithParam, myId])

  useEffect(() => {
    if (convParam && myId) {
      const exists = conversations.some((c) => c.id === convParam)
      if (exists) setActiveId(convParam)
      router.replace('/chat')
    }
  }, [convParam, myId, conversations.length])

  // (2026-10-02 fix) Composer draft persistence — see the draft state
  // declaration above. Hydrate from localStorage when the conversation
  // changes (or when myId resolves from the init() auth round-trip),
  // and write the draft back on every change. The store is cleared on
  // send (see handleSend) so once the message is safely in Supabase,
  // the local copy goes away.
  useEffect(() => {
    if (!activeId || !myId || typeof window === 'undefined') return
    try {
      const key = `localit.draft:${myId}:${activeId}`
      const raw = window.localStorage.getItem(key)
      setDraft(raw ?? '')
    } catch {
      /* localStorage may be disabled (private mode) — silently no-op */
    }
  }, [activeId, myId])
  useEffect(() => {
    if (!activeId || !myId || typeof window === 'undefined') return
    try {
      const key = `localit.draft:${myId}:${activeId}`
      if (draft.trim() === '') {
        window.localStorage.removeItem(key)
      } else {
        window.localStorage.setItem(key, draft)
      }
    } catch {
      /* swallow — quota or private mode */
    }
  }, [draft, activeId, myId])

  // Auto-trigger voice call when ?buddy=X&call=1 (or call=voice) present.
// Legacy ?call=video is treated as voice (no video support anymore).
  // Legacy auto-call trigger: ?buddy=X&call=1 means "open conversation
  // with X and immediately call them". Replaced by IncomingCallWatcher
  // for the receive path; this only handles the dial-via-deeplink case.
  //
  // Safety: startCall() gates on `isPartnerOnline` (computed later in
  // the component) and surfaces an inline error if the buddy is
  // offline. We don't pre-check here to avoid referencing
  // `isPartnerOnline` before its declaration.
  useEffect(() => {
    if (callParam === '1' && buddyParam && myId) {
      // Wait for active conversation to exist before kicking off the call
      const id = setTimeout(() => startCall('voice'), 600)
      router.replace('/chat')
      return () => clearTimeout(id)
    }
    return undefined
  }, [callParam, buddyParam, myId])

  useEffect(() => {
    if (activeId) loadMessages(activeId)
  }, [activeId])

  // When the call state transitions to 'ended' (via the onState callback
  // from livekit-client), reset our local CallClient pointer so the user
  // can start a new call. The global ActiveCallSheet already calls
  // activeCallStore.setActive(null) from its onEnd handler, but it
  // doesn't know about this chat page's local callClient state — so we
  // observe the state transition here and clean up.
  useEffect(() => {
    if (callState === 'connected' && callStartedAt == null) {
      // Lock in the start timestamp once so the duration timer is
      // accurate even if the user toggles between voice and video.
      setCallStartedAt(Date.now())
    }
    if (callState === 'ended' && callClient) {
      // Post a call-log message to the conversation so both sides
      // see "Voice call · MM:SS" / "Missed voice call" etc. in the
      // chat list per the call-flow spec (2026-10-01).
      const activeCall = activeCallStore.getState().active
      const conversationId = activeCall?.conversationId ?? activeId
      // Snapshot the callClient we're cleaning up. If the user starts
      // a new call inside the 1500ms window, `callClient` will have
      // been replaced by the next startOutgoingCall() invocation, and
      // we must NOT null it out or call unregisterCallClient() on the
      // new one. The captured `endingCallClient` below is the
      // identity check.
      const endingCallClient = callClient
      const endingCallId =
        activeCall?.callId ?? `ended:${Date.now()}:${Math.random()}`
      if (conversationId && activeCall) {
        const durationSeconds = callStartedAt
          ? Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000))
          : 0
        void postCallLog({
          conversationId,
          callId: activeCall.callId,
          mode: activeCall.mode ?? 'voice',
          outcome: 'completed',
          durationSeconds,
          partnerId: activeCall.partnerId,
          isOutgoing,
        })
      }
      // Give the CallModal time to render the "ended" frame, then
      // dismiss. 1500ms matches CallModal's auto-dismiss timer so the
      // user sees the "Call ended · MM:SS" headline.
      //
      // (2026-10-02 critical fix) The cleanup uses captured refs
      // (`endingCallClient`, `endingCallId`) so that if the user
      // starts a NEW call inside this 1500ms window — which was the
      // '2nd call seriously broken' symptom reported today — the
      // new call's callClient / callState is NOT overwritten by this
      // older timeout firing.
      const id = setTimeout(() => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
        if (endingCallClient && callClient === endingCallClient) {
          unregisterCallClient(endingCallId)
          setCallClient(null)
          setCallPartner(null)
          setCallStartedAt(null)
          setCallState('idle')
        }
      }, 1500)
      return () => clearTimeout(id)
    }
    if (callState === 'failed' && callClient) {
      // Failed state — LiveKit connect hung, mic denied, etc. The
      // failure is short-lived (chat page already shows the error for
      // 2.5s and tears down the activeCallStore entry). Same
      // identity-check fix: only clean up if the current callClient
      // is still the failed one.
      const endingCallClient = callClient
      const endingCallId =
        activeCallStore.getState().active?.callId ?? ''
      const id = setTimeout(() => {
        if (endingCallClient && callClient === endingCallClient) {
          unregisterCallClient(endingCallId)
          setCallClient(null)
          setCallPartner(null)
          setCallStartedAt(null)
          // Note: do NOT setCallState('idle') here — the chat page's
          // catch block already does that within ~2.5s of 'failed'
          // firing, and any earlier write here would race it.
        }
      }, 2500)
      return () => clearTimeout(id)
    }
    return undefined
  }, [callState, callClient, activeId, callStartedAt, isOutgoing])

  // Expose the active-call snapshot on window so Playwright tests can
  // read the current state without subscribing to the activeCallStore
  // singleton directly. Updated synchronously on every callState
  // change. Removed when the chat page unmounts (e.g. user logs out).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      __activeCallState?: {
        state: CallState
        isOutgoing: boolean
        partnerName: string | null
        hasClient: boolean
      }
    }
    w.__activeCallState = {
      state: callState,
      isOutgoing,
      partnerName: callPartner?.name ?? null,
      hasClient: !!callClient,
    }
  }, [callState, isOutgoing, callPartner, callClient])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [initialMessages.length])

  // Mark as read whenever active conversation opens or new messages arrive
  useEffect(() => {
    if (activeId && myId) markAsRead(activeId)
  }, [activeId, initialMessages.length, myId])

  async function init() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    setMyId(user.id)
    setMyName(
      (user.user_metadata?.full_name as string) ||
        (user.email?.split('@')[0] ?? 'Me'),
    )
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()
    setMyRole((profile?.role as 'tourist' | 'buddy') ?? 'tourist')
    if (profile?.full_name) setMyName(profile.full_name)
    await loadConversations(user.id)
    setLoading(false)
  }

  async function loadConversations(uid: string) {
    const ctrl = makeController()
    const { signal } = ctrl
    function racedAbort<T>(p: PromiseLike<T>): PromiseLike<T> {
      if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'))
      return Promise.race([
        Promise.resolve(p),
        new Promise<T>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
        }),
      ])
    }
    const supabase = createClient()
    try {
      const { data } = await racedAbort(supabase
        .from('conversations')
        .select(
          `
          id, tourist_id, buddy_id, updated_at,
          last_message_preview, last_message_at,
          last_read_at_by_tourist, last_read_at_by_buddy,
          pinned_message_id, typing_user_id,
          tourist_profile:safe_profiles!conversations_tourist_id_fkey(full_name, avatar_url, is_online, id, role),
          buddy_profile:safe_profiles!conversations_buddy_id_fkey(full_name, avatar_url, is_online, id, role)
        `,
        )
        .or(`tourist_id.eq.${uid},buddy_id.eq.${uid}`)
        .order('last_message_at', { ascending: false, nullsFirst: false }))

      if (signal.aborted) return

      if (!data || data.length === 0) {
        setConversations([])
        return
      }

      // Fetch unread counts in a single follow-up query (avoid the FK embed collision)
      const convIds = (data as any[]).map((c) => c.id)
      const { data: msgs } = await racedAbort(supabase
        .from('messages')
        .select('conversation_id, sender_id, is_read, created_at')
        .in('conversation_id', convIds)
        .eq('is_read', false))

      if (signal.aborted) return

      const unreadByConv: Record<string, number> = {}
      for (const m of msgs ?? []) {
        if (m.sender_id === uid) continue
        unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
      }

      const mapped: ConvSummary[] = (data as any[]).map((c) => {
      const isTouristSide = c.tourist_id === uid
      // 2026-10-09: FKs now point to profiles, so the embed is
      // `tourist_profile` / `buddy_profile` — both safe_profiles rows.
      // The partner is whichever side is NOT the current user.
      const partner = isTouristSide ? c.buddy_profile : c.tourist_profile
      const partnerName = partner?.full_name ?? 'Buddy'
      return {
        id: c.id,
        partner_id: partner?.id ?? '',
        partner_name: partnerName,
        partner_avatar: partner?.avatar_url ?? null,
        // Side-aware role: the partner may be the same role as the
        // current user (chat now allows any pairing). Read the role
        // directly off the partner's safe_profiles row.
        partner_role: (partner?.role as 'tourist' | 'buddy' | null) ?? null,
        partner_city: null,
        partner_languages: [],
        partner_hourly_rate: null,
        partner_rating_avg: null,
        is_partner_online: !!partner?.is_online,
        last_message_preview: c.last_message_preview ?? '',
        last_message_at: c.last_message_at ?? c.updated_at,
        unread: unreadByConv[c.id] ?? 0,
        pinned_message_id: c.pinned_message_id ?? null,
        typing_user_id: c.typing_user_id === uid ? null : c.typing_user_id,
      }
    })
    setConversations(mapped)
    if (mapped.length > 0 && !activeId) setActiveId(mapped[0].id)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || signal.aborted) return
      // Fall through — leave conversations as-is if the follow-up
      // unread-count query failed. Better stale than blank.
      if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_CALL_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.warn('[chat] loadConversations error:', (err as Error).message)
      }
    }
  }

  async function openConversationWithBuddy(otherBuddyId: string) {
    if (!myId) return
    if (myId === otherBuddyId) return
    const supabase = createClient()
    // Look up an existing conversation between us and the buddy. Note
    // the `tourist_id` ↔ `buddy_id` swap in the OR — a buddy-side
    // user can also have a conversation whose row puts THEM in the
    // buddy_id column and the tourist in the tourist_id column.
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(tourist_id.eq.${myId},buddy_id.eq.${otherBuddyId}),and(tourist_id.eq.${otherBuddyId},buddy_id.eq.${myId})`,
      )
      .maybeSingle()

    let convId = existing?.id
    if (!convId) {
      // 2026-10-09: same-role chats are now allowed. The conversations
      // FKs were relaxed to point to profiles (not the role-tables), so
      // we no longer have to branch on role when picking the column.
      // Use a canonical lex order so the UNIQUE (tourist_id, buddy_id)
      // constraint can't collide on the same pair in different
      // orientations.
      const a = myId < otherBuddyId ? myId : otherBuddyId
      const b = myId < otherBuddyId ? otherBuddyId : myId
      const insertPayload = { tourist_id: a, buddy_id: b }
      // Race-condition fix (2026-10-09): when the same user opens the
      // same `/chat?buddy=...` URL twice in quick succession (or two
      // browser tabs at once), both invocations can pass the existing
      // check on the same render frame and fall through to insert.
      // The UNIQUE constraint on (tourist_id, buddy_id) then fires 409
      // for the second insert. Upsert with ignoreDuplicates collapses
      // the race to a no-op and lets us read the existing row back.
      const { data: upserted, error } = await supabase
        .from('conversations')
        .upsert(insertPayload, { onConflict: 'tourist_id,buddy_id', ignoreDuplicates: true })
        .select('id')
        .maybeSingle()
      if (error) {
        setError('Could not open conversation: ' + error.message)
        return
      }
      convId = upserted?.id
      if (!convId) {
        // ignoreDuplicates returned an empty array because the row
        // already existed from a concurrent openConversationWithBuddy.
        // Re-query to get the existing id.
        const { data: existingAfterRace } = await supabase
          .from('conversations')
          .select('id')
          .or(
            `and(tourist_id.eq.${myId},buddy_id.eq.${otherBuddyId}),and(tourist_id.eq.${otherBuddyId},buddy_id.eq.${myId})`,
          )
          .maybeSingle()
        if (!existingAfterRace?.id) {
          setError('Could not open conversation: race condition; please try again.')
          return
        }
        convId = existingAfterRace.id
      }
    }
    await loadConversations(myId)
    setActiveId(convId)
    router.replace('/chat')
  }

  async function loadMessages(conversationId: string) {
    const supabase = createClient()
    const [{ data: msgs }, { data: rx }] = await Promise.all([
      supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase.from('message_reactions').select('*'),
    ])
    setInitialMessages((msgs as Message[]) ?? [])
    setInitialReactions((rx as MessageReaction[]) ?? [])
  }

  async function markAsRead(conversationId: string) {
    if (!myId) return
    const supabase = createClient()
    const column =
      myRole === 'tourist' ? 'last_read_at_by_tourist' : 'last_read_at_by_buddy'
    await supabase
      .from('conversations')
      .update({ [column]: new Date().toISOString() })
      .eq('id', conversationId)
    // Reset unread badge for this conversation
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    )
  }

  const { messages } = useMessageStream(activeId, initialMessages, initialReactions)

  // Realtime updates on conversation list (new messages → refresh sidebar).
  // Debounced so a burst of inserts collapses into one round-trip.
  useEffect(() => {
    if (!myId) return
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void loadConversations(myId)
      }, 1000)
    }
    const channel = supabase
      .channel(`conv-list-${myId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        refresh,
      )
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [myId])

  const peerNames: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of conversations) map[c.partner_id] = c.partner_name
    return map
  }, [conversations])

  const { typingPeers, notifyTyping } = useTyping(activeId, myId, peerNames)

  const { presenceUsers } = usePresence(activeId ? `presence-conv-${activeId}` : null, myId ? { user_id: myId, full_name: myName } : null)
  // Layered presence signal:
  //   - realtimeOnline: Supabase Realtime presence (sub-second, /chat only)
  //   - heartbeatOnline: profiles.is_online from the DB heartbeat (works
  //     on every page because GlobalOnlineHeartbeat updates it)
  // Either signal being positive unlocks the phone button. This fixes
  // the long-standing "buddy shows offline on non-/chat pages" bug
  // (the realtime channel is mounted only on /chat, so visitors on
  // /map, /browse, /profile, etc. saw `presenceUsers=[]`).
  // activeConv is declared later in the component; compute it inline
  // here so we can layer the heartbeat value into the gate.
  const activeConvForPresence = conversations.find((c) => c.id === activeId)
  const realtimeOnline = presenceUsers.some((u) => u.user_id !== myId)
  const heartbeatOnline = !!activeConvForPresence?.is_partner_online
  const isPartnerOnline = realtimeOnline || heartbeatOnline

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    const content = draft.trim()
    if (!content || !activeId || !myId) return
    if (content.length > MAX_MESSAGE_LEN) {
      setError('Message too long.')
      return
    }
    const now = Date.now()
    if (now - lastSentRef.current < 700) {
      setError('Please wait a moment before sending another message.')
      return
    }
    lastSentRef.current = now
    setSending(true)
    setError('')
    const supabase = createClient()

    const insertPayload: Record<string, unknown> = {
      conversation_id: activeId,
      sender_id: myId,
      content,
      message_type: 'text',
    }
    if (replyingTo) insertPayload.reply_to_id = replyingTo.id

    const { data, error: sendErr } = await supabase
      .from('messages')
      .insert(insertPayload)
      .select('*')
      .single()

    if (sendErr) {
      setError('Could not send: ' + sendErr.message)
      setSending(false)
      return
    }
    if (data) {
      // Optimistic + realtime will reconcile
      const preview = content.length > 80 ? content.slice(0, 77) + '...' : content
      await supabase
        .from('conversations')
        .update({
          updated_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          last_message_preview: preview,
          typing_user_id: null,
          typing_started_at: null,
        })
        .eq('id', activeId)
    }
    setDraft('')
    // Clear the persisted draft so the composer starts clean on reload.
    // (2026-10-02 fix) The localStorage effect above would otherwise
    // keep the just-sent text around until the React render flushes
    // and the effect fires with the empty string — which is fast but
    // creates a one-frame window where a tab-restore can still see
    // the sent text. Removing it explicitly closes that race.
    if (typeof window !== 'undefined' && myId && activeId) {
      try {
        window.localStorage.removeItem(`localit.draft:${myId}:${activeId}`)
      } catch {
        /* swallow */
      }
    }
    setReplyingTo(null)
    setSending(false)
    composerRef.current?.focus()
  }

  async function handleEditSave(messageId: string) {
    const content = editingContent.trim()
    if (!content) return
    const supabase = createClient()
    await supabase
      .from('messages')
      .update({ content, edited_at: new Date().toISOString() })
      .eq('id', messageId)
    setEditingId(null)
    setEditingContent('')
  }

  async function handleDelete(messageId: string) {
    if (!confirm('Delete this message for both sides?')) return
    const supabase = createClient()
    await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString(), content: '' })
      .eq('id', messageId)
  }

  async function handleReact(messageId: string, emoji: string) {
    if (!myId) return
    const supabase = createClient()
    const existing = initialReactions.find(
      (r) => r.message_id === messageId && r.user_id === myId && r.emoji === emoji,
    )
    // Optimistic toggle: update local state immediately so the UI
    // responds without waiting for a re-fetch. Realtime subscription
    // will reconcile any other-user actions.
    if (existing) {
      setInitialReactions((prev) => prev.filter((r) => r.id !== existing.id))
      const { error: delErr } = await supabase
        .from('message_reactions')
        .delete()
        .eq('id', existing.id)
      if (delErr) {
        // Roll back on failure
        setInitialReactions((prev) => [...prev, existing])
      }
    } else {
      const optimisticId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimistic: MessageReaction = {
        id: optimisticId,
        message_id: messageId,
        user_id: myId,
        emoji,
        created_at: new Date().toISOString(),
      }
      setInitialReactions((prev) => [...prev, optimistic])
      const { data, error: insErr } = await supabase
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: myId, emoji })
        .select('*')
        .single()
      if (insErr || !data) {
        setInitialReactions((prev) => prev.filter((r) => r.id !== optimisticId))
      } else {
        setInitialReactions((prev) =>
          prev.map((r) => (r.id === optimisticId ? (data as MessageReaction) : r)),
        )
      }
    }
    setEmojiFor(null)
  }

  async function handlePin(messageId: string) {
    if (!activeId) return
    const activeConv = conversations.find((c) => c.id === activeId)
    const supabase = createClient()
    const newPinned = activeConv?.pinned_message_id === messageId ? null : messageId
    await supabase
      .from('conversations')
      .update({ pinned_message_id: newPinned })
      .eq('id', activeId)
    loadConversations(myId!)
  }

  async function handleAttach(type: 'image' | 'file' | 'video' | 'location') {
    if (!activeId || !myId) return
    setShowAttachMenu(false)
    const supabase = createClient()

    if (type === 'location') {
      if (!navigator.geolocation) {
        setError('Location not supported by your browser.')
        return
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const lat = pos.coords.latitude
          const lng = pos.coords.longitude
          const meta = { lat, lng, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}` }
          await supabase.from('messages').insert({
            conversation_id: activeId,
            sender_id: myId,
            content: meta.address,
            message_type: 'location',
            metadata: meta,
            reply_to_id: replyingTo?.id ?? null,
          })
          await supabase
            .from('conversations')
            .update({
              updated_at: new Date().toISOString(),
              last_message_at: new Date().toISOString(),
              last_message_preview: '📍 Shared location',
            })
            .eq('id', activeId)
          setReplyingTo(null)
        },
        () => setError('Could not get your location.'),
        { enableHighAccuracy: false, timeout: 8000 },
      )
      return
    }

    // image / file / video picker
    const input =
      type === 'image'
        ? imageInputRef.current
        : type === 'video'
          ? videoInputRef.current
          : fileInputRef.current
    if (!input) return
    input.value = ''
    input.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'file' | 'video') {
    const file = e.target.files?.[0]
    if (!file || !activeId || !myId) return

    // Per-kind size limit: images 10MB, files 25MB, videos 50MB.
    const limit =
      kind === 'image' ? 10 * 1024 * 1024 : kind === 'video' ? 50 * 1024 * 1024 : 25 * 1024 * 1024
    if (file.size > limit) {
      setError(
        `${kind === 'image' ? 'Image' : kind === 'video' ? 'Video' : 'File'} is too large. Max ${(limit / 1024 / 1024).toFixed(0)} MB.`,
      )
      return
    }

    setUploading(true)
    setError('')
    try {
      const url = await uploadChatAttachment(createClient(), file)
      const supabase2 = createClient()
      const previewText =
        kind === 'image'
          ? '📷 Photo'
          : kind === 'video'
            ? '🎬 Video'
            : `📎 ${file.name}`
      const messageType: 'image' | 'file' | 'video' =
        kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file'
      await supabase2.from('messages').insert({
        conversation_id: activeId,
        sender_id: myId,
        content: previewText,
        message_type: messageType,
        metadata: {
          url,
          file_name: file.name,
          file_size: file.size,
          mime: file.type,
        },
        reply_to_id: replyingTo?.id ?? null,
      })
      await supabase2
        .from('conversations')
        .update({
          updated_at: new Date().toISOString(),
          last_message_at: new Date().toISOString(),
          last_message_preview: previewText,
        })
        .eq('id', activeId)
      setReplyingTo(null)
    } catch (err) {
      setError('Upload failed: ' + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  // ============================================================
  // Focus Mode handlers (2026-10-09)
  // ============================================================
  async function sendFocusRequest() {
    if (!activeConv || !myId) return
    if (!isPartnerOnline) {
      setFocusError('Your buddy is offline. Try again when they come back.')
      return
    }
    setFocusBusy(true)
    setFocusError(null)
    try {
      const partnerId = activeConv.partner_id
      const res = await fetch('/api/focus/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recipient_id: partnerId,
          conversation_id: activeConv.id,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (json.error === 'pending_request_exists' && json.request) {
          setFocusOutgoing(json.request as FocusRequest)
          return
        }
        if (json.error === 'requester_in_active_session' && json.session_id) {
          router.push(`/focus/${json.session_id}`)
          return
        }
        if (json.error === 'same_role_focus_not_allowed') {
          setFocusError(json.message ?? 'Focus Mode is only available across roles.')
          return
        }
        setFocusError(json.message ?? json.error ?? 'Could not send Focus request.')
        return
      }
      setFocusOutgoing(json.request as FocusRequest)
    } catch (err) {
      setFocusError(`Network error: ${(err as Error).message}`)
    } finally {
      setFocusBusy(false)
    }
  }

  async function cancelFocusRequest() {
    if (!focusOutgoing) return
    setFocusBusy(true)
    try {
      await fetch(`/api/focus/${focusOutgoing.id}/cancel`, { method: 'POST' })
      setFocusOutgoing(null)
    } finally {
      setFocusBusy(false)
    }
  }

  async function respondToFocus(action: 'accept' | 'decline') {
    if (!focusIncoming) return
    setFocusBusy(true)
    setFocusError(null)
    try {
      const res = await fetch(`/api/focus/${focusIncoming.id}/respond`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setFocusError(json.message ?? json.error ?? 'Could not respond.')
        return
      }
      if (action === 'accept' && json.session?.id) {
        setFocusIncoming(null)
        router.push(`/focus/${json.session.id}`)
      } else {
        setFocusIncoming(null)
      }
    } finally {
      setFocusBusy(false)
    }
  }

  // Realtime subscription for incoming focus requests
  useEffect(() => {
    if (!myId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`focus-incoming-${myId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'focus_requests',
          filter: `recipient_id=eq.${myId}`,
        },
        async (payload) => {
          const row = payload.new as FocusRequest
          if (row.status !== 'pending') return
          // Hydrate requester profile
          const { data: profile } = await supabase
            .from('safe_profiles')
            .select('*')
            .eq('id', row.requester_id)
            .maybeSingle()
          setFocusIncoming({ ...row, requester: profile as Profile | undefined })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'focus_requests',
          filter: `requester_id=eq.${myId}`,
        },
        (payload) => {
          const row = payload.new as FocusRequest
          if (row.status === 'accepted') {
            // We were the requester; the recipient accepted. The new
            // session id isn't in this row — we re-fetch /api/focus/active.
            setFocusOutgoing(null)
            void fetch('/api/focus/active')
              .then((r) => r.json())
              .then((j) => {
                if (j.session?.id) {
                  router.push(`/focus/${j.session.id}`)
                }
              })
              .catch(() => undefined)
          } else if (
            row.status === 'declined' ||
            row.status === 'expired' ||
            row.status === 'cancelled'
          ) {
            setFocusOutgoing(null)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [myId, router])

  // Hydrate outgoing/incoming focus state on mount
  useEffect(() => {
    if (!myId) return
    let cancelled = false
    async function hydrate() {
      try {
        const supabase = createClient()
        const nowIso = new Date().toISOString()
        const [{ data: outgoing }, { data: incoming }] = await Promise.all([
          supabase
            .from('focus_requests')
            .select('*')
            .eq('requester_id', myId)
            .eq('status', 'pending')
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('focus_requests')
            .select('*')
            .eq('recipient_id', myId)
            .eq('status', 'pending')
            .gt('expires_at', nowIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (cancelled) return
        if (outgoing) setFocusOutgoing(outgoing as FocusRequest)
        if (incoming) {
          const { data: profile } = await supabase
            .from('safe_profiles')
            .select('*')
            .eq('id', incoming.requester_id)
            .maybeSingle()
          setFocusIncoming({
            ...(incoming as FocusRequest),
            requester: profile as Profile | undefined,
          })
        }
      } catch {
        /* ignore */
      }
    }
    void hydrate()
    return () => {
      cancelled = true
    }
  }, [myId])

  // When the conversation changes, reset focus state for the previous
  // partner and re-hydrate (request might be tied to a different conv).
  // NOTE: `activeConv` is computed inline at line ~1750; we read activeId
  // directly so this effect doesn't depend on its declaration order.
  useEffect(() => {
    if (!activeId || !myId) return
    setFocusOutgoing((cur) => (cur && cur.conversation_id === activeId ? cur : null))
    setFocusIncoming((cur) => (cur && cur.conversation_id === activeId ? cur : null))
  }, [activeId, myId])

  /**
   * Attach the remote MediaStream from the WebRTC peer to the hidden
   * <audio> element so the browser plays the peer's voice.
   *
   * Bug 1 (2026-09-28): previously the callback was `() => undefined`,
   * so the stream was captured into a local var on call-client but never
   * reached an audio element — calls were 'connected' but completely
   * silent. `audio.play()` requires a user gesture in most browsers; the
   * accept/decline/answer click already provides that gesture, so this
   * fires inside the gesture's microtask window and works without an
   * explicit user click on the <audio>.
   */
  function attachRemoteAudio(stream: MediaStream) {
    const el = remoteAudioRef.current
    if (!el) return
    if (el.srcObject !== stream) {
      el.srcObject = stream
    }
    el.muted = false
    const playPromise = el.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((err: unknown) => {
        // eslint-disable-next-line no-console
        if (process.env.NODE_ENV !== 'production') console.warn('[chat] audio.play() rejected:', err)
      })
    }
  }

  /**
   * Register a CallClient in the module-level registry so the global
   * ActiveCallSheet (mounted in AppShell) can attach to the same
   * WebRTC peer connection. Without this the ActiveCallSheet has
   * no reference to the live client and would render an empty modal.
   */
  function registerCallClient(callId: string, client: LiveKitCallClient): void {
    registerActiveCallClient(callId, client)
  }

  function unregisterCallClient(callId: string): void {
    unregisterActiveCallClient(callId)
  }

  async function startCall(mode: CallMode) {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] startCall invoked', {
        mode,
        activeConvId: activeConv?.id,
        partnerId: activeConv?.partner_id,
        isPartnerOnline,
        callClientExists: !!callClient,
      })
    }
    if (!activeConv || !myId) {
      setError('Open a conversation first.')
      return
    }
    // Presence gate: don't try to call a buddy who isn't connected
    // to Supabase Realtime — the WebRTC signaling channel
    // `calls:${userId}` would never reach them and the call would
    // time out (see AGENTS.md "Stringee Voice Calls" section,
    // replaced by self-hosted WebRTC 2026-09-30).
    if (!isPartnerOnline) {
      setError('Cannot call: buddy is offline.')
      return
    }
    if (callClient) return
    setCallMode(mode)
    setCallState('calling')
    setIsOutgoing(true)
    setError('')
    setCallPartner({
      name: activeConv.partner_name,
      avatar: activeConv.partner_avatar,
    })

    // -----------------------------------------------------------------
    // CRITICAL (2026-10-02 bug fix):
    // The caller MUST see the call UI appear instantly the moment they
    // tap the Phone button — before any network round-trip, before
    // pending_calls has been written, before LiveKit's token endpoint,
    // before room.connect(), and BEFORE the browser's mic permission
    // prompt fires. The old sequence:
    //   1. setCallState('calling')  ← local hook only, AppShell sees nothing
    //   2. insert pending_calls    ← 100-500ms
    //   3. startLiveKitCall        ← token fetch + WS handshake (300-1500ms)
    //   4. publishMic              ← MIC PERMISSION PROMPT (blocks 1-30s)
    //   5. activeCallStore.setActive(...)
    // meant the user saw the Phone button "click" then nothing for 1-3
    // seconds, then the mic prompt appeared over a blank page, then
    // (only after they accepted) the modal finally rendered. That felt
    // broken. We now lift the store update to step 1: the moment the user
    // taps Phone, ActiveCallSheet mounts the modal with state='calling'
    // and headline "Calling <name>…" — exactly the UX we want.
    // Mic permission is still triggered inside publishMic (only there,
    // because that's the user gesture for send, and reusing the prompt
    // would be wasteful), but the user has clear context: they see the
    // call modal asking them to wait while the prompt fires on top of
    // it.
    // -----------------------------------------------------------------
    const conversationId = activeConv.id
    const partnerId = activeConv.partner_id
    const partnerName = activeConv.partner_name
    const partnerAvatar = activeConv.partner_avatar
    // Provisional callId — gets replaced by the real one from
    // startLiveKitCall. The store keys on callId so ActiveCallSheet can
    // resolve the LiveKit client from the registry.
    const provisionalCallId = `pending:${myId}:${conversationId}:${Date.now()}`
    activeCallStore.setActive({
      callId: provisionalCallId,
      conversationId,
      partnerId,
      partnerName,
      partnerAvatar,
      isOutgoing: true,
      mode,
      // Caller dials immediately. The LiveKit handshake emits
      // 'connecting' → 'connected' via opts.onState, both of which
      // overwrite this initial state via patchActive(). startedAt
      // stays as a fallback for terminal-state duration display if
      // the call never reaches 'connected'.
      state: 'calling',
      networkStatus: 'online',
      quality: null,
      errorMessage: null,
      startedAt: Date.now(),
    })

    // Pending_calls insert — non-blocking, fire-and-forget. If it fails
    // (e.g. schema change in the DB), we still proceed because LiveKit
    // handles the actual transport; the only side-effect of a missing
    // pending_calls row is the receiver's IncomingCallWatcher won't
    // show the Accept popup. We log + carry on.
    let pendingCallId = ''
    try {
      const supabase = createClient()
      const { data: row } = await supabase
        .from('pending_calls')
        .insert({
          conversation_id: conversationId,
          caller_id: myId,
          callee_id: partnerId,
          status: 'ringing',
          type: mode,
          room_name: `call:${conversationId}`,
        })
        .select('id')
        .single()
      if (row?.id) pendingCallId = row.id
    } catch (insertErr) {
      if (DEBUG_CALL) {
        console.log('[dlog] pending_calls insert failed', insertErr)
      }
    }
    try {
      const roomName = `call:${conversationId}`
      const client = await startLiveKitCall({
        myId,
        roomName,
        participantName: myName,
        video: mode === 'video',
        onState: (s) => {
          setCallState(s)
          // Per call-flow spec (2026-10-02 update 06): the timer MUST
          // NOT count from the moment the user clicks Phone / Accept —
          // it counts from the moment BOTH peers are in the LiveKit
          // room. The LiveKit client defers emitting 'connected' until
          // localConnected AND hasRemoteParticipant are both true
          // (no longer requires hasRemoteTrack — see livekit-client.ts).
          // We stamp startedAt here on the connecting→connected
          // transition so ActiveCallSheet has an accurate baseline
          // for the MM:SS timer.
          if (s === 'connected') {
            activeCallStore.patchActive({ state: s, startedAt: Date.now() })
          } else {
            activeCallStore.patchActive({ state: s })
          }
        },
        onError: (e) => {
          setError(e.message)
          activeCallStore.patchActive({ errorMessage: e.message })
        },
        onLocalStream: () => undefined,
        onRemoteStream: attachRemoteAudio,
      })
      // Mic/camera permission prompt fires INSIDE publishMic() — by
      // the time we get here the user has already seen the CallModal
      // and clicked the Phone button (intent is clear, UX context is
      // set). publishMic re-raises MicDeniedError if the user denies;
      // we surface that as a friendly `failed` state with the error
      // message, then bail out before registering the call client
      // or ActiveCallStore. This matches the Messenger/Meet UX:
      // deny → "Call failed · Microphone permission was denied."
      try {
        await client.publishMic()
      } catch (micErr) {
        const micMsg = (micErr as Error).message || 'Microphone permission was denied.'
        setError(micMsg)
        setCallState('failed')
        activeCallStore.patchActive({ state: 'failed', errorMessage: micMsg })
        setTimeout(() => {
          setCallState('idle')
          activeCallStore.setActive(null)
        }, 3000)
        // Clean up the LiveKit room we just opened so we don't leak
        // an unconnected room onto the LiveKit server.
        try {
          client.end()
        } catch {
          /* swallow */
        }
        // Also mark the pending_calls row as failed so the partner's
        // UI doesn't sit on a "ringing" state for 45s.
        if (pendingCallId) {
          void createClient()
            .from('pending_calls')
            .update({ status: 'failed', ended_at: new Date().toISOString() })
            .eq('id', pendingCallId)
            .then(() => undefined)
        }
        return
      }
      const realCallId = pendingCallId || client.callId
      setCallClient(client)
      registerActiveCallClient(realCallId, client)
      // Swap the provisional callId for the real one. Patch in place
      // so ActiveCallSheet doesn't unmount during the swap. Preserve
      // the original startedAt so the call timer counts from the
      // moment the user clicked Phone, not from when LiveKit
      // finished its handshake.
      //
      // (2026-10-02 bug fix) Do NOT overwrite `state` here. By the
      // time we reach this line, LiveKit has already run through
      // its connecting→connected handshake and `opts.onState` has
      // patched `active.startedAt` and `active.state` to 'connected'.
      // Re-issuing setActive with state:'calling' would rewind the
      // call UI back to "Calling <name>…" and erase the connected
      // timer the survivor is watching. Read the current state from
      // the store and pass it through verbatim.
      const currentActive = activeCallStore.getActive()
      const swapStartedAt = currentActive?.startedAt ?? Date.now()
      activeCallStore.setActive({
        callId: realCallId,
        conversationId,
        partnerId,
        partnerName,
        partnerAvatar,
        isOutgoing: true,
        mode,
        // Preserve whatever state LiveKit has driven us to — usually
        // 'connected' by this point, but 'connecting' if mic publish
        // is still pending.
        state: currentActive?.state ?? 'calling',
        networkStatus: currentActive?.networkStatus ?? 'online',
        quality: currentActive?.quality ?? null,
        errorMessage: currentActive?.errorMessage ?? null,
        startedAt: swapStartedAt,
      })
      // Wire the registry swap so the sheet can resolve the new
      // callId. We re-register under both keys to avoid a 250ms
      // blank gap where the registry lookup misses.
      registerActiveCallClient(provisionalCallId, client)
    } catch (e) {
      setError('Could not start call: ' + (e as Error).message)
      setCallState('failed')
      activeCallStore.patchActive({
        state: 'failed',
        errorMessage: 'Could not start call: ' + (e as Error).message,
      })
      setTimeout(() => {
        setCallState('idle')
        activeCallStore.setActive(null)
      }, 2500)
    }
  }

  /**
   * Accept an incoming call. Triggered by:
   *   - /chat?call=<pendingCallId> deep-link from IncomingCallWatcher
   *   - In-page Accept button (future)
   *
   * Implementation note (2026-09-30 — bug fix):
   *   Previously this required `activeConv` to already be derived from
   *   the conversations list. When Accept landed via /chat?call=X on a
   *   fresh page mount, the conversations query was still in-flight,
   *   `activeConv` was null, and the function returned silently —
   *   leaving the callee with no CallModal at all. We now look up the
   *   peer/partner details from the pending_calls row + myId directly,
   *   so the accept can complete regardless of whether the chat list
   *   has loaded yet.
   */
  async function acceptCall(pendingCallId: string) {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] acceptCall invoked', {
        pendingCallId,
        myId,
        callClientExists: !!callClient,
      })
    }
    if (!myId || callClient) return
    // CRITICAL (2026-10-02 bug fix): Set the active call IMMEDIATELY
    // so the modal renders the moment the user taps Accept — before
    // any DB query, any LiveKit token round-trip, and BEFORE the mic
    // permission prompt. The old code waited until AFTER the DB row
    // was queried AND the LiveKit room was connected before calling
    // activeCallStore.setActive, which meant the user saw the popup
    // disappear (Accept button hides the popup per IncomingCallWatcher's
    // anti-double-ui logic), then nothing for ~1-2 seconds while the
    // mic prompt blocked the UI. We now use a provisional callId and
    // lift the store update to the very first line — same fix as the
    // caller path.
    const provisionalCallId = `accepting:${pendingCallId}`
    activeCallStore.setActive({
      callId: provisionalCallId,
      conversationId: '', // filled in once DB row resolves
      partnerId: '',
      partnerName: 'Unknown caller',
      partnerAvatar: null,
      isOutgoing: false,
      mode: 'voice',
      state: 'connecting',
      networkStatus: 'online',
      quality: null,
      errorMessage: null,
      startedAt: Date.now(),
    })
    let incomingMode: CallMode = 'voice' as CallMode
    setCallMode(incomingMode)
    setIsOutgoing(false)
    setError('')
    // Pre-emptively surface "Ringing…" so the modal renders with a
    // meaningful state even before LiveKit connects.
    setCallState('ringing')
    let peerId: string
    let partnerName: string
    let partnerAvatar: string | null
    let conversationId: string
    try {
      // Look up the pending_calls row to learn who the caller is
      // AND whether this is a voice or video call (the `type`
      // column was added 2026-10-01). We also fetch the caller's
      // profile so the modal can show the partner name even
      // before the conversation list is loaded.
      const supabase = createClient()
      const { data: row, error: rowErr } = await supabase
        .from('pending_calls')
        .select('conversation_id, caller_id, callee_id, status, type')
        .eq('id', pendingCallId)
        .single()
      if (rowErr || !row) {
        throw new Error('Call record not found')
      }
      if (row.callee_id !== myId) {
        throw new Error('This call is not addressed to you')
      }
      if (row.status === 'ended' || row.status === 'declined' || row.status === 'missed') {
        throw new Error('Call already ' + row.status)
      }
      conversationId = row.conversation_id
      peerId = row.caller_id
      incomingMode = row.type === 'video' ? 'video' : 'voice'
      setCallMode(incomingMode)
      // Try to enrich partner info from activeConv (if loaded) or from
      // safe_profiles (as a fallback). Don't fail if neither resolves.
      const profile =
        activeConv && activeConv.id === conversationId
          ? { full_name: activeConv.partner_name, avatar_url: activeConv.partner_avatar }
          : (
              await supabase
                .from('safe_profiles')
                .select('full_name, avatar_url')
                .eq('id', peerId)
                .maybeSingle<{ full_name: string | null; avatar_url: string | null }>()
            ).data
      partnerName = profile?.full_name ?? 'Caller'
      partnerAvatar = profile?.avatar_url ?? null
      setCallPartner({ name: partnerName, avatar: partnerAvatar })
      // Patch the active call with the resolved partner info so the
      // modal headline + avatar update immediately. We keep the
      // provisional callId until the LiveKit client is created below.
      // Preserve the original startedAt so the call timer counts
      // from the moment the user clicked Accept.
      const originalStartedAt = activeCallStore.getActive()?.startedAt ?? Date.now()
      activeCallStore.setActive({
        callId: provisionalCallId,
        conversationId,
        partnerId: peerId,
        partnerName,
        partnerAvatar,
        isOutgoing: false,
        mode: incomingMode,
        state: 'connecting',
        networkStatus: 'online',
        quality: null,
        errorMessage: null,
        startedAt: originalStartedAt,
      })
      // Mark the row as accepted so the caller's UI updates and
      // IncomingCallWatcher (if still polling from a sibling tab)
      // stops re-surfacing the Accept popup. Fire-and-forget; failure
      // is non-fatal (the row will TTL out in 45s anyway). We
      // intentionally do NOT block on this — getting into the
      // LiveKit room fast matters more than a perfectly synced DB
      // state. Note we update `status` but NOT `ended_at` so the
      // caller can still see the call as "in progress" — they'll
      // mark it `ended` when the call actually ends.
      void supabase
        .from('pending_calls')
        .update({ status: 'accepted' })
        .eq('id', pendingCallId)
        .eq('callee_id', myId)
        .then(({ error: acceptDbErr }) => {
          if (acceptDbErr && DEBUG_CALL) {
            // eslint-disable-next-line no-console
            console.log('[dlog] pending_calls accept update failed', acceptDbErr.message)
          }
        })
    } catch (e) {
      setError('Could not accept call: ' + (e as Error).message)
      setCallState('failed')
      activeCallStore.patchActive({
        state: 'failed',
        errorMessage: 'Could not accept call: ' + (e as Error).message,
      })
      setTimeout(() => {
        setCallState('idle')
        activeCallStore.setActive(null)
      }, 2500)
      return
    }
    // Make sure the chat view shows the conversation the call belongs
    // to. Without this the modal would render but the chat list could
    // highlight a different thread.
    if (activeId !== conversationId) setActiveId(conversationId)

    try {
      const roomName = `call:${conversationId}`
      const client = await startLiveKitCall({
        myId,
        roomName,
        participantName: myName,
        video: incomingMode === 'video',
        onState: (s) => {
          setCallState(s)
          // Per call-flow spec (2026-10-02 update 06): the timer MUST
          // NOT count from the moment the user clicks Phone / Accept —
          // it counts from the moment BOTH peers are in the LiveKit
          // room. The LiveKit client defers emitting 'connected' until
          // localConnected AND hasRemoteParticipant are both true
          // (no longer requires hasRemoteTrack — see livekit-client.ts).
          // We stamp startedAt here on the connecting→connected
          // transition so ActiveCallSheet has an accurate baseline
          // for the MM:SS timer.
          if (s === 'connected') {
            activeCallStore.patchActive({ state: s, startedAt: Date.now() })
          } else {
            activeCallStore.patchActive({ state: s })
          }
        },
        onError: (e) => {
          setError(e.message)
          activeCallStore.patchActive({ errorMessage: e.message })
        },
        onLocalStream: () => undefined,
        onRemoteStream: attachRemoteAudio,
      })
      // publishMic is where the mic permission prompt happens. If the
      // user denies, it throws MicDeniedError — we surface that as a
      // friendly `failed` state and bail out before registering the
      // call client or activeCallStore. Same UX as the caller path.
      try {
        await client.publishMic()
      } catch (micErr) {
        const micMsg = (micErr as Error).message || 'Microphone permission was denied.'
        setError(micMsg)
        setCallState('failed')
        activeCallStore.patchActive({ state: 'failed', errorMessage: micMsg })
        setTimeout(() => {
          setCallState('idle')
          activeCallStore.setActive(null)
        }, 3000)
        try {
          client.end()
        } catch {
          /* swallow */
        }
        // Mark the DB row as failed so the partner's UI clears.
        void createClient()
          .from('pending_calls')
          .update({ status: 'failed', ended_at: new Date().toISOString() })
          .eq('id', pendingCallId)
          .then(() => undefined)
        return
      }
      setCallClient(client)
      // Use the real callId from this point. Register under both
      // provisional + real so the registry lookup doesn't miss during
      // the swap (ActiveCallSheet polls every 250ms).
      registerActiveCallClient(pendingCallId, client)
      registerActiveCallClient(provisionalCallId, client)
      // Preserve the original startedAt so the call timer counts
      // from the moment the user clicked Accept, not from when the
      // LiveKit client was created.
      //
      // (2026-10-02 bug fix) Do NOT hard-code state:'connecting' here.
      // By the time publishMic() resolves, the LiveKit client has
      // already gone through its connecting→connected handshake and
      // opts.onState has patched the store to state:'connected' +
      // startedAt:Date.now(). Re-issuing setActive with the hard-coded
      // 'connecting' would rewind the survivor's modal back to the
      // "Connecting…" frame and erase the connected timer. Read the
      // current store entry and pass state through verbatim.
      const currentActive = activeCallStore.getActive()
      const swapStartedAt = currentActive?.startedAt ?? Date.now()
      activeCallStore.setActive({
        callId: pendingCallId,
        conversationId,
        partnerId: peerId,
        partnerName,
        partnerAvatar,
        isOutgoing: false,
        mode: incomingMode,
        state: currentActive?.state ?? 'connecting',
        networkStatus: currentActive?.networkStatus ?? 'online',
        quality: currentActive?.quality ?? null,
        errorMessage: currentActive?.errorMessage ?? null,
        startedAt: swapStartedAt,
      })
    } catch (e) {
      setError('Could not accept call: ' + (e as Error).message)
      setCallState('failed')
      activeCallStore.patchActive({
        state: 'failed',
        errorMessage: 'Could not accept call: ' + (e as Error).message,
      })
      setTimeout(() => {
        setCallState('idle')
        activeCallStore.setActive(null)
      }, 3500)
    }
  }

  function endCall() {
    // Detach the remote stream so the audio element stops playing once
    // the call ends and the next call starts clean.
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    const callId = activeCallStore.getState().active?.callId ?? ''
    callClient?.end()
    if (callClient) {
      unregisterCallClient(callId)
    }
    // Stop local tracks and invalidate the cached MediaStream so the
    // next call re-prompts. Voice-only flows kept working with
    // releaseMic() in the past; releaseMediaPermissions() does the
    // same plus handles video tracks.
    releaseMediaPermissions()
    setCallClient(null)
    setCallPartner(null)
    setTimeout(() => setCallState('idle'), 1000)
    activeCallStore.setActive(null)
    // Mark the pending_calls row as ended so the partner's UI updates
    // and `IncomingCallWatcher` doesn't re-surface it after refresh.
    // Failures here are non-fatal (the row has a TTL anyway).
    if (callId && /^[0-9a-f-]{8,128}$/i.test(callId)) {
      void createClient()
        .from('pending_calls')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', callId)
        .then(({ error }) => {
          if (error && DEBUG_CALL) {
            console.log('[dlog] pending_calls end update failed', error.message)
          }
        })
    }
  }

  // When navigating in via ?call=<pendingCallId>, the pending_calls row
  // tells us which conversation this call belongs to. Look it up,
  // then call acceptIncomingCall.
  //
  // 2026-09-30 — bug fix: previously this effect required `activeId`
  // to be set before calling acceptCall. But on a fresh /chat?call=X
  // navigation, the conversations query was still in-flight and the
  // early return fired → no modal. acceptCall now reads the row
  // directly so it can complete the accept regardless. We also wait
  // for `loading=false` (set at the end of init()) so myId is
  // guaranteed to be populated.
  useEffect(() => {
    if (!callParam || loading || !myId || callClient) return
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] chat deep-link effect', { callParam, loading, myId })
    }
    const isCallerParam =
      callParam === '1' || callParam === 'voice' || callParam === 'video'
    if (isCallerParam) return
    let cancelled = false
    void (async () => {
      const supabase = createClient()
      const { data: row, error } = await supabase
        .from('pending_calls')
        .select('conversation_id, callee_id, status')
        .eq('id', callParam)
        .single()
      if (cancelled || error || !row) return
      if (row.callee_id !== myId) return
      if (row.status !== 'ringing') {
        // Already handled by another tab or by a decline elsewhere.
        router.replace('/chat')
        return
      }
      // Highlight the matching conversation in the chat list (purely
      // cosmetic — acceptCall doesn't depend on activeId anymore).
      if (activeId !== row.conversation_id) setActiveId(row.conversation_id)
      void acceptCall(callParam)
      router.replace('/chat')
    })()
    return () => {
      cancelled = true
    }
  }, [callParam, loading, myId, callClient])

  // (2026-10-02 fix) We do NOT auto-end the call when the chat page
  // unmounts. The chat page owns the WebRTC peer connection (per
  // call-flow spec), and ActiveCallSheet is just the visual mount
  // spanning pages. If the user navigates away from /chat mid-call,
  // the modal stays open via ActiveCallSheet and the call continues
  // — the user has to click End on the modal (or close the tab) to
  // stop the call.
  //
  // The '2nd call seriously broken' bug from 2026-10-02 came from a
  // different cause (see livekit-client.ts toString hardening for the
  // exact fix). We do nothing on unmount here.

  // Search filter
  const filteredMessages = useMemo(() => {
    if (!searchQ.trim()) return messages
    const q = searchQ.toLowerCase()
    return messages.filter((m) => m.content.toLowerCase().includes(q))
  }, [messages, searchQ])

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const activeConv = conversations.find((c) => c.id === activeId)
  const pinnedMessage = activeConv?.pinned_message_id
    ? messages.find((m) => m.id === activeConv.pinned_message_id)
    : null

  if (conversations.length === 0 && !buddyParam) {
    return (
      <div className="container-page py-12">
        <h1 className="text-page-title mb-6">Messages</h1>
        <div className="border border-border rounded-sm p-12 bg-surface">
          <EmptyState
            icon={MessageCircle}
            title="No conversations yet"
            description="Connect with a buddy to start chatting. Browse the buddy list to send your first request."
            action={
              <Link
                href="/browse"
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                Browse Da Nang buddies
              </Link>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-eyebrow text-primary mb-2">
            Messages
            <span
              className="ml-2 italic text-muted"
              style={{ letterSpacing: '0.02em' }}
              aria-hidden="true"
            >
              tin nhắn
            </span>
          </p>
          <h1 className="text-page-title">Messages</h1>
          <p className="text-xs text-muted mt-1">
            Conversations with your Da Nang buddies.
            <span
              className="ml-1 italic text-subtle"
              style={{ letterSpacing: '0.01em' }}
              aria-hidden="true"
            >
              cuộc trò chuyện
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch((s) => !s)}
            aria-label={showSearch ? 'Hide search' : 'Search messages'}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
          >
            <Search size={14} aria-hidden="true" />
            Search
          </button>
        </div>
      </div>

      <div
        className="border border-border rounded-sm bg-surface overflow-hidden grid grid-cols-1 md:grid-cols-[280px_1fr] lg:grid-cols-[280px_1fr_300px]"
        style={{ minHeight: 560 }}
      >
        {/* LEFT — Conversation list */}
        <aside
          className="border-b md:border-b-0 md:border-r border-border overflow-y-auto"
          aria-label="Conversations"
        >
          <ul>
            {conversations.map((c) => {
              const isActive = c.id === activeId
              const roleTag = c.partner_role === 'buddy' ? 'Buddy' : c.partner_role === 'tourist' ? 'Tourist' : null
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`w-full text-left p-3 border-b border-border last:border-b-0 hover:bg-paper transition-colors duration-150 ${
                      isActive ? 'bg-info-bg border-l-2 border-l-primary' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={c.partner_name}
                        src={c.partner_avatar}
                        size="md"
                        online={c.is_partner_online}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">
                            {c.partner_name}
                          </p>
                          {roleTag ? (
                            <span
                              className={`inline-flex items-center px-1 h-[14px] text-[9px] font-mono uppercase tracking-wide flex-shrink-0 ${
                                c.partner_role === 'buddy'
                                  ? 'bg-primary/10 text-primary border border-primary/30'
                                  : 'bg-info-bg text-info border border-info/30'
                              }`}
                              aria-label={`Partner role: ${roleTag}`}
                            >
                              {roleTag}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted truncate">
                          {c.last_message_preview || c.partner_city || 'Start chatting'}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {c.unread > 0 ? (
                          <span
                            className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-paper text-[10px] font-semibold"
                            style={{
                              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {c.unread}
                          </span>
                        ) : null}
                        {c.pinned_message_id ? (
                          <Pin size={11} className="text-muted" aria-hidden="true" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        {/* CENTER — Active thread */}
        <main className="flex flex-col min-w-0 border-r border-border">
          {activeConv ? (
            <>
              {/* Header */}
              <header className="px-4 py-3 border-b border-border flex items-center gap-3 bg-surface">
                <Avatar
                  name={activeConv.partner_name}
                  src={activeConv.partner_avatar}
                  size="md"
                  online={isPartnerOnline}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">
                    {activeConv.partner_name}
                  </p>
                  <p className="text-xs text-muted" aria-live="polite">
                    {typingPeers.length > 0
                      ? `${typingPeers[0].full_name ?? 'They'} is typing…`
                      : isPartnerOnline
                        ? 'Online now'
                        : 'Offline'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => startCall('voice')}
                  disabled={!isPartnerOnline}
                  aria-label={isPartnerOnline ? 'Start voice call' : 'Voice call unavailable — buddy offline'}
                  aria-disabled={!isPartnerOnline}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {isPartnerOnline ? (
                    <Phone size={15} aria-hidden="true" />
                  ) : (
                    <PhoneOff size={15} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => startCall('video')}
                  disabled={!isPartnerOnline}
                  aria-label={isPartnerOnline ? 'Start video call' : 'Video call unavailable — buddy offline'}
                  aria-disabled={!isPartnerOnline}
                  data-testid="start-video-call"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {isPartnerOnline ? (
                    <Video size={15} aria-hidden="true" />
                  ) : (
                    <PhoneOff size={15} aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (focusOutgoing) {
                      void cancelFocusRequest()
                    } else {
                      void sendFocusRequest()
                    }
                  }}
                  disabled={!isPartnerOnline || focusBusy}
                  aria-label={
                    !isPartnerOnline
                      ? 'Focus unavailable — buddy offline'
                      : focusOutgoing
                        ? 'Cancel Focus request'
                        : 'Start Focus Mode'
                  }
                  title={
                    !isPartnerOnline
                      ? 'Buddy is offline'
                      : focusOutgoing
                        ? 'Cancel Focus request'
                        : 'Start Focus Mode'
                  }
                  className="inline-flex items-center gap-1 h-9 px-2 text-sm font-medium rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-focus-primary"
                >
                  <MapPinPlus size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {focusOutgoing ? 'Cancel' : 'Focus'}
                  </span>
                </button>
              </header>

              {/* Focus request banner (incoming or outgoing) */}
              {focusIncoming && activeConv && focusIncoming.conversation_id === activeConv.id ? (
                <div className="px-4 pt-3">
                  <FocusRequestBanner
                    variant="incoming"
                    request={focusIncoming}
                    partner={focusIncoming.requester ?? null}
                    busy={focusBusy}
                    onAccept={() => respondToFocus('accept')}
                    onDecline={() => respondToFocus('decline')}
                  />
                  {focusError ? (
                    <p className="text-xs text-danger mt-1" role="alert">
                      {focusError}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {focusOutgoing && activeConv && focusOutgoing.conversation_id === activeConv.id ? (
                <div className="px-4 pt-3">
                  <FocusRequestBanner
                    variant="outgoing"
                    request={focusOutgoing}
                    partner={{
                      id: activeConv.partner_id,
                      full_name: activeConv.partner_name,
                    }}
                    busy={focusBusy}
                    onCancel={() => cancelFocusRequest()}
                  />
                </div>
              ) : null}

              {/* Pinned message banner */}
              {pinnedMessage ? (
                <div className="px-4 py-2 border-b border-border bg-warning-bg text-warning flex items-center gap-2 text-xs">
                  <Pin size={12} aria-hidden="true" />
                  <span className="truncate">
                    Pinned: {pinnedMessage.content || 'Message'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePin(pinnedMessage.id)}
                    className="ml-auto text-warning hover:underline flex-shrink-0"
                  >
                    Unpin
                  </button>
                </div>
              ) : null}

              {/* Search bar */}
              {showSearch ? (
                <div className="px-4 py-2 border-b border-border bg-paper">
                  <input
                    type="search"
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search in this conversation…"
                    aria-label="Search messages"
                    className="w-full px-3 py-2 text-sm border border-border rounded-sm bg-surface focus:outline-none focus:border-primary"
                  />
                  {searchQ ? (
                    <p className="text-[11px] text-muted mt-1">
                      {filteredMessages.length} match{filteredMessages.length === 1 ? '' : 'es'}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {/* Messages */}
              <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto p-4 bg-paper space-y-1"
                aria-live="polite"
                style={{ maxHeight: 'calc(100vh - 320px)' }}
              >
                {messages.length === 0 ? (
                  <div className="text-center py-12">
                    <EmptyState
                      icon={MessageCircle}
                      title={`Say hi to ${activeConv.partner_name.split(' ')[0]}`}
                      description="Share your Da Nang plans, ask about favorite spots, or coordinate a meeting time."
                    />
                  </div>
                ) : (
                  <>
                    {groupByDay(messages).map((group) => (
                      <div key={group.day} className="space-y-1">
                        <div className="flex items-center justify-center my-3">
                          <span className="px-2 py-0.5 text-[10px] text-subtle bg-surface border border-border rounded-sm">
                            {group.day}
                          </span>
                        </div>
                        {group.messages.map((m) => (
                          <MessageBubble
                            key={m.id}
                            message={m}
                            myId={myId}
                            partnerName={activeConv.partner_name}
                            isMine={m.sender_id === myId}
                            canEdit={
                              m.sender_id === myId &&
                              !m.deleted_at &&
                              Date.now() - new Date(m.created_at).getTime() < EDIT_WINDOW_MS
                            }
                            isPinned={activeConv.pinned_message_id === m.id}
                            isEditing={editingId === m.id}
                            editingContent={editingContent}
                            onStartEdit={() => {
                              setEditingId(m.id)
                              setEditingContent(m.content)
                            }}
                            onChangeEdit={setEditingContent}
                            onSaveEdit={() => handleEditSave(m.id)}
                            onCancelEdit={() => {
                              setEditingId(null)
                              setEditingContent('')
                            }}
                            onDelete={() => handleDelete(m.id)}
                            onReply={() => setReplyingTo(m)}
                            onReact={(emoji) => handleReact(m.id, emoji)}
                            onPin={() => handlePin(m.id)}
                            onToggleEmoji={() =>
                              setEmojiFor((cur) => (cur === m.id ? null : m.id))
                            }
                            emojiOpen={emojiFor === m.id}
                          />
                        ))}
                      </div>
                    ))}
                    {typingPeers.length > 0 ? (
                      <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted">
                        <span className="inline-block w-1.5 h-1.5 bg-muted rounded-full animate-pulse" />
                        <span className="inline-block w-1.5 h-1.5 bg-muted rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                        <span className="inline-block w-1.5 h-1.5 bg-muted rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                        {typingPeers[0].full_name ?? 'They'} is typing…
                      </div>
                    ) : null}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Reply preview */}
              {replyingTo ? (
                <div className="px-4 py-2 border-t border-border bg-info-bg flex items-center gap-2 text-xs">
                  <Reply size={12} aria-hidden="true" className="text-info" />
                  <span className="text-info truncate">
                    Replying to: {replyingTo.content || 'message'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    aria-label="Cancel reply"
                    className="ml-auto text-info hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}

              {/* Attach menu */}
              {showAttachMenu ? (
                <div className="px-4 py-2 border-t border-border bg-paper flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleAttach('image')}
                    className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
                  >
                    <ImageIcon size={12} aria-hidden="true" /> Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttach('video')}
                    className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
                  >
                    <Video size={12} aria-hidden="true" /> Video
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttach('file')}
                    className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
                  >
                    <Paperclip size={12} aria-hidden="true" /> File (PDF, txt)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAttach('location')}
                    className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
                  >
                    <MapPin size={12} aria-hidden="true" /> Location
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAttachMenu(false)}
                    aria-label="Close attach menu"
                    className="ml-auto text-xs text-muted hover:text-ink"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              {/* Composer */}
              <form
                onSubmit={handleSend}
                className="flex items-end gap-2 p-3 border-t border-border bg-surface"
              >
                <button
                  type="button"
                  onClick={() => setShowAttachMenu((s) => !s)}
                  aria-label="Attach"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-sm text-muted hover:bg-paper"
                >
                  <Paperclip size={16} aria-hidden="true" />
                </button>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    notifyTyping()
                    setError('')
                  }}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      handleSend(e as unknown as React.FormEvent)
                    } else if (e.key === 'Escape' && replyingTo) {
                      setReplyingTo(null)
                    }
                  }}
                  maxLength={MAX_MESSAGE_LEN}
                  placeholder={replyingTo ? `Reply to ${replyingTo.sender_id === myId ? 'yourself' : activeConv.partner_name.split(' ')[0]}…` : 'Type a message'}
                  disabled={sending || uploading}
                  aria-label="Message"
                  rows={1}
                  className="form-input flex-1 resize-none min-h-[36px] max-h-32"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                  disabled={sending || !draft.trim() || uploading}
                  aria-label="Send message"
                >
                  <Send size={14} aria-hidden="true" />
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleFile(e, 'image')}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  hidden
                  onChange={(e) => handleFile(e, 'file')}
                />
                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                  hidden
                  onChange={(e) => handleFile(e, 'video')}
                />
              </form>
              {error ? (
                <p className="text-xs text-danger px-4 pb-2" role="alert">
                  {error}
                </p>
              ) : null}
              {uploading ? (
                <p className="text-xs text-muted px-4 pb-2">Uploading…</p>
              ) : null}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-sm text-muted">
              Choose a conversation to start chatting.
            </div>
          )}
        </main>

        {/* RIGHT — Buddy / Quick actions */}
        {activeConv ? (
          <aside
            className="hidden lg:flex flex-col border-l border-border overflow-y-auto p-4 gap-4 bg-surface"
            aria-label="Conversation details"
          >
            <div className="flex flex-col items-center text-center">
              <Avatar
                name={activeConv.partner_name}
                src={activeConv.partner_avatar}
                size="xl"
                online={isPartnerOnline}
              />
              <h3 className="mt-3 text-base font-semibold">
                {activeConv.partner_name}
              </h3>
              <p className="text-xs text-muted">
                {activeConv.partner_city ?? 'Da Nang local'}
              </p>
              <Link
                href={`/buddies/${activeConv.partner_id}`}
                className="mt-3 text-xs text-primary hover:underline"
              >
                View full profile →
              </Link>
            </div>

            {/* Languages — always rendered so layout stays identical regardless
    of whether the partner has filled the field. "Not specified" is the
    graceful fallback used when partner_languages is null/empty. */}
            <div className="border-t border-border pt-3">
              <p className="text-eyebrow text-muted mb-2">Languages</p>
              {activeConv.partner_languages?.length ? (
                <div className="flex flex-wrap gap-1">
                  {activeConv.partner_languages.slice(0, 4).map((l) => (
                    <span
                      key={l}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-sm bg-info-bg text-info border border-info-bg"
                    >
                      {l}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-subtle italic">Not specified yet</p>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <p className="text-eyebrow text-muted mb-2">Quick actions</p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => startCall('voice')}
                  disabled={!isPartnerOnline}
                  aria-label={isPartnerOnline ? 'Voice call' : 'Call unavailable — buddy offline'}
                  aria-disabled={!isPartnerOnline}
                  title={isPartnerOnline ? undefined : 'Buddy is offline'}
                  className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-primary"
                >
                  {isPartnerOnline ? (
                    <Phone size={13} aria-hidden="true" />
                  ) : (
                    <PhoneOff size={13} aria-hidden="true" />
                  )}
                  Voice call
                </button>
                <Link
                  href="/trips/create"
                  className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                >
                  <Calendar size={13} aria-hidden="true" />
                  Plan a trip
                </Link>
              </div>
            </div>

            <div className="border-t border-border pt-3 mt-auto">
              <p className="text-[10px] text-subtle leading-relaxed">
                Tip: pin important messages with the bookmark icon. Reply
                threads keep conversations focused. Edit or delete within 15
                minutes of sending.
              </p>
            </div>
          </aside>
        ) : null}
      </div>

      {/*
        The chat page used to render its own CallModal here. With the
        cross-page active-call store (lib/realtime/useActiveCallStore)
        and the global ActiveCallSheet (components/layout/ActiveCallSheet
        mounted in AppShell), the modal now lives at the AppShell level
        so it persists when the user navigates away from /chat mid-call.
        The chat page still owns the WebRTC peer connection (created by
        startOutgoingCall/acceptIncomingCall) and forwards state updates
        to the store; the global sheet reads the store to render.
      */}

      {/*
        Hidden <audio> sink for the active call's remote MediaStream.
        The WebRTC peer fires ontrack with the peer's voice; we attach
        it here via srcObject so the browser plays it. Rendered at all
        times (not only during callState !== 'idle') so the ref is
        attached to a live DOM element by the time the stream arrives.
        autoplay + muted=false: the accept/answer click satisfies the
        user-gesture requirement that browsers enforce on autoplay.
      */}
      <audio
        ref={remoteAudioRef}
        autoPlay
        playsInline
        aria-hidden="true"
        className="hidden"
      />
    </div>
  )
}

function groupByDay(messages: Message[]) {
  const groups: { day: string; messages: Message[] }[] = []
  for (const m of messages) {
    const d = new Date(m.created_at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    let label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    if (d.toDateString() === today.toDateString()) label = 'Today'
    else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
    const last = groups[groups.length - 1]
    if (last && last.day === label) last.messages.push(m)
    else groups.push({ day: label, messages: [m] })
  }
  return groups
}

function MessageBubble({
  message,
  myId,
  partnerName,
  isMine,
  canEdit,
  isPinned,
  isEditing,
  editingContent,
  onStartEdit,
  onChangeEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onReply,
  onReact,
  onPin,
  onToggleEmoji,
  emojiOpen,
}: {
  message: Message
  myId: string | null
  partnerName: string
  isMine: boolean
  canEdit: boolean
  isPinned: boolean
  isEditing: boolean
  editingContent: string
  onStartEdit: () => void
  onChangeEdit: (v: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: () => void
  onReply: () => void
  onReact: (emoji: string) => void
  onPin: () => void
  onToggleEmoji: () => void
  emojiOpen: boolean
}) {
  const time = new Date(message.created_at)
  const timeLabel = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  // System-event bubble (e.g. voice call log) — render as a centered,
  // muted pill so it does not look like a normal user message.
  if (message.message_type === 'call_event') {
    return (
      <li className="flex items-center justify-center my-1">
        <span
          className="inline-flex items-center gap-2 px-3 py-1 text-[11px] font-medium text-muted bg-paper border border-border rounded-sm"
          title={new Date(message.created_at).toLocaleString('en-US')}
        >
          <Phone size={11} aria-hidden="true" className="text-subtle" />
          <span>{message.content}</span>
          <span aria-hidden="true">·</span>
          <time dateTime={message.created_at} className="font-mono tracking-tight">
            {timeLabel}
          </time>
        </span>
      </li>
    )
  }

  if (message.deleted_at) {
    return (
      <li className="flex items-center gap-2 px-3 my-0.5">
        <span className="inline-block flex-1 text-center text-xs italic text-subtle border border-dashed border-border rounded-sm py-2">
          🚫 Message deleted
        </span>
      </li>
    )
  }

  return (
    <li
      className={`group flex items-end gap-2 my-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}
    >
      {!isMine ? <Avatar name={partnerName} size="sm" /> : null}
      <div className="relative max-w-[70%]">
        {emojiOpen ? (
          <div
            className={`absolute z-10 ${isMine ? 'right-0' : 'left-0'} bottom-full mb-1 flex gap-1 p-1 bg-surface border border-border rounded-sm shadow-focus`}
            role="menu"
          >
            {REACTION_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(e)}
                className="text-lg hover:bg-paper rounded-sm w-8 h-8 inline-flex items-center justify-center"
                aria-label={`React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}

        <div
          className={`px-3 py-2 rounded-sm text-sm leading-relaxed ${
            isMine
              ? 'bg-primary text-paper rounded-br-none'
              : 'bg-surface border border-border text-ink rounded-bl-none'
          }`}
        >
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editingContent}
                onChange={(e) => onChangeEdit(e.target.value)}
                rows={2}
                maxLength={MAX_MESSAGE_LEN}
                autoFocus
                className="w-full text-sm px-2 py-1 border border-border rounded-sm bg-paper text-ink"
              />
              <div className="flex gap-1 justify-end">
                <button
                  type="button"
                  onClick={onCancelEdit}
                  className="text-xs text-paper/70 hover:text-paper px-2 py-0.5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onSaveEdit}
                  className="text-xs font-medium px-2 py-0.5 bg-paper text-primary rounded-sm"
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              {message.message_type === 'image' && (message.metadata as any)?.url ? (
                <img
                  src={(message.metadata as any).url}
                  alt={(message.metadata as any).file_name ?? 'attached image'}
                  className="rounded-sm max-w-full max-h-72 object-cover mb-1"
                />
              ) : null}
              {message.message_type === 'video' && (message.metadata as any)?.url ? (
                <video
                  controls
                  preload="metadata"
                  className="rounded-sm max-w-full max-h-72 bg-black mb-1"
                  src={(message.metadata as any).url}
                >
                  <track kind="captions" />
                </video>
              ) : null}
              {message.message_type === 'file' && (message.metadata as any)?.url ? (
                <a
                  href={(message.metadata as any).url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 underline ${isMine ? 'text-paper' : 'text-primary'}`}
                >
                  <Paperclip size={12} aria-hidden="true" />
                  {(message.metadata as any).file_name ?? 'Open file'}
                </a>
              ) : null}
              {message.message_type === 'location' ? (
                <a
                  href={`https://www.openstreetmap.org/?mlat=${(message.metadata as any)?.lat}&mlon=${(message.metadata as any)?.lng}#map=16/${(message.metadata as any)?.lat}/${(message.metadata as any)?.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 underline ${isMine ? 'text-paper' : 'text-primary'}`}
                >
                  <MapPin size={12} aria-hidden="true" />
                  {message.content || 'Shared location'}
                </a>
              ) : null}
              {message.message_type === 'text' || (!message.message_type && message.content) ? (
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              ) : null}
              {message.edited_at ? (
                <span className={`block text-[10px] mt-0.5 italic ${isMine ? 'text-paper/60' : 'text-subtle'}`}>
                  (edited)
                </span>
              ) : null}
            </>
          )}
          <div className={`flex items-center gap-1 mt-1 text-[10px] ${isMine ? 'text-paper/70' : 'text-muted'}`}>
            <time dateTime={message.created_at}>{timeLabel}</time>
            {isMine ? (
              message.is_read ? (
                <CheckCheck size={11} aria-hidden="true" className="text-paper" />
              ) : (
                <Check size={11} aria-hidden="true" />
              )
            ) : null}
            {isPinned ? (
              <Pin size={10} aria-hidden="true" className="ml-1" />
            ) : null}
          </div>
        </div>

        {/* Action toolbar (visible on hover) */}
        {!isEditing ? (
          <div
            className={`absolute top-0 ${isMine ? 'right-full mr-1' : 'left-full ml-1'} hidden group-hover:flex items-center gap-0.5 bg-surface border border-border rounded-sm p-0.5 shadow-focus`}
          >
            <button
              type="button"
              onClick={onToggleEmoji}
              aria-label="React"
              className="inline-flex items-center justify-center w-7 h-7 text-muted hover:bg-paper rounded-sm"
            >
              <Smile size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onReply}
              aria-label="Reply"
              className="inline-flex items-center justify-center w-7 h-7 text-muted hover:bg-paper rounded-sm"
            >
              <Reply size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onPin}
              aria-label={isPinned ? 'Unpin' : 'Pin'}
              className="inline-flex items-center justify-center w-7 h-7 text-muted hover:bg-paper rounded-sm"
            >
              <Pin size={13} aria-hidden="true" />
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={onStartEdit}
                  aria-label="Edit"
                  className="inline-flex items-center justify-center w-7 h-7 text-muted hover:bg-paper rounded-sm"
                >
                  <Edit3 size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  aria-label="Delete"
                  className="inline-flex items-center justify-center w-7 h-7 text-danger hover:bg-paper rounded-sm"
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </div>
      }
    >
      <ChatInner />
    </Suspense>
  )
}
