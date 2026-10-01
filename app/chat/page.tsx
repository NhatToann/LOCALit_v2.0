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
  Smile,
  X,
  Edit3,
  Trash2,
  Reply,
  Star,
  MapPin,
  Map as MapIcon,
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
import type { Message, Conversation, MessageReaction, Profile } from '@/lib/types'
import { Avatar, EmptyState } from '@/components/ui/Avatar'
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
  const callParam = searchParams.get('call')
  const convParam = searchParams.get('c')
  const qParam = searchParams.get('q')

  const [myId, setMyId] = useState<string | null>(null)
  const [myName, setMyName] = useState<string>('')
  const [myRole, setMyRole] = useState<'tourist' | 'buddy' | null>(null)
  const [conversations, setConversations] = useState<ConvSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [initialMessages, setInitialMessages] = useState<Message[]>([])
  const [initialReactions, setInitialReactions] = useState<MessageReaction[]>([])
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
  /** Hidden <audio> element ref. Receives the remote MediaStream from the
   *  WebRTC peer via srcObject so the browser plays the peer's audio.
   *  Without this, the connection reaches 'connected' state but no audio
   *  plays — see fix 2026-09-28 (Bug 1: "connected but no audio"). */
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
  const lastSentRef = useRef<number>(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
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
    if (buddyParam && myId) openConversationWithBuddy(buddyParam)
  }, [buddyParam, myId])

  useEffect(() => {
    if (convParam && myId) {
      const exists = conversations.some((c) => c.id === convParam)
      if (exists) setActiveId(convParam)
      router.replace('/chat')
    }
  }, [convParam, myId, conversations.length])

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
      const id = setTimeout(() => {
        if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
        if (callClient) {
          unregisterCallClient(
            activeCallStore.getState().active?.callId ?? '',
          )
        }
        setCallClient(null)
        setCallPartner(null)
        setCallStartedAt(null)
        setCallState('idle')
      }, 1500)
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
    const supabase = createClient()
    const { data } = await supabase
      .from('conversations')
      .select(
        `
        id, tourist_id, buddy_id, updated_at,
        last_message_preview, last_message_at,
        last_read_at_by_tourist, last_read_at_by_buddy,
        pinned_message_id, typing_user_id,
        tourist:tourists(profile:safe_profiles(full_name, avatar_url, is_online, id)),
        buddy:buddies(location_city, hourly_rate, rating_avg, languages,
                      profile:safe_profiles(full_name, avatar_url, is_online, id))
      `,
      )
      .or(`tourist_id.eq.${uid},buddy_id.eq.${uid}`)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (!data || data.length === 0) {
      setConversations([])
      return
    }

    // Fetch unread counts in a single follow-up query (avoid the FK embed collision)
    const convIds = (data as any[]).map((c) => c.id)
    const { data: msgs } = await supabase
      .from('messages')
      .select('conversation_id, sender_id, is_read, created_at')
      .in('conversation_id', convIds)
      .eq('is_read', false)

    const unreadByConv: Record<string, number> = {}
    for (const m of msgs ?? []) {
      if (m.sender_id === uid) continue
      unreadByConv[m.conversation_id] = (unreadByConv[m.conversation_id] ?? 0) + 1
    }

    const mapped: ConvSummary[] = (data as any[]).map((c) => {
      const isTouristSide = c.tourist_id === uid
      const partner = isTouristSide ? c.buddy : c.tourist
      const partnerProfile = partner?.profile
      const partnerName = partnerProfile?.full_name ?? 'Buddy'
      return {
        id: c.id,
        partner_id: partnerProfile?.id ?? '',
        partner_name: partnerName,
        partner_avatar: partnerProfile?.avatar_url ?? null,
        // Side-aware role: the partner is always the OPPOSITE role
        // to the current user (the marketplace enforces tourist ↔
        // buddy pairing). We expose it so the sidebar can render a
        // small role tag — see "Role differentiation" in design.md.
        partner_role: isTouristSide ? 'buddy' : 'tourist',
        partner_city: partner?.location_city ?? null,
        partner_languages: partner?.languages ?? [],
        partner_hourly_rate: partner?.hourly_rate ?? null,
        partner_rating_avg: partner?.rating_avg ?? null,
        is_partner_online: !!partnerProfile?.is_online,
        last_message_preview: c.last_message_preview ?? '',
        last_message_at: c.last_message_at ?? c.updated_at,
        unread: unreadByConv[c.id] ?? 0,
        pinned_message_id: c.pinned_message_id ?? null,
        typing_user_id: c.typing_user_id === uid ? null : c.typing_user_id,
      }
    })
    setConversations(mapped)
    if (mapped.length > 0 && !activeId) setActiveId(mapped[0].id)
  }

  async function openConversationWithBuddy(otherBuddyId: string) {
    if (!myId) return
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .or(
        `and(tourist_id.eq.${myId},buddy_id.eq.${otherBuddyId}),and(tourist_id.eq.${otherBuddyId},buddy_id.eq.${myId})`,
      )
      .maybeSingle()

    let convId = existing?.id
    if (!convId) {
      const { data: created, error } = await supabase
        .from('conversations')
        .insert({ tourist_id: myId, buddy_id: otherBuddyId })
        .select('id')
        .single()
      if (error) {
        setError('Could not open conversation: ' + error.message)
        return
      }
      convId = created.id
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

  async function handleAttach(type: 'image' | 'file' | 'location') {
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

    // image or file picker
    const input = type === 'image' ? imageInputRef.current : fileInputRef.current
    if (!input) return
    input.value = ''
    input.click()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, kind: 'image' | 'file') {
    const file = e.target.files?.[0]
    if (!file || !activeId || !myId) return
    setUploading(true)
    setError('')
    try {
      const url = await uploadChatAttachment(createClient(), file)
      const supabase2 = createClient()
      const previewText =
        kind === 'image' ? '📷 Photo' : `📎 ${file.name}`
      await supabase2.from('messages').insert({
        conversation_id: activeId,
        sender_id: myId,
        content: previewText,
        message_type: kind,
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
    // Mic/camera permission is deferred: we let LiveKit's `publishMic()`
    // (called below) trigger the native getUserMedia prompt. This matches
    // the Messenger/Meet flow where the prompt appears AFTER the user has
    // already clicked the Phone button and the CallModal is visible — so
    // they have full UX context for why the browser is asking. No double
    // getUserMedia call (the legacy `ensureMediaPermissions` block used
    // to fire one here, which the LiveKit client would then fire again
    // inside publishMic — browsers reuse the cached permission grant
    // but it still wasted ~50ms per call).
    let pendingCallId = ''
    try {
      // Insert a pending_calls row so the buddy's IncomingCallWatcher
      // sees a ringing notification. LiveKit handles the actual
      // transport; pending_calls is just the durable "someone is
      // calling you" signal. The `type` column (added 2026-10-01)
      // lets the callee's UI pick the right modal: CallModal for
      // voice, VideoCallModal for video. The `room_name` column is
      // NOT NULL and must match the LiveKit room convention
      // `call:<conversationId>` — the buddy's accept path uses it
      // to look up the LiveKit room to join.
      try {
        const supabase = createClient()
        const { data: row } = await supabase
          .from('pending_calls')
          .insert({
            conversation_id: activeConv.id,
            caller_id: myId,
            callee_id: activeConv.partner_id,
            status: 'ringing',
            type: mode,
            room_name: `call:${activeConv.id}`,
          })
          .select('id')
          .single()
        if (row?.id) pendingCallId = row.id
      } catch (insertErr) {
        if (DEBUG_CALL) {
          console.log('[dlog] pending_calls insert failed', insertErr)
        }
      }
      const roomName = `call:${activeConv.id}`
      const client = await startLiveKitCall({
        myId,
        roomName,
        participantName: myName,
        video: mode === 'video',
        onState: (s) => {
          setCallState(s)
          activeCallStore.patchActive({ state: s })
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
        setTimeout(() => setCallState('idle'), 3000)
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
        activeCallStore.setActive(null)
        return
      }
      if (!pendingCallId) pendingCallId = client.callId
      setCallClient(client)
      registerActiveCallClient(pendingCallId, client)
      activeCallStore.setActive({
        callId: pendingCallId,
        conversationId: activeConv.id,
        partnerId: activeConv.partner_id,
        partnerName: activeConv.partner_name,
        partnerAvatar: activeConv.partner_avatar,
        isOutgoing: true,
        mode, // 'voice' or 'video' — ActiveCallSheet picks the modal
        state: 'calling',
        networkStatus: 'online',
        quality: null,
        errorMessage: null,
        startedAt: Date.now(),
      })
    } catch (e) {
      setError('Could not start call: ' + (e as Error).message)
      setCallState('failed')
      setTimeout(() => setCallState('idle'), 2500)
      activeCallStore.setActive(null)
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
    let incomingMode: CallMode = 'voice' as CallMode
    // setCallMode below accepts the local incomingMode — but at this
    // point we haven't queried the DB yet, so we set the placeholder
    // ('voice'). After the row query sets incomingMode to the real
    // value (line 898), all subsequent code uses that.
    setCallMode(incomingMode)
    setIsOutgoing(false)
    setError('')
    // Pre-emptively surface "Incoming call / Ringing…" so the
    // CallModal renders with a meaningful state the instant the
    // /chat?call=X navigation lands. Before this the modal was
    // either blank (idle) or skipped straight to "Connecting…"
    // because the caller raced us by ~1 frame. LiveKit's
    // ConnectionStateChanged handler will flip us to 'connecting'
    // → 'connected' as the WebRTC session comes up.
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
      // Mutate the outer let, not declare a new const — otherwise
      // the later `activeCallStore.setActive({ mode: incomingMode })`
      // uses the outer (placeholder) value, which would always be
      // 'voice'.
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
      setTimeout(() => setCallState('idle'), 2500)
      return
    }
    // Make sure the chat view shows the conversation the call belongs
    // to. Without this the modal would render but the chat list could
    // highlight a different thread.
    if (activeId !== conversationId) setActiveId(conversationId)

    // Mic/camera permission is deferred: we let LiveKit's
    // `publishMic()` trigger the native getUserMedia prompt. By the
    // time we reach publishMic the CallModal is already mounted
    // with the "Incoming call / Ringing…" headline — so they have full
    // UX context for why the browser is asking (matches the
    // Messenger/Zalo/Meet flow).

    try {
      const roomName = `call:${conversationId}`
      const client = await startLiveKitCall({
        myId,
        roomName,
        participantName: myName,
        video: incomingMode === 'video',
        onState: (s) => {
          setCallState(s)
          activeCallStore.patchActive({ state: s })
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
        setTimeout(() => setCallState('idle'), 3000)
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
        activeCallStore.setActive(null)
        return
      }
      setCallClient(client)
      registerActiveCallClient(pendingCallId, client)
      // Start the global sheet at 'ringing' so the UI stays
      // consistent with the chat-page-owned state until LiveKit
      // fires its first ConnectionStateChanged (which flips it to
      // 'connecting' then 'connected').
      activeCallStore.setActive({
        callId: pendingCallId,
        conversationId,
        partnerId: peerId,
        partnerName,
        partnerAvatar,
        isOutgoing: false,
        mode: incomingMode,
        state: 'ringing',
        networkStatus: 'online',
        quality: null,
        errorMessage: null,
        startedAt: Date.now(),
      })
    } catch (e) {
      setError('Could not accept call: ' + (e as Error).message)
      setCallState('failed')
      setTimeout(() => setCallState('idle'), 3500)
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
          <h1 className="text-page-title">Messages</h1>
          <p className="text-xs text-muted mt-1">
            Conversations with your Da Nang buddies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/map"
            className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <MapIcon size={14} aria-hidden="true" />
            View map
          </Link>
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
                          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-paper text-[10px] font-semibold">
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
              </header>

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

            {activeConv.partner_languages?.length > 0 ? (
              <div className="border-t border-border pt-3">
                <p className="text-eyebrow text-muted mb-2">Languages</p>
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
              </div>
            ) : null}

            {activeConv.partner_hourly_rate ? (
              <div className="border-t border-border pt-3">
                <p className="text-eyebrow text-muted mb-2">Rate</p>
                <p className="text-sm font-semibold inline-flex items-center gap-1">
                  <DollarSign size={12} aria-hidden="true" />$
                  {Number(activeConv.partner_hourly_rate).toFixed(0)}
                  <span className="text-xs font-normal text-muted">/hour</span>
                </p>
              </div>
            ) : null}

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
                  href={
                    myRole === 'buddy'
                      ? '/trips'
                      : '/trips/create'
                  }
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
