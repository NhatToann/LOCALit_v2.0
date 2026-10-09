'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, MapPin, MessageCircle, Info, Phone, PhoneOff } from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { FocusSession, Profile, Conversation } from '@/lib/types'
import FocusMap from '@/components/focus/FocusMap'
import FocusItinerary from '@/components/focus/FocusItinerary'
import { Avatar } from '@/components/ui/Avatar'
import { useActiveCall } from '@/lib/realtime/useActiveCallStore'

type Tab = 'itinerary' | 'chat' | 'info'

export default function FocusSessionPage() {
  const router = useRouter()
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId

  const [me, setMe] = useState<Profile | null>(null)
  const [partner, setPartner] = useState<Profile | null>(null)
  const [session, setSession] = useState<FocusSession | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [itinerary, setItinerary] = useState<{ id: string; title: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('itinerary')
  const [elapsed, setElapsed] = useState<string>('00:00')
  const [ending, setEnding] = useState(false)
  const [hasActiveCall, setHasActiveCall] = useState<boolean>(false)

  const callClient = useActiveCall()

  // Load session
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const user = await getCurrentUser()
        if (!user) {
          router.replace('/login')
          return
        }
        const supabase = createClient()
        const { data: s, error: e } = await supabase
          .from('focus_sessions')
          .select('*')
          .eq('id', sessionId)
          .maybeSingle<FocusSession>()
        if (cancelled) return
        if (e || !s) {
          setError(e?.message ?? 'Session not found.')
          return
        }
        if (s.user_a_id !== user.id && s.user_b_id !== user.id) {
          setError('You are not a participant in this session.')
          return
        }
        setSession(s)
        const partnerId = s.user_a_id === user.id ? s.user_b_id : s.user_a_id

        const [{ data: meRow }, { data: pRow }, { data: conv }, { data: it }] =
          await Promise.all([
            supabase
              .from('safe_profiles')
              .select('id, full_name, avatar_url, role, is_online')
              .eq('id', user.id)
              .maybeSingle(),
            supabase
              .from('safe_profiles')
              .select('id, full_name, avatar_url, role, is_online')
              .eq('id', partnerId)
              .maybeSingle(),
            s.conversation_id
              ? supabase
                  .from('conversations')
                  .select('*')
                  .eq('id', s.conversation_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            s.itinerary_id
              ? supabase
                  .from('itineraries')
                  .select('id, title')
                  .eq('id', s.itinerary_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ])
        if (cancelled) return
        setMe(meRow as Profile | null)
        setPartner(pRow as Profile | null)
        setConversation(conv as Conversation | null)
        setItinerary((it as { id: string; title: string } | null) ?? null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sessionId, router])

  // Live elapsed timer
  useEffect(() => {
    if (!session) return
    const id = setInterval(() => {
      const ms = Date.now() - new Date(session.started_at).getTime()
      const totalSec = Math.floor(ms / 1000)
      const mm = Math.floor(totalSec / 60)
      const ss = totalSec % 60
      setElapsed(`${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [session])

  // Has a live voice call?
  useEffect(() => {
    setHasActiveCall(!!callClient)
  }, [callClient])

  const endFocus = useCallback(async () => {
    if (!session || ending) return
    if (!confirm('End this Focus session? It will be saved to your travel history.')) return
    setEnding(true)
    try {
      const res = await fetch(`/api/focus/${session.id}/end`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'cancelled' }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(`Could not end session: ${j.message ?? j.error ?? res.statusText}`)
        return
      }
      router.replace('/chat')
    } finally {
      setEnding(false)
    }
  }, [session, ending, router])

  async function startCall() {
    if (!conversation || !partner || !me) {
      setError('No conversation is linked to this Focus session.')
      return
    }
    setError(null)
    try {
      // Lazy import to avoid SSR
      const { startLiveKitCall } = await import('@/lib/webrtc/livekit-client')
      const localStream: MediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const client = await startLiveKitCall({
        myId: me.id,
        roomName: `call:${conversation.id}`,
        participantName: me.full_name,
        video: false,
        onState: () => undefined,
        onRemoteStream: () => undefined,
        onLocalStream: () => undefined,
      })
      // Publish the mic track we just acquired.
      await client.publishMic()
      setHasActiveCall(true)
      // Tidy: stop our temp stream tracks; LiveKit now owns them.
      localStream.getTracks().forEach((t) => t.stop())
    } catch (err) {
      setError(`Call failed: ${(err as Error).message}`)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-focus-bg flex items-center justify-center">
        <p className="text-sm text-focus-muted">Loading Focus session…</p>
      </main>
    )
  }
  if (error || !session) {
    return (
      <main className="min-h-screen bg-focus-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-base font-semibold text-focus-text mb-2">
            Can't open this Focus session
          </p>
          <p className="text-sm text-focus-muted mb-4">
            {error ?? 'Unknown error.'}
          </p>
          <Link
            href="/chat"
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark"
          >
            Back to chat
          </Link>
        </div>
      </main>
    )
  }

  const partnerName = partner?.full_name ?? 'Buddy'

  return (
    <main className="min-h-screen bg-focus-bg">
      {/* Header — solid color, no gradient */}
      <header className="bg-focus-primary text-white">
        <div className="container-page py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/chat"
              aria-label="Back to chat"
              className="text-white hover:text-focus-primary-light"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </Link>
            <Avatar
              name={partnerName}
              src={partner?.avatar_url ?? null}
              size="sm"
            />
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">Focus with {partnerName}</h1>
              <p className="text-xs text-focus-primary-light tabular-nums">
                {elapsed} · Da Nang
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {conversation ? (
              <button
                type="button"
                onClick={() => void startCall()}
                disabled={hasActiveCall}
                title={hasActiveCall ? 'Call in progress' : 'Call buddy'}
                className="h-9 w-9 inline-flex items-center justify-center rounded-sm bg-white text-focus-primary border border-white hover:bg-focus-primary-light hover:text-white disabled:opacity-50"
                aria-label={hasActiveCall ? 'Call in progress' : 'Call buddy'}
              >
                {hasActiveCall ? <PhoneOff size={16} aria-hidden="true" /> : <Phone size={16} aria-hidden="true" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void endFocus()}
              disabled={ending}
              className="h-9 px-3 text-sm font-medium rounded-sm bg-white text-focus-primary border border-white hover:bg-focus-primary-light hover:text-white disabled:opacity-50"
            >
              {ending ? 'Ending…' : 'End Focus'}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="container-page py-2">
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        </div>
      ) : null}

      {/* Live Map */}
      <section className="bg-focus-surface border-y border-focus-border">
        <FocusMap
          userAId={me?.id ?? ''}
          userBId={partner?.id ?? ''}
          userA={me}
          userB={partner}
        />
      </section>

      {/* Tabs */}
      <nav className="bg-focus-surface border-b border-focus-border" aria-label="Focus sections">
        <div className="container-page flex gap-2 overflow-x-auto">
          {([
            { id: 'itinerary', label: 'Itinerary', icon: MapPin },
            { id: 'chat', label: 'Chat', icon: MessageCircle },
            { id: 'info', label: 'Info', icon: Info },
          ] as { id: Tab; label: string; icon: typeof MapPin }[]).map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                aria-selected={active}
                role="tab"
                className={`h-12 px-4 text-sm font-medium border-b-2 inline-flex items-center gap-1 ${
                  active
                    ? 'border-focus-primary text-focus-primary'
                    : 'border-transparent text-focus-muted hover:text-focus-text'
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Tab content */}
      <div className="container-page py-6">
        {tab === 'itinerary' ? (
          <FocusItinerary
            sessionId={session.id}
            userId={me?.id ?? ''}
            initialItineraryId={session.itinerary_id}
            onItineraryUpdated={(id) => {
              setSession((prev) => (prev ? { ...prev, itinerary_id: id } : prev))
            }}
          />
        ) : null}

        {tab === 'chat' ? (
          <div className="bg-focus-surface border border-focus-border rounded-sm p-5">
            {conversation ? (
              <Link
                href={`/chat?conv=${conversation.id}`}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark"
              >
                <MessageCircle size={14} aria-hidden="true" /> Open chat
              </Link>
            ) : (
              <p className="text-sm text-focus-muted">
                No conversation is linked to this Focus session.
              </p>
            )}
            {itinerary ? (
              <p className="text-xs text-focus-muted mt-3">
                Itinerary: {itinerary.title}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === 'info' ? (
          <div className="bg-focus-surface border border-focus-border rounded-sm p-5">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-focus-muted">Started at</dt>
                <dd className="text-focus-text">
                  {new Date(session.started_at).toLocaleString('en-US')}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-focus-muted">Duration</dt>
                <dd className="text-focus-text tabular-nums">{elapsed}</dd>
              </div>
              <div>
                <dt className="text-xs text-focus-muted">Partner</dt>
                <dd className="text-focus-text">{partnerName}</dd>
              </div>
              <div>
                <dt className="text-xs text-focus-muted">Itinerary</dt>
                <dd className="text-focus-text">
                  {itinerary ? (
                    <Link
                      href={`/itinerary/${itinerary.id}`}
                      className="text-focus-primary hover:text-focus-primary-dark"
                    >
                      {itinerary.title}
                    </Link>
                  ) : (
                    <span className="text-focus-muted">None attached</span>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}
      </div>
    </main>
  )
}
