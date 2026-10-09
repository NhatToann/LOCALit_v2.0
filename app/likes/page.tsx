'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart, Sparkles, MapPin, MessageCircle, Inbox } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { SPECIALTY_LABELS, type Specialty } from '@/lib/specialties'

/**
 * /likes — Buddy-only feed of tourists who have liked them. Each card
 * has a single "Like back" action which, if a mutual like is detected,
 * closes the loop and triggers the match flow on the tourist side.
 *
 * Realtime: subscribes to public.swipes so the list grows live when a
 * new tourist swipes right on this buddy.
 */
interface IncomingLike {
  swipe_id: string
  tourist_id: string
  full_name: string
  avatar_url: string | null
  is_online: boolean
  interests: string[]
  languages: string[]
  destination: string | null
  travel_style: string | null
  overlap_count: number
  liked_back: boolean
  liked_at: string
}

export default function LikesPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [likes, setLikes] = useState<IncomingLike[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [matchModal, setMatchModal] = useState<{ partnerId: string; partnerName: string } | null>(null)

  // Auth: only buddies. Everyone else (tourist, anon) gets redirected.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return
      if (!user) {
        router.replace('/login?redirectTo=/likes')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      if (profile?.role !== 'buddy') {
        router.replace('/swipe')
        return
      }
      setAuthChecked(true)
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [router])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/swipe/likes', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not load likes')
      setLikes(data.likes ?? [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (authChecked) void load()
  }, [authChecked, load])

  // Realtime: when a new swipe is INSERTed targeting us, refetch.
  useEffect(() => {
    if (!authChecked) return
    const supabase = createClient()
    let myId: string | null = null
    void supabase.auth.getUser().then(({ data }) => {
      myId = data.user?.id ?? null
    })
    const channel = supabase
      .channel('likes-incoming')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'swipes' },
        (payload) => {
          const row = payload.new as { swiper_role: string; target_id: string; direction: string }
          if (row.direction !== 'like' || row.swiper_role !== 'tourist') return
          if (row.target_id === myId) void load()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'matches' },
        (payload) => {
          const row = payload.new as { tourist_id: string; buddy_id: string }
          if (row.buddy_id === myId) void load()
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [authChecked, load])

  const likeBack = useCallback(async (like: IncomingLike) => {
    setPendingId(like.tourist_id)
    setError(null)
    try {
      const res = await fetch('/api/swipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_id: like.tourist_id, direction: 'like' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not like back')
      if (data.matched) {
        setMatchModal({ partnerId: like.tourist_id, partnerName: like.full_name })
      }
      // Mark as liked back optimistically
      setLikes((prev) =>
        prev.map((l) => (l.tourist_id === like.tourist_id ? { ...l, liked_back: true } : l)),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPendingId(null)
    }
  }, [])

  if (!authChecked) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-primary mb-1">Likes</p>
          <h1 className="text-page-title mb-1">Travelers who liked you</h1>
          <p className="text-sm text-muted">
            Tap <strong>Like back</strong> to open the chat. When both of you
            like each other, it counts as a match.
          </p>
        </div>
        <Link
          href="/matches"
          className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary-bg text-primary border border-primary-bg hover:bg-primary hover:text-paper"
        >
          <Heart size={14} aria-hidden="true" />
          My matches
        </Link>
      </header>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="text-center py-16">
          <div className="loading-spinner mx-auto" />
        </div>
      ) : likes.length === 0 ? (
        <div className="border border-border rounded-sm bg-surface p-12 text-center">
          <Inbox size={48} className="mx-auto text-subtle mb-3" aria-hidden="true" />
          <h2 className="text-lg font-semibold mb-2">No likes yet</h2>
          <p className="text-sm text-muted mb-4 max-w-md mx-auto">
            When a tourist likes your profile, you will see them here. New likes
            appear in real time.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            Back to dashboard
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {likes.map((like) => (
            <li
              key={like.swipe_id}
              className="border border-border rounded-sm bg-surface overflow-hidden flex flex-col"
            >
              <div
                className="h-32 flex items-center justify-center text-paper"
                style={{ backgroundColor: avatarColor(like.tourist_id) }}
              >
                {like.avatar_url ? (
                  <img
                    src={like.avatar_url}
                    alt={`${like.full_name} avatar`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl font-semibold" aria-hidden="true">
                    {initials(like.full_name)}
                  </span>
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h2 className="text-base font-semibold text-ink truncate">
                    {like.full_name}
                  </h2>
                  {like.is_online ? (
                    <span className="badge badge-success text-[10px]">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
                        aria-hidden="true"
                      />
                      Online
                    </span>
                  ) : null}
                </div>
                {like.destination ? (
                  <p className="text-xs text-muted mb-2">
                    <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                    {like.destination}
                    {like.travel_style ? ` · ${like.travel_style}` : ''}
                  </p>
                ) : null}
                {like.interests.length > 0 ? (
                  <ul className="flex flex-wrap gap-1 mb-3">
                    {like.interests.slice(0, 5).map((slug) => (
                      <li
                        key={slug}
                        className={`text-[10px] px-2 py-0.5 rounded-pill border ${
                          like.overlap_count > 0
                            ? 'bg-primary-bg text-primary border-primary-bg font-medium'
                            : 'bg-transparent text-ink border-border'
                        }`}
                      >
                        {SPECIALTY_LABELS[slug as Specialty] ?? slug}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {like.overlap_count > 0 ? (
                  <p className="text-xs text-success mb-3 font-medium">
                    <Sparkles size={12} className="inline mr-1" aria-hidden="true" />
                    {like.overlap_count} shared interest{like.overlap_count === 1 ? '' : 's'} with you
                  </p>
                ) : null}
                <p className="text-[10px] text-subtle mb-3">
                  Liked you {timeAgo(like.liked_at)}
                </p>
                <div className="mt-auto flex items-center gap-2">
                  {like.liked_back ? (
                    <Link
                      href={`/chat?buddy=&with=${like.tourist_id}`}
                      className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
                    >
                      <MessageCircle size={14} aria-hidden="true" />
                      Open chat
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => likeBack(like)}
                      disabled={pendingId === like.tourist_id}
                      className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full disabled:opacity-50"
                    >
                      <Heart size={14} aria-hidden="true" />
                      {pendingId === like.tourist_id ? 'Sending…' : 'Like back'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {matchModal ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="buddy-match-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60"
          onClick={() => setMatchModal(null)}
        >
          <div
            className="bg-surface border border-border rounded-sm p-8 max-w-md w-full text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-5xl" aria-hidden="true">🎉</div>
            <h2 id="buddy-match-modal-title" className="text-2xl font-bold text-primary mb-2">
              It is a match!
            </h2>
            <p className="text-base text-ink mb-6">
              You and <strong>{matchModal.partnerName}</strong> liked each other.
              Say hi!
            </p>
            <div className="flex flex-col gap-2">
              <Link
                href={`/chat?with=${matchModal.partnerId}`}
                className="inline-flex items-center justify-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                <MessageCircle size={16} aria-hidden="true" />
                Open chat
              </Link>
              <button
                type="button"
                onClick={() => setMatchModal(null)}
                className="inline-flex items-center justify-center h-11 px-5 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                Keep browsing
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
  // Brand palette (2026-10-09 — matching teal/blue gradient). Mirrors
  // --color-primary* in app/globals.css.
  const palette = ['#0063AE', '#00BACF', '#11EDAF', '#009ED0', '#004F8E', '#0081C5']
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
