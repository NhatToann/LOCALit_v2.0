'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, MessageCircle, MapPin, Sparkles, Clock } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'

/**
 * /matches — list of mutual likes for the current user.
 *
 * For tourists we add a second tab "Liked" listing every buddy the
 * tourist has liked (matched or not). This is the "đã thích" view that
 * makes it easier to find a buddy again if they haven't replied yet.
 *
 * Realtime: subscribes to public.matches so a new match pops in live
 * and bumps the matches tab counter in real time.
 */
interface MatchItem {
  id: string
  created_at: string
  partner: {
    id: string
    full_name: string
    avatar_url: string | null
    is_online: boolean
    role: 'tourist' | 'buddy'
  }
  buddy: {
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
  }
  tourist: {
    id: string
    full_name: string
    avatar_url: string | null
    is_online: boolean
  }
}

interface LikedItem {
  swipe_id: string
  liked_at: string
  matched: boolean
  match_id: string | null
  buddy: {
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
  }
}

type Tab = 'matches' | 'liked'

export default function MatchesPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [role, setRole] = useState<'tourist' | 'buddy' | null>(null)
  const [tab, setTab] = useState<Tab>('matches')
  const [matches, setMatches] = useState<MatchItem[]>([])
  const [liked, setLiked] = useState<LikedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.replace('/login?redirectTo=/matches')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      setRole((profile?.role as 'tourist' | 'buddy' | null) ?? null)
      setAuthChecked(true)
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const requests: Array<Promise<{ ok: boolean; body: any }>> = [
        fetch('/api/swipe/matches', { cache: 'no-store' }).then(async (r) => ({
          ok: r.ok,
          body: await r.json().catch(() => null),
        })),
      ]
      // Only tourists have a "Liked" tab; the API returns 403 for
      // buddies so we just don't call it.
      if (role === 'tourist') {
        requests.push(
          fetch('/api/swipe/liked', { cache: 'no-store' }).then(async (r) => ({
            ok: r.ok,
            body: await r.json().catch(() => null),
          })),
        )
      }
      const [matchesRes, likedRes] = await Promise.all(requests)

      if (!matchesRes.ok) {
        throw new Error(matchesRes.body?.error ?? 'Could not load matches')
      }
      setMatches(matchesRes.body?.matches ?? [])

      if (likedRes) {
        if (!likedRes.ok) {
          throw new Error(likedRes.body?.error ?? 'Could not load liked')
        }
        setLiked(likedRes.body?.liked ?? [])
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    if (authChecked) void load()
  }, [authChecked, load])

  // Realtime: when a match is created for me, refetch the list.
  useEffect(() => {
    if (!authChecked) return
    const supabase = createClient()
    let myId: string | null = null
    void supabase.auth.getUser().then(({ data }) => {
      myId = data.user?.id ?? null
    })
    const channel = supabase
      .channel('matches-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const row = payload.new as { tourist_id: string; buddy_id: string }
          if (row.tourist_id === myId || row.buddy_id === myId) void load()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [authChecked, load])

  if (!authChecked) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const isTourist = role === 'tourist'
  const matchedCount = liked.filter((l) => l.matched).length
  const pendingCount = liked.length - matchedCount

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-1">
          {isTourist ? 'Connections' : 'Matches'}
        </p>
        <h1 className="text-page-title mb-1">
          {isTourist ? 'People you have liked' : 'Your mutual likes'}
        </h1>
        <p className="text-sm text-muted">
          {isTourist
            ? 'Buddies you have liked appear here. Matched ones can be chatted with right away.'
            : 'When you both like each other, you become a match. Start the conversation here.'}
        </p>
      </header>

      {/* Tabs: only tourists see "Liked"; matches tab is shared. */}
      {isTourist ? (
        <div
          role="tablist"
          aria-label="View connections"
          className="flex items-center gap-2 mb-6 border-b border-border"
        >
          <TabButton
            active={tab === 'matches'}
            onClick={() => setTab('matches')}
            label="Matches"
            count={matches.length}
            icon={<Heart size={14} aria-hidden="true" />}
          />
          <TabButton
            active={tab === 'liked'}
            onClick={() => setTab('liked')}
            label="Liked"
            count={liked.length}
            icon={<Sparkles size={14} aria-hidden="true" />}
            sublabel={
              liked.length > 0
                ? `${matchedCount} matched · ${pendingCount} pending`
                : null
            }
          />
        </div>
      ) : null}

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="text-center py-16">
          <div className="loading-spinner mx-auto" />
        </div>
      ) : tab === 'matches' ? (
        <MatchesList matches={matches} isTourist={isTourist} />
      ) : (
        <LikedList liked={liked} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  label,
  count,
  icon,
  sublabel,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  icon: React.ReactNode
  sublabel?: string | null
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 h-11 text-sm font-medium border-b-2 -mb-px transition-colors duration-150 ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted hover:text-ink hover:border-border-strong'
      }`}
    >
      {icon}
      <span>{label}</span>
      <span
        className={`text-xs px-1.5 py-0.5 rounded-pill font-mono ${
          active ? 'bg-primary-bg text-primary' : 'bg-paper text-muted'
        }`}
      >
        {count}
      </span>
      {sublabel ? (
        <span className="text-xs text-subtle ml-1">{sublabel}</span>
      ) : null}
    </button>
  )
}

function MatchesList({
  matches,
  isTourist,
}: {
  matches: MatchItem[]
  isTourist: boolean
}) {
  if (matches.length === 0) {
    return (
      <div className="border border-border rounded-sm bg-surface p-12 text-center">
        <Sparkles size={48} className="mx-auto text-subtle mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold mb-2">No matches yet</h2>
        <p className="text-sm text-muted mb-4 max-w-md mx-auto">
          Keep swiping. When someone you liked also likes you back,
          you will see them here in real time.
        </p>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <Link
            href="/swipe"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            Start swiping
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Back to dashboard
          </Link>
        </div>
      </div>
    )
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {matches.map((m) => {
        const chatHref =
          m.partner.role === 'buddy'
            ? `/chat?buddy=${m.partner.id}`
            : `/chat?with=${m.partner.id}`
        return (
          <li
            key={m.id}
            className="border border-border rounded-sm bg-surface overflow-hidden flex flex-col"
          >
            <div
              className="h-32 flex items-center justify-center text-paper"
              style={{ backgroundColor: avatarColor(m.partner.id) }}
            >
              {m.partner.avatar_url ? (
                <img
                  src={m.partner.avatar_url}
                  alt={`${m.partner.full_name} avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-semibold" aria-hidden="true">
                  {initials(m.partner.full_name)}
                </span>
              )}
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-base font-semibold text-ink truncate">
                  {m.partner.full_name}
                </h2>
                {m.partner.is_online ? (
                  <span className="badge badge-success text-[10px]">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
                      aria-hidden="true"
                    />
                    Online
                  </span>
                ) : null}
              </div>
              {m.partner.role === 'buddy' ? (
                <p className="text-xs text-muted mb-3">
                  <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                  {m.buddy.location_city}
                  {m.buddy.rating_avg ? (
                    <>
                      {' · '}★ {m.buddy.rating_avg.toFixed(1)}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-muted mb-3">Traveler in Da Nang</p>
              )}
              <p className="text-xs text-success font-medium mb-3">
                <Heart size={12} className="inline mr-1" aria-hidden="true" />
                Matched {timeAgo(m.created_at)}
              </p>
              <div className="mt-auto flex items-center gap-2">
                <Link
                  href={chatHref}
                  className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
                >
                  <MessageCircle size={14} aria-hidden="true" />
                  Open chat
                </Link>
                {isTourist ? (
                  <Link
                    href={`/buddies/${m.partner.id}`}
                    className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                  >
                    View
                  </Link>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function LikedList({ liked }: { liked: LikedItem[] }) {
  if (liked.length === 0) {
    return (
      <div className="border border-border rounded-sm bg-surface p-12 text-center">
        <Heart size={48} className="mx-auto text-subtle mb-3" aria-hidden="true" />
        <h2 className="text-lg font-semibold mb-2">No likes yet</h2>
        <p className="text-sm text-muted mb-4 max-w-md mx-auto">
          Buddies you swipe right on will appear here so you can find them
          again even before they reply.
        </p>
        <Link
          href="/swipe"
          className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          Start swiping
        </Link>
      </div>
    )
  }
  // Sort: matched buddies first, then by most-recent swipe.
  const sorted = [...liked].sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1
    return new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime()
  })
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map((l) => {
        const chatHref = `/chat?buddy=${l.buddy.id}`
        return (
          <li
            key={l.swipe_id}
            className="border border-border rounded-sm bg-surface overflow-hidden flex flex-col"
          >
            <div
              className="h-32 flex items-center justify-center text-paper relative"
              style={{ backgroundColor: avatarColor(l.buddy.id) }}
            >
              {l.buddy.avatar_url ? (
                <img
                  src={l.buddy.avatar_url}
                  alt={`${l.buddy.full_name} avatar`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-4xl font-semibold" aria-hidden="true">
                  {initials(l.buddy.full_name)}
                </span>
              )}
              <span
                className={`absolute top-3 right-3 text-[10px] px-2 py-0.5 rounded-pill font-medium border ${
                  l.matched
                    ? 'bg-success text-paper border-success'
                    : 'bg-paper text-warning border-warning'
                }`}
              >
                {l.matched ? 'Matched' : 'Pending'}
              </span>
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h2 className="text-base font-semibold text-ink truncate">
                  {l.buddy.full_name}
                </h2>
                {l.buddy.is_online ? (
                  <span className="badge badge-success text-[10px]">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
                      aria-hidden="true"
                    />
                    Online
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted mb-3">
                <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                {l.buddy.location_city}
                {l.buddy.rating_avg ? (
                  <>
                    {' · '}★ {l.buddy.rating_avg.toFixed(1)}
                  </>
                ) : null}
              </p>
              <p className="text-xs text-muted mb-3">
                <Clock size={12} className="inline mr-1" aria-hidden="true" />
                {l.matched ? 'Matched' : 'Liked'} {timeAgo(l.liked_at)}
              </p>
              <div className="mt-auto flex items-center gap-2">
                {l.matched ? (
                  <Link
                    href={chatHref}
                    className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    Open chat
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-paper text-subtle border border-border w-full cursor-not-allowed"
                    title="Waiting for the buddy to like you back"
                  >
                    <Clock size={14} aria-hidden="true" />
                    Waiting for reply
                  </button>
                )}
                <Link
                  href={`/buddies/${l.buddy.id}`}
                  className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                >
                  View
                </Link>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
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
  // Brand palette (2026-10-09 — matching teal/blue gradient). Mirrors
  // --color-primary* in app/globals.css.
  const palette = ['#0D9488', '#34D399', '#10B981', '#065F46', '#0E7490', '#134E4A']
  return palette[Math.abs(hash) % palette.length]
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'just now'
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} d ago`
}