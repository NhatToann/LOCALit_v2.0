'use client'

import { useEffect, useRef, useState, Suspense, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  MessageCircle,
  Send,
  Search,
  Phone,
  PhoneOff,
  Paperclip,
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
import type { Message, Conversation, MessageReaction, Profile } from '@/lib/types'
import { Avatar, EmptyState } from '@/components/ui/Avatar'
import { useMessageStream } from '@/lib/realtime/useMessageStream'
import { useTyping } from '@/lib/realtime/useTyping'
import { usePresence } from '@/lib/realtime/usePresence'
import { uploadChatAttachment } from '@/lib/attachments/upload'
import {
  startOutgoingCall,
  acceptIncomingCall,
  type CallClient,
  type CallMode,
  type CallState,
} from '@/lib/webrtc/call-client'
import CallModal from '@/components/chat/CallModal'

const REACTION_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🙏']
const MAX_MESSAGE_LEN = 1000
const EDIT_WINDOW_MS = 15 * 60 * 1000

interface ConvSummary {
  id: string
  partner_id: string
  partner_name: string
  partner_avatar: string | null
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
  const [callClient, setCallClient] = useState<CallClient | null>(null)
  const [callMode, setCallMode] = useState<CallMode>('voice')
  const [callState, setCallState] = useState<CallState>('idle')
  /** True if we are the caller. False if we are the callee who accepted
   *  an incoming call. Controls which CallModal buttons are shown. */
  const [isOutgoing, setIsOutgoing] = useState(true)
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
  const isPartnerOnline = presenceUsers.some((u) => u.user_id !== myId)

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

  async function startCall(mode: CallMode) {
    if (!activeConv || !myId) {
      setError('Open a conversation first.')
      return
    }
    // Presence gate: don't try to call a buddy who isn't connected
    // to Supabase Realtime — the call would fail with
    // FROM_NUMBER_NOT_FOUND because their StringeeClient isn't
    // registered with the project (see AGENTS.md).
    if (!isPartnerOnline) {
      setError('Cannot call: buddy is offline.')
      return
    }
    if (callClient) return
    setCallMode(mode)
    setCallState('calling')
    setIsOutgoing(true)
    setError('')
    try {
      const { client } = await startOutgoingCall({
        conversationId: activeConv.id,
        myId,
        peerId: activeConv.partner_id,
        myName,
        peerName: activeConv.partner_name,
        mode,
        onState: (s) => setCallState(s),
        onError: (e) => setError(e.message),
        onLocalStream: () => undefined,
        onRemoteStream: attachRemoteAudio,
      })
      setCallClient(client)
    } catch (e) {
      setError('Could not start call: ' + (e as Error).message)
      setCallState('failed')
      setTimeout(() => setCallState('idle'), 2500)
    }
  }

  /**
   * Accept an incoming call. Triggered by:
   *   - /chat?call=<pendingCallId> deep-link from IncomingCallWatcher
   *   - In-page Accept button (future)
   */
  async function acceptCall(pendingCallId: string) {
    if (!activeConv || !myId || callClient) return
    setCallMode('voice')
    setIsOutgoing(false)
    setError('')
    try {
      const { client } = await acceptIncomingCall({
        conversationId: activeConv.id,
        myId,
        peerId: activeConv.partner_id,
        myName,
        peerName: activeConv.partner_name,
        mode: 'voice',
        pendingCallId,
        callerUserId: activeConv.partner_id,
        onState: (s) => setCallState(s),
        onError: (e) => setError(e.message),
        onLocalStream: () => undefined,
        onRemoteStream: attachRemoteAudio,
      })
      setCallClient(client)
    } catch (e) {
      setError('Could not accept call: ' + (e as Error).message)
      setCallState('failed')
      setTimeout(() => setCallState('idle'), 2500)
    }
  }

  function endCall() {
    // Detach the remote stream so the audio element stops playing once
    // the call ends and the next call starts clean.
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null
    }
    callClient?.end()
    setCallClient(null)
    setTimeout(() => setCallState('idle'), 1000)
  }

  // When navigating in via ?call=<pendingCallId>, the pending_calls row
  // tells us which conversation this call belongs to. Look it up, set
  // activeId accordingly, then call acceptIncomingCall once the
  // conversation is loaded.
  useEffect(() => {
    if (!callParam || !myId || callClient) return
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
      // Switch to the matching conversation if needed.
      if (activeId !== row.conversation_id) {
        setActiveId(row.conversation_id)
        return // The activeId-change effect below will pick up and accept.
      }
      void acceptCall(callParam)
      router.replace('/chat')
    })()
    return () => {
      cancelled = true
    }
  }, [callParam, myId, callClient, activeId])

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
            description={
              myRole === 'buddy'
                ? 'When a tourist accepts your connection request, the conversation will appear here.'
                : 'Connect with a buddy to start chatting. Browse the buddy list to send your first request.'
            }
            action={
              myRole === 'buddy' ? null : (
                <Link
                  href="/tourist/browse"
                  className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                >
                  Browse Da Nang buddies
                </Link>
              )
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div className="container-page py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-page-title">Messages</h1>
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
                        <p className="text-sm font-medium truncate">
                          {c.partner_name}
                        </p>
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
                  aria-label={isPartnerOnline ? 'Start voice call' : 'Call unavailable — buddy offline'}
                  aria-disabled={!isPartnerOnline}
                  title={isPartnerOnline ? undefined : 'Buddy is offline'}
                  className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  {isPartnerOnline ? (
                    <Phone size={15} aria-hidden="true" />
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
                href={
                  myRole === 'buddy'
                    ? '/buddy/profile'
                    : `/tourist/buddy/${activeConv.partner_id}`
                }
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
                      ? '/buddy/requests'
                      : `/tourist/buddy/${activeConv.partner_id}`
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

      {activeConv && callState !== 'idle' ? (
        <CallModal
          client={callClient}
          mode={callMode}
          partnerName={activeConv.partner_name}
          partnerAvatar={activeConv.partner_avatar}
          isOutgoing={isOutgoing}
          state={callState}
          audioRef={remoteAudioRef}
          onEnd={endCall}
        />
      ) : null}

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
