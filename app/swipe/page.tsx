'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, X, MapPin, Star, Sparkles, MessageCircle, ChevronLeft } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { SPECIALTIES, SPECIALTY_LABELS, type Specialty } from '@/lib/specialties'

/**
 * /swipe — Tourist picks interests, then sees a deck of buddy cards
 * sorted by interest overlap (most shared first, falling back to 1+
 * overlap, then any available buddy). Right = Like, Left = Pass. Both
 * are draggable; the drag distance threshold determines the swipe.
 *
 * Auth: this page is hidden from guests. The middleware redirects
 * unauthenticated visitors to /login?redirectTo=/swipe, and the
 * client also re-checks on mount.
 */
interface BuddyCard {
  id: string
  full_name: string
  avatar_url: string | null
  is_online: boolean
  location_city: string
  languages: string[]
  specialties: string[]
  hourly_rate: number | null
  rating_avg: number | null
  bio: string | null
  latitude: number
  longitude: number
  overlap_count: number
}

const STORAGE_KEY = 'localit:swipeInterests'

export default function SwipePage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [step, setStep] = useState<'interests' | 'deck'>('interests')
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [profileInterests, setProfileInterests] = useState<string[]>([])
  const [queue, setQueue] = useState<BuddyCard[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [matchModal, setMatchModal] = useState<{ partnerId: string; partnerName: string } | null>(null)
  const [stats, setStats] = useState({ likes: 0, passes: 0 })
  const indexRef = useRef(0)

  // Auth + load profile interests
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.replace('/login?redirectTo=/swipe')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (profile?.role && profile.role !== 'tourist') {
        // Buddies don't have a deck — redirect them to their like-back feed
        router.replace('/likes')
        return
      }
      // Hydrate the interests chip from localStorage if present,
      // otherwise pre-select the tourist's profile interests.
      let stored: string[] = []
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw) stored = JSON.parse(raw).filter((x: unknown) => typeof x === 'string')
      } catch { /* ignore */ }

      const { data: tourist } = await supabase
        .from('tourists')
        .select('interests')
        .eq('id', user.id)
        .maybeSingle()
      const profileSet = Array.isArray(tourist?.interests) ? (tourist!.interests as string[]) : []
      if (cancelled) return
      setProfileInterests(profileSet)
      if (stored.length > 0) {
        setSelectedInterests(stored)
        setStep('deck')
      } else if (profileSet.length > 0) {
        setSelectedInterests(profileSet)
      }
      setAuthChecked(true)
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [router])

  // Realtime: refresh queue when a new match is created for this user
  useEffect(() => {
    if (!authChecked) return
    const supabase = createClient()
    const channel = supabase
      .channel('swipe-matches')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          // We don't know the user id at this scope, so just nudge the
          // page to refetch matches. The queue itself only changes on
          // OUR swipes (handled by local state).
          const row = payload.new as { tourist_id: string; buddy_id: string }
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return
            if (user.id !== row.tourist_id && user.id !== row.buddy_id) return
            // Ask the matches endpoint to surface the new match
            void fetch('/api/swipe/matches', { cache: 'no-store' })
          })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [authChecked])

  const fetchQueue = useCallback(async (interests: string[]) => {
    setLoadingQueue(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (interests.length > 0) params.set('interests', interests.join(','))
      const res = await fetch(`/api/swipe/queue?${params.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not load buddies')
      setQueue(data.buddies ?? [])
      indexRef.current = 0
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoadingQueue(false)
    }
  }, [])

  const startDeck = useCallback(async () => {
    if (selectedInterests.length === 0) {
      setError('Pick at least one interest to see matching buddies.')
      return
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedInterests))
    } catch { /* ignore */ }
    setStep('deck')
    await fetchQueue(selectedInterests)
  }, [selectedInterests, fetchQueue])

  const submitSwipe = useCallback(
    async (target: BuddyCard, direction: 'like' | 'pass') => {
      try {
        const res = await fetch('/api/swipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: target.id, direction }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data?.error ?? 'Swipe failed')
          return
        }
        if (direction === 'like') {
          setStats((s) => ({ ...s, likes: s.likes + 1 }))
          if (data.matched) {
            // Match: pull the partner's name from the queue item
            setMatchModal({ partnerId: target.id, partnerName: target.full_name })
          }
        } else {
          setStats((s) => ({ ...s, passes: s.passes + 1 }))
        }
        // Advance the deck
        setQueue((q) => q.slice(1))
      } catch (e) {
        setError((e as Error).message)
      }
    },
    [],
  )

  // Keyboard shortcuts: ← = pass, → = like (only on deck step)
  useEffect(() => {
    if (step !== 'deck') return
    function onKey(e: KeyboardEvent) {
      if (queue.length === 0) return
      const top = queue[0]
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        void submitSwipe(top, 'pass')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        void submitSwipe(top, 'like')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, queue, submitSwipe])

  if (!authChecked) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      {step === 'interests' ? (
        <InterestsStep
          options={SPECIALTIES}
          labels={SPECIALTY_LABELS}
          profileDefaults={profileInterests}
          selected={selectedInterests}
          onChange={setSelectedInterests}
          onContinue={startDeck}
          error={error}
        />
      ) : (
        <DeckStep
          queue={queue}
          loading={loadingQueue}
          error={error}
          onPass={(b) => submitSwipe(b, 'pass')}
          onLike={(b) => submitSwipe(b, 'like')}
          onEditInterests={() => setStep('interests')}
          stats={stats}
          interests={selectedInterests}
        />
      )}

      {matchModal ? (
        <MatchModal
          partnerName={matchModal.partnerName}
          partnerId={matchModal.partnerId}
          onClose={() => setMatchModal(null)}
        />
      ) : null}
    </div>
  )
}

function InterestsStep({
  options,
  labels,
  profileDefaults,
  selected,
  onChange,
  onContinue,
  error,
}: {
  options: readonly string[]
  labels: Record<string, string>
  profileDefaults: string[]
  selected: string[]
  onChange: (next: string[]) => void
  onContinue: () => void
  error: string | null
}) {
  function toggle(slug: string) {
    onChange(
      selected.includes(slug)
        ? selected.filter((s) => s !== slug)
        : [...selected, slug],
    )
  }

  // Pre-select the user's profile interests if they haven't picked
  // anything yet (one-time convenience). The effect is idempotent.
  useEffect(() => {
    if (selected.length === 0 && profileDefaults.length > 0) {
      onChange(profileDefaults.filter((s) => (options as readonly string[]).includes(s)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">Find your match</p>
        <h1 className="text-page-title mb-2">What do you love doing?</h1>
        <p className="text-base text-muted max-w-2xl">
          Pick the things you are most excited about in Da Nang. We will line up
          buddies whose specialties overlap the most first, then keep going down
          the list.
        </p>
      </header>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <fieldset className="border border-border rounded-sm bg-surface p-6 mb-6">
        <legend className="text-sm font-semibold text-ink px-2">Your interests</legend>
        <div className="flex flex-wrap gap-2">
          {options.map((slug) => {
            const active = selected.includes(slug)
            return (
              <button
                key={slug}
                type="button"
                onClick={() => toggle(slug)}
                aria-pressed={active}
                className={`h-9 px-3 text-sm font-medium rounded-pill border transition-colors duration-150 ${
                  active
                    ? 'bg-primary text-paper border-primary'
                    : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                }`}
              >
                {labels[slug as Specialty] ?? slug}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted mt-4">
          {selected.length === 0
            ? 'Pick at least one interest to continue.'
            : `${selected.length} interest${selected.length === 1 ? '' : 's'} selected.`}
        </p>
      </fieldset>

      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          Back to dashboard
        </Link>
        <button
          type="button"
          onClick={onContinue}
          disabled={selected.length === 0}
          className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles size={16} aria-hidden="true" />
          See matching buddies
        </button>
      </div>
    </>
  )
}

function DeckStep({
  queue,
  loading,
  error,
  onPass,
  onLike,
  onEditInterests,
  stats,
  interests,
}: {
  queue: BuddyCard[]
  loading: boolean
  error: string | null
  onPass: (b: BuddyCard) => void
  onLike: (b: BuddyCard) => void
  onEditInterests: () => void
  stats: { likes: number; passes: number }
  interests: string[]
}) {
  const top = queue[0]
  const interestLabels = useMemo(
    () => new Set(interests),
    [interests],
  )

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-primary mb-1">Discover</p>
          <h1 className="text-page-title mb-1">Swipe to match</h1>
          <p className="text-sm text-muted">
            Buddies with the most shared interests appear first. Swipe right
            to like, left to pass.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEditInterests}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <ChevronLeft size={14} aria-hidden="true" />
            Edit interests
          </button>
          <Link
            href="/matches"
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary-bg text-primary border border-primary-bg hover:bg-primary hover:text-paper"
          >
            <Heart size={14} aria-hidden="true" />
            Liked & matches
          </Link>
        </div>
      </header>

      <div className="mb-3 text-sm text-muted" aria-live="polite">
        {stats.likes > 0 || stats.passes > 0
          ? `${stats.likes} liked · ${stats.passes} passed`
          : 'Use the buttons, drag the card, or press ← / → on your keyboard.'}
      </div>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mx-auto" style={{ maxWidth: 420 }}>
        {loading ? (
          <div className="aspect-[3/4] border border-border rounded-sm bg-surface flex items-center justify-center">
            <div className="loading-spinner" />
          </div>
        ) : top ? (
          <SwipeCard
            key={top.id}
            buddy={top}
            selectedInterests={interestLabels}
            onPass={() => onPass(top)}
            onLike={() => onLike(top)}
          />
        ) : (
          <EmptyDeck onEditInterests={onEditInterests} />
        )}
      </div>
    </>
  )
}

function SwipeCard({
  buddy,
  selectedInterests,
  onPass,
  onLike,
}: {
  buddy: BuddyCard
  selectedInterests: Set<string>
  onPass: () => void
  onLike: () => void
}) {
  // Drag-to-swipe state
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false })
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  function onPointerDown(e: React.PointerEvent) {
    startRef.current = { x: e.clientX, y: e.clientY }
    setDrag({ x: 0, y: 0, active: true })
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!startRef.current) return
    setDrag({
      x: e.clientX - startRef.current.x,
      y: e.clientY - startRef.current.y,
      active: true,
    })
  }
  function onPointerUp() {
    if (!startRef.current) return
    const threshold = 120
    if (drag.x > threshold) {
      onLike()
    } else if (drag.x < -threshold) {
      onPass()
    }
    startRef.current = null
    setDrag({ x: 0, y: 0, active: false })
  }

  // Visual cues: large LIKE/PASS overlays + rotation
  const likeOpacity = Math.max(0, Math.min(1, drag.x / 120))
  const passOpacity = Math.max(0, Math.min(1, -drag.x / 120))
  const rotation = drag.x / 18

  return (
    <div className="relative">
      <div
        ref={cardRef}
        role="article"
        aria-label={`${buddy.full_name} — ${buddy.specialties.length} specialties, ${buddy.location_city}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rotation}deg)`,
          transition: drag.active ? 'none' : 'transform 220ms ease',
          touchAction: 'none',
          cursor: drag.active ? 'grabbing' : 'grab',
        }}
        className="relative aspect-[3/4] border border-border rounded-sm bg-surface shadow-sm overflow-hidden select-none"
      >
        {/* LIKE / PASS overlays */}
        <div
          aria-hidden="true"
          className="absolute top-6 left-6 z-20 px-3 py-1.5 text-lg font-bold tracking-wider text-success border-2 border-success rounded-sm"
          style={{ opacity: likeOpacity, transform: 'rotate(-12deg)' }}
        >
          LIKE
        </div>
        <div
          aria-hidden="true"
          className="absolute top-6 right-6 z-20 px-3 py-1.5 text-lg font-bold tracking-wider text-danger border-2 border-danger rounded-sm"
          style={{ opacity: passOpacity, transform: 'rotate(12deg)' }}
        >
          PASS
        </div>

        {/* Header / hero */}
        <div className="absolute inset-0 flex flex-col">
          <div
            className="flex-shrink-0 h-2/3 flex items-center justify-center text-paper"
            style={{ backgroundColor: avatarColor(buddy.id) }}
          >
            {buddy.avatar_url ? (
              <img
                src={buddy.avatar_url}
                alt={`${buddy.full_name} avatar`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-7xl font-semibold tracking-tight" aria-hidden="true">
                {initials(buddy.full_name)}
              </span>
            )}
          </div>
          <div className="flex-1 p-5 overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="text-xl font-semibold text-ink">{buddy.full_name}</h2>
              {buddy.is_online ? (
                <span className="badge badge-success" aria-label="Online now">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
                    aria-hidden="true"
                  />
                  Online
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted mb-2">
              <MapPin size={12} className="inline mr-1" aria-hidden="true" />
              {buddy.location_city}
              {buddy.rating_avg ? (
                <>
                  {' · '}
                  <Star size={12} className="inline mr-0.5 text-warning" aria-hidden="true" />
                  {buddy.rating_avg.toFixed(1)}
                </>
              ) : null}
              {buddy.hourly_rate ? (
                <>
                  {' · '}
                  <span className="font-mono">${Number(buddy.hourly_rate).toFixed(0)}/h</span>
                </>
              ) : null}
            </p>
            {buddy.bio ? (
              <p className="text-sm text-ink leading-relaxed mb-3">{buddy.bio}</p>
            ) : null}

            {buddy.specialties.length > 0 ? (
              <>
                <p className="text-eyebrow text-muted mb-2">Specialties</p>
                <ul className="flex flex-wrap gap-1.5 mb-3">
                  {buddy.specialties.map((slug) => {
                    const matched = selectedInterests.has(slug)
                    return (
                      <li
                        key={slug}
                        className={`text-xs px-2 py-1 rounded-pill border ${
                          matched
                            ? 'bg-primary-bg text-primary border-primary-bg font-medium'
                            : 'bg-transparent text-ink border-border'
                        }`}
                        title={matched ? 'Matches your interest' : undefined}
                      >
                        {SPECIALTY_LABELS[slug as Specialty] ?? slug}
                        {matched ? ' ✓' : ''}
                      </li>
                    )
                  })}
                </ul>
              </>
            ) : null}

            {buddy.languages.length > 0 ? (
              <>
                <p className="text-eyebrow text-muted mb-2">Languages</p>
                <ul className="flex flex-wrap gap-1.5">
                  {buddy.languages.map((l) => (
                    <li key={l} className="lang-chip text-xs">
                      {l}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {buddy.overlap_count > 0 ? (
              <p className="text-xs text-success mt-3 font-medium">
                <Sparkles size={12} className="inline mr-1" aria-hidden="true" />
                {buddy.overlap_count} shared interest{buddy.overlap_count === 1 ? '' : 's'}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Action buttons — only 2 per spec */}
      <div className="mt-6 flex items-center justify-center gap-6">
        <button
          type="button"
          onClick={onPass}
          aria-label="Pass on this buddy"
          className="inline-flex items-center justify-center w-16 h-16 rounded-full border-2 border-danger text-danger bg-surface hover:bg-danger hover:text-paper transition-colors duration-150"
        >
          <X size={28} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onLike}
          aria-label="Like this buddy"
          className="inline-flex items-center justify-center w-16 h-16 rounded-full border-2 border-success text-success bg-surface hover:bg-success hover:text-paper transition-colors duration-150"
        >
          <Heart size={28} aria-hidden="true" />
        </button>
      </div>
      <p className="text-xs text-subtle text-center mt-2">
        Press <kbd className="px-1.5 py-0.5 border border-border rounded text-[10px] font-mono">←</kbd> to pass, <kbd className="px-1.5 py-0.5 border border-border rounded text-[10px] font-mono">→</kbd> to like.
      </p>
    </div>
  )
}

function EmptyDeck({ onEditInterests }: { onEditInterests: () => void }) {
  return (
    <div className="aspect-[3/4] border border-border rounded-sm bg-surface p-8 flex flex-col items-center justify-center text-center">
      <Sparkles size={48} className="text-primary mb-4" aria-hidden="true" />
      <h2 className="text-xl font-semibold mb-2">You have seen everyone</h2>
      <p className="text-sm text-muted mb-4 max-w-sm">
        That is every buddy who matches your interests in Da Nang right now.
        Try editing your interests to widen the deck, or check back later.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onEditInterests}
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          Edit interests
        </button>
        <Link
          href="/matches"
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper gap-1"
        >
          <Heart size={14} aria-hidden="true" />
          See my matches
        </Link>
      </div>
    </div>
  )
}

function MatchModal({
  partnerName,
  partnerId,
  onClose,
}: {
  partnerName: string
  partnerId: string
  onClose: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-sm p-8 max-w-md w-full text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 text-5xl" aria-hidden="true">🎉</div>
        <h2 id="match-modal-title" className="text-2xl font-bold text-primary mb-2">
          It is a match!
        </h2>
        <p className="text-base text-ink mb-6">
          You and <strong>{partnerName}</strong> liked each other. Say hi!
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={`/chat?buddy=${partnerId}`}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <MessageCircle size={16} aria-hidden="true" />
            Open chat
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center h-11 px-5 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Keep swiping
          </button>
        </div>
      </div>
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function avatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash)
  }
  const palette = ['#FF6B35', '#92400E', '#166534', '#075985', '#7C2D12', '#5B21B6']
  return palette[Math.abs(hash) % palette.length]
}
