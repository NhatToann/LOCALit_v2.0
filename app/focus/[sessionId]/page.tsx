'use client'

/**
 * /focus/[sessionId] — Focus Mode session page.
 *
 * 2026-10-10 update. Per user request:
 *   - The always-on mic and the in-page Call button are removed.
 *     Focus is now a *silent* shared-trip mode: the two participants
 *     see each other on the map, can chat, and (when one of them
 *     ends) the other side auto-redirects back to /chat. Voice
 *     calls live entirely in /chat.
 *   - When the partner ends the session, the local user is
 *     auto-redirected to /chat. This is implemented as a
 *     `postgres_changes` subscription on `focus_sessions` filtered
 *     to rows where the user is `user_a_id` OR `user_b_id`
 *     (`useFocusSessionSubscription`).
 *
 * Layout (top → bottom):
 *   - Header with partner avatar, elapsed timer, location toggle /
 *     info / end controls. No back button — the only exit is End
 *     Focus or close the browser.
 *   - Live map (Leaflet, copy of dashboard's MapView) showing both
 *     users plus the Da Nang context.
 *   - Embedded chat with bubble UI (uses the same `messages` table as
 *     /chat so the two surfaces see the same data).
 *
 * On mount the location toggle is on by default. The location icon
 * toggles sharing. The End button is the only way out; the
 * beforeunload guard is short-circuited when `ending` is true so
 * the post-redirect navigation can complete.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin,
  MapPinOff,
  Info,
} from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { FocusSession, Profile, Conversation } from '@/lib/types'
import { useFocusLocation } from '@/hooks/useFocusLocation'
import { useFocusSessionSubscription } from '@/hooks/useFocusSessionSubscription'
import FocusMapLeaflet from '@/components/focus/FocusMapLeaflet'
import FocusChat from '@/components/focus/FocusChat'
import { Avatar } from '@/components/ui/Avatar'

export default function FocusSessionPage() {
  const router = useRouter()
  const params = useParams<{ sessionId: string }>()
  const sessionId = params?.sessionId

  const [me, setMe] = useState<Profile | null>(null)
  const [partner, setPartner] = useState<Profile | null>(null)
  const [session, setSession] = useState<FocusSession | null>(null)
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState<string>('00:00')
  const [ending, setEnding] = useState(false)
  const [showInfo, setShowInfo] = useState(false)
  // Location share is on by default. The header toggle flips this;
  // both the location hook and the map read the same value so the
  // UI doesn't drift.
  const [locationEnabled, setLocationEnabled] = useState(true)

  // Load session + partner + me.
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

        const [{ data: meRow }, { data: pRow }, { data: conv }] =
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
          ])
        if (cancelled) return
        setMe(meRow as Profile | null)
        setPartner(pRow as Profile | null)
        setConversation(conv as Conversation | null)
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

  // Location-only hook (audio was removed per user request 2026-10-10).
  // The hook owns the single Realtime subscription; the map reads the
  // same data via the liveLocation / liveLocations props below.
  const { locationShared, locationDenied, liveLocations } = useFocusLocation({
    enabled: session !== null && me !== null,
    selfUserId: me?.id ?? null,
    shareLocation: locationEnabled,
  })
  const liveLocation = useMemo(
    () => ({ selfGranted: locationShared, selfDenied: locationDenied }),
    [locationShared, locationDenied],
  )

  // Partner-ended auto-redirect. When the partner's UPDATE sets
  // `ended_at` on this row, we hard-navigate to /chat. This is
  // what makes "end on one side, the other side ends too" feel
  // synchronous without polling.
  const { partnerEndedAt } = useFocusSessionSubscription(
    session?.id ?? null,
    me?.id ?? null,
  )
  useEffect(() => {
    if (!partnerEndedAt) return
    // Hard navigation. The beforeunload guard would block a soft
    // router.push; setting `ending=true` first is the documented
    // way to short-circuit it (see the onBeforeUnload handler
    // below).
    setEnding(true)
    window.location.assign('/chat')
  }, [partnerEndedAt])

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
      // Back to chat is the only legal exit. Use window.location
      // for a hard navigation — router.push from a [param] route
      // to a flat route in the App Router can silently fail to
      // update the URL when a beforeunload guard is also mounted.
      window.location.assign('/chat')
      // Intentionally do NOT setEnding(false). Keeping `ending=true`
      // through the unmount means the beforeunload guard sees
      // `if (ending) return` and lets the navigation through
      // without prompting the user with a second "leave site?"
      // confirm.
    } catch (err) {
      setError((err as Error)?.message ?? 'Could not end session.')
      setEnding(false)
    }
  }, [session, ending])

  // Defensive: prevent accidental navigation away. The user
  // explicitly asked for "you can't exit except by ending the
  // session or closing the browser" — we add a beforeunload
  // confirm so a stray tab-close doesn't lose the session. Esc
  // still works because the user can decide to close the tab —
  // they own that choice.
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (ending) return
      e.preventDefault()
      // Modern browsers ignore the return value and show their own
      // generic message; setting returnValue is the standardized
      // way to opt in.
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [ending])

  const partnerName = partner?.full_name ?? 'Buddy'
  const myName = me?.full_name ?? 'You'

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

  return (
    <main className="min-h-screen bg-focus-bg flex flex-col">
      {/* Header — solid color, no gradient, no back button */}
      <header className="bg-focus-primary text-white flex-shrink-0">
        <div className="container-page py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar
              name={partnerName}
              src={partner?.avatar_url ?? null}
              size="sm"
            />
            <div className="min-w-0">
              <h1 className="text-base font-semibold truncate">
                Focus with {partnerName}
              </h1>
              <p className="text-xs text-focus-primary-light tabular-nums">
                {elapsed} · {partnerEndedAt ? 'Partner ended' : 'Da Nang'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Location share toggle. */}
            <button
              type="button"
              onClick={() => setLocationEnabled((v) => !v)}
              aria-pressed={!locationEnabled}
              aria-label={
                locationEnabled ? 'Pause live location sharing' : 'Resume live location sharing'
              }
              title={
                locationEnabled
                  ? locationDenied
                    ? 'Location permission was denied'
                    : 'Pause live location sharing'
                  : 'Resume live location sharing'
              }
              className={`h-9 w-9 inline-flex items-center justify-center rounded-sm border ${
                locationEnabled && !locationDenied
                  ? 'bg-white text-focus-primary border-white hover:bg-focus-primary-light hover:text-white'
                  : 'bg-transparent text-white border-white hover:bg-focus-primary-light'
              }`}
            >
              {locationEnabled && !locationDenied ? (
                <MapPin size={16} aria-hidden="true" />
              ) : (
                <MapPinOff size={16} aria-hidden="true" />
              )}
            </button>
            {/* Info / session details. */}
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              aria-pressed={showInfo}
              aria-label="Show session info"
              title="Session info"
              className={`h-9 w-9 inline-flex items-center justify-center rounded-sm border ${
                showInfo
                  ? 'bg-focus-primary-light text-white border-focus-primary-light'
                  : 'bg-transparent text-white border-white hover:bg-focus-primary-light'
              }`}
            >
              <Info size={16} aria-hidden="true" />
            </button>
            {/* End session. */}
            <button
              type="button"
              onClick={() => void endFocus()}
              disabled={ending}
              className="h-9 px-3 text-sm font-medium rounded-sm bg-white text-focus-primary border border-white hover:bg-focus-primary-light hover:text-white disabled:opacity-50 inline-flex items-center gap-1"
            >
              {ending ? 'Ending…' : 'End Focus'}
            </button>
          </div>
        </div>
        {error ? (
          <div className="container-page py-2">
            <p className="text-xs text-focus-primary-light" role="alert">
              {error}
            </p>
          </div>
        ) : null}
      </header>

      {/* Body: map (top) + chat (bottom). The flex-col + flex-1 on the
          chat container means the map takes its declared height and
          the chat fills the rest of the viewport. */}
      <div className="flex-1 flex flex-col min-h-0">
        <FocusMapLeaflet
          me={me}
          partner={partner}
          shareLocation={locationEnabled}
          liveLocation={liveLocation}
          liveLocations={liveLocations}
          height={360}
        />
        {showInfo ? (
          <div className="bg-focus-surface border-t border-focus-border px-4 py-3 text-sm text-focus-text">
            <p className="text-xs text-focus-muted">Session details</p>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-focus-muted">You</dt>
                <dd>{myName}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-focus-muted">Partner</dt>
                <dd>{partnerName}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-focus-muted">Started</dt>
                <dd>{new Date(session.started_at).toLocaleString('en-US')}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-focus-muted">Duration</dt>
                <dd className="tabular-nums">{elapsed}</dd>
              </div>
            </dl>
          </div>
        ) : null}
        <div className="flex-1 min-h-0">
          {conversation ? (
            <FocusChat
              conversationId={conversation.id}
              myId={me?.id ?? ''}
              partnerName={partnerName}
            />
          ) : (
            <div className="bg-focus-surface border-t border-focus-border px-4 py-6 text-sm text-focus-muted text-center">
              <Info size={16} className="inline mr-2 align-middle" aria-hidden="true" />
              No conversation is linked to this Focus session.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
