'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { ConnectionStatus } from '@/lib/types'
import { MapPin, Star, AlertTriangle, MessageCircle, Phone, Send, Hourglass, X, CircleDot, MapIcon, Pencil } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { labelFor } from '@/lib/specialties'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

interface BuddyData {
  id: string
  full_name: string
  bio: string | null
  avatar_url: string | null
  phone: string | null
  is_online: boolean
  location_city: string
  latitude: number
  longitude: number
  languages: string[]
  specialties: string[]
  favorite_places: string[]
  hourly_rate: number | null
  rating_avg: number | null
  trips_completed: number
}

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_name: string | null
}

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 }

export default function BuddyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [buddy, setBuddy] = useState<BuddyData | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [connection, setConnection] = useState<{ status: ConnectionStatus; id: string } | null>(null)
  const [eligibleTrips, setEligibleTrips] = useState<{ id: string; title: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reviewSubmitting, setReviewSubmitting] = useState<string | null>(null)
  const [reviewRating, setReviewRating] = useState(5)
  const [reviewComment, setReviewComment] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const me = await getCurrentUser()

      // Buddy marketplace read: rounded coords via safe_buddies (anon-safe)
      // + the profile fields every visitor needs (full_name, avatar_url,
      // is_online). Phone stays behind an authenticated direct read since
      // it's PII and must not leak to anon viewers of a shared profile link.
      const [{ data: b }, { data: privateProfile }] = await Promise.all([
        supabase
          .from('safe_buddies')
          .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, rating_avg, is_available, bio, favorite_places, trips_completed, profile:safe_profiles(full_name, avatar_url, is_online)')
          .eq('id', id)
          .maybeSingle(),
        me
          ? supabase
              .from('profiles')
              .select('phone')
              .eq('id', id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])

      if (cancelled) return
      if (!b) {
        setError('Buddy not found.')
        setLoading(false)
        return
      }
      setBuddy({
        id: b.id,
        full_name: (b.profile as any)?.full_name ?? 'Buddy',
        bio: b.bio ?? null,
        avatar_url: (b.profile as any)?.avatar_url ?? null,
        phone: (privateProfile as any)?.phone ?? null,
        is_online: (b.profile as any)?.is_online ?? false,
        location_city: b.location_city,
        latitude: b.latitude ?? DEFAULT_LOCATION.lat,
        longitude: b.longitude ?? DEFAULT_LOCATION.lng,
        languages: b.languages ?? [],
        specialties: b.specialties ?? [],
        favorite_places: b.favorite_places ?? [],
        hourly_rate: b.hourly_rate ?? null,
        rating_avg: b.rating_avg ?? null,
        trips_completed: b.trips_completed ?? 0,
      })

      const [{ data: r }, { data: c }] = await Promise.all([
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer:safe_profiles!reviewer_id(full_name)')
          .eq('reviewee_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
        me
          ? supabase
              .from('connections')
              .select('id, status')
              .eq('buddy_id', id)
              .eq('tourist_id', me.id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])

      if (cancelled) return
      setReviews(
        (r ?? []).map((row: any) => ({
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          created_at: row.created_at,
          reviewer_name: row.reviewer?.full_name ?? null,
        })),
      )
      if (c) setConnection({ id: c.id, status: c.status as ConnectionStatus })

      // Load eligible trips (completed, buddy=this one, by current tourist) so the
      // user can leave a review right from the public profile.
      if (me) {
        const { data: trips } = await supabase
          .from('trips')
          .select('id, title')
          .eq('tourist_id', me.id)
          .eq('buddy_id', id)
          .eq('status', 'completed')
          .order('updated_at', { ascending: false })
          .limit(3)
        if (!cancelled && trips) setEligibleTrips(trips)
      }

      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id])

  async function sendRequest() {
    if (!buddy) return
    const me = await getCurrentUser()
    if (!me) {
      router.push('/login')
      return
    }
    setActionLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: insertErr } = await supabase
      .from('connections')
      .insert({
        tourist_id: me.id,
        buddy_id: buddy.id,
        message: message.trim() || null,
        status: 'pending',
      })
      .select('id, status')
      .single()
    setActionLoading(false)
    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('You already sent a request to this buddy.')
      } else {
        setError('Could not send request: ' + insertErr.message)
      }
      return
    }
    if (data) setConnection({ id: data.id, status: data.status as ConnectionStatus })
  }

  async function openChat() {
    if (!buddy) return
    const me = await getCurrentUser()
    if (!me) {
      router.push('/login')
      return
    }
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('tourist_id', me.id)
      .eq('buddy_id', buddy.id)
      .maybeSingle()

    if (existing) {
      router.push(`/chat/${existing.id}`)
      return
    }
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({ tourist_id: me.id, buddy_id: buddy.id })
      .select('id')
      .single()
    if (createErr) {
      setError('Could not open conversation: ' + createErr.message)
      return
    }
    router.push(`/chat/${created.id}`)
  }

  async function submitReview(tripId: string) {
    if (!buddy) return
    const me = await getCurrentUser()
    if (!me) {
      router.push('/login')
      return
    }
    if (reviewComment.length > 500) return
    setReviewSubmitting(tripId)
    setError('')
    const supabase = createClient()
    const { error: insErr } = await supabase.from('reviews').insert({
      trip_id: tripId,
      reviewer_id: me.id,
      reviewee_id: buddy.id,
      rating: reviewRating,
      comment: reviewComment.trim() || null,
    })
    setReviewSubmitting(null)
    if (insErr) {
      setError('Could not post review: ' + insErr.message)
      return
    }
    setReviews([
      {
        id: crypto.randomUUID(),
        rating: reviewRating,
        comment: reviewComment.trim() || null,
        created_at: new Date().toISOString(),
        reviewer_name: null,
      },
      ...reviews,
    ])
    setEligibleTrips(eligibleTrips.filter((t) => t.id !== tripId))
    setReviewComment('')
    setReviewRating(5)
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (error && !buddy) {
    return (
      <div className="container-page py-16">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
        <Link
          href="/tourist/browse"
          className="inline-flex items-center justify-center mt-3 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          Back to list
        </Link>
      </div>
    )
  }
  if (!buddy) return null

  return (
    <div className="container-page py-8">
      <Link href="/tourist/browse" className="text-sm text-muted hover:text-ink mb-3 inline-block">
        Back to list
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <main className="lg:col-span-2 space-y-6">
          {/* Hero card */}
          <article className="bg-surface border border-border rounded-sm p-6">
            <header className="flex flex-wrap items-start gap-4">
              <Avatar name={buddy.full_name} src={buddy.avatar_url} size="2xl" online={buddy.is_online} />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h1 className="text-page-title">{buddy.full_name}</h1>
                  {buddy.is_online ? (
                    <span className="badge badge-success">
                      <CircleDot size={12} className="mr-1" aria-hidden="true" />
                      Online
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted">
                  <MapPin size={14} className="inline mr-1" aria-hidden="true" />
                  {buddy.location_city}
                </p>
                <p className="text-sm mt-2">
                  <Star size={14} className="inline text-warning mr-1" aria-hidden="true" />
                  <strong>{buddy.rating_avg ? buddy.rating_avg.toFixed(1) : '—'}</strong>
                  <span className="text-muted ml-1">
                    ({reviews.length} reviews · {buddy.trips_completed} trips completed)
                  </span>
                </p>
                {buddy.bio ? (
                  <p className="text-sm leading-relaxed mt-3 max-w-prose">{buddy.bio}</p>
                ) : null}
              </div>
            </header>

            <hr className="my-6 border-border" />

            <dl className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <dt className="text-eyebrow text-muted mb-2">Languages</dt>
                <dd className="flex flex-wrap gap-1">
                  {buddy.languages.length === 0 ? (
                    <span className="text-sm text-muted">Not set yet</span>
                  ) : (
                    buddy.languages.map((l) => (
                      <span key={l} className="lang-chip">{l}</span>
                    ))
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow text-muted mb-2">Specialties</dt>
                <dd className="flex flex-wrap gap-1">
                  {buddy.specialties.length === 0 ? (
                    <span className="text-sm text-muted">Not set yet</span>
                  ) : (
                    buddy.specialties.map((s) => (
                      <span key={s} className="badge badge-neutral text-xs">{labelFor(s)}</span>
                    ))
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow text-muted mb-2">Hourly rate</dt>
                <dd>
                  <strong className="text-ink">
                    {buddy.hourly_rate && buddy.hourly_rate > 0
                      ? `$${Number(buddy.hourly_rate).toFixed(0)} USD / hour`
                      : 'Negotiable'}
                  </strong>
                </dd>
              </div>
            </dl>
          </article>

          {/* Favorite places */}
          {buddy.favorite_places.length > 0 ? (
            <section className="bg-surface border border-border rounded-sm p-6" aria-labelledby="fav-places-title">
              <header className="mb-3">
                <h2 id="fav-places-title" className="text-section-title">
                  Where {buddy.full_name.split(' ')[0]} takes travelers
                </h2>
                <p className="text-sm text-muted">
                  {buddy.favorite_places.length} place{buddy.favorite_places.length === 1 ? '' : 's'} pinned across Da Nang.
                </p>
              </header>
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {buddy.favorite_places.map((slug) => (
                  <li
                    key={slug}
                    className="flex items-center gap-2 border border-border rounded-sm px-3 py-2 bg-paper"
                  >
                    <MapIcon size={14} className="text-primary flex-shrink-0" aria-hidden="true" />
                    <span className="text-xs font-medium text-ink truncate">{labelFor(slug)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Leave a review (if applicable) */}
          {eligibleTrips.length > 0 ? (
            <section className="bg-surface border border-border rounded-sm p-6" aria-labelledby="leave-review-title">
              <header className="mb-3">
                <h2 id="leave-review-title" className="text-section-title">
                  Leave a review
                </h2>
                <p className="text-sm text-muted">
                  Help other travelers — share how the trip with {buddy.full_name.split(' ')[0]} went.
                </p>
              </header>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-ink mb-1">Your rating</legend>
                <div className="flex gap-1" role="radiogroup" aria-label="Star rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReviewRating(n)}
                      aria-checked={reviewRating === n}
                      role="radio"
                      className="p-0"
                    >
                      <Star
                        size={28}
                        fill={n <= reviewRating ? 'currentColor' : 'none'}
                        strokeWidth={1.5}
                        className={n <= reviewRating ? 'text-warning' : 'text-border-strong hover:text-muted'}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
                <label className="form-label" htmlFor="review-comment">
                  Comment (optional, 500 chars)
                </label>
                <textarea
                  id="review-comment"
                  rows={3}
                  maxLength={500}
                  className="form-input form-textarea"
                  placeholder="What worked well? What could be better?"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                  {eligibleTrips.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => submitReview(t.id)}
                      disabled={reviewSubmitting === t.id}
                      className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      <Pencil size={14} aria-hidden="true" />
                      {reviewSubmitting === t.id ? 'Posting…' : `Post review for "${t.title.length > 24 ? t.title.slice(0, 24) + '…' : t.title}"`}
                    </button>
                  ))}
                </div>
              </fieldset>
            </section>
          ) : null}

          {/* Reviews */}
          <section className="bg-surface border border-border rounded-sm" aria-labelledby="reviews-title">
            <header className="px-6 py-4 border-b border-border">
              <h2 id="reviews-title" className="text-lg font-semibold">
                Reviews ({reviews.length})
              </h2>
            </header>
            <div className="p-6">
              {reviews.length === 0 ? (
                <p className="text-sm text-muted text-center py-8">No reviews yet.</p>
              ) : (
                <ul className="space-y-4 divide-y divide-border">
                  {reviews.map((r, idx) => (
                    <li key={r.id} className={idx > 0 ? 'pt-4' : ''}>
                      <div className="flex items-center gap-3 mb-2">
                        <Avatar name={r.reviewer_name ?? 'Traveler'} size="sm" />
                        <strong className="text-sm">{r.reviewer_name ?? 'Traveler'}</strong>
                        <span
                          className="flex items-center gap-0.5 text-warning"
                          aria-label={`${r.rating} out of 5 stars`}
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              size={14}
                              fill={n <= r.rating ? 'currentColor' : 'none'}
                              strokeWidth={1.5}
                              className={n > r.rating ? 'text-muted' : ''}
                              aria-hidden="true"
                            />
                          ))}
                        </span>
                        <span className="text-xs text-muted ml-auto">
                          {new Date(r.created_at).toLocaleDateString('en-US')}
                        </span>
                      </div>
                      {r.comment ? <p className="text-sm">{r.comment}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          {/* Action card */}
          <section className="bg-surface border border-border rounded-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Start a conversation</h2>

            {!connection ? (
              <>
                <div className="form-group">
                  <label className="form-label" htmlFor="msg">
                    Message (optional)
                  </label>
                  <textarea
                    id="msg"
                    className="form-input form-textarea"
                    rows={3}
                    placeholder="Hi! I would love to learn more about your tours in Da Nang."
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                    maxLength={280}
                  />
                  <p className="text-xs text-muted mt-1">{message.length}/280</p>
                </div>
                <button
                  type="button"
                  onClick={sendRequest}
                  disabled={actionLoading}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 w-full"
                >
                  <Send size={16} aria-hidden="true" />
                  {actionLoading ? 'Sending...' : 'Send connection request'}
                </button>
              </>
            ) : null}

            {connection?.status === 'pending' ? (
              <div className="alert alert-info" role="status">
                <Hourglass size={16} aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">Request sent</p>
                  <p className="text-xs">The buddy will respond as soon as possible.</p>
                </div>
              </div>
            ) : null}

            {connection?.status === 'declined' ? (
              <div className="alert alert-error" role="status">
                <X size={16} aria-hidden="true" />
                <span className="text-sm">The buddy declined your request.</span>
              </div>
            ) : null}

            {connection?.status === 'accepted' ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={openChat}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
                >
                  <MessageCircle size={16} aria-hidden="true" />
                  Open conversation
                </button>
                <Link
                  href={`/chat?buddy=${buddy.id}&call=1`}
                  className="inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper w-full"
                >
                  <Phone size={16} aria-hidden="true" />
                  Start voice call
                </Link>
              </div>
            ) : null}

            {error ? (
              <div className="alert alert-error mt-3" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span className="text-sm">{error}</span>
              </div>
            ) : null}
          </section>

          {/* Map */}
          <section className="bg-surface border border-border rounded-sm overflow-hidden">
            <header className="px-6 py-4 border-b border-border">
              <h2 className="text-base font-semibold">Location</h2>
            </header>
            <MapView
              userLocation={{ lat: buddy.latitude, lng: buddy.longitude }}
              height={260}
              showSelfMarker={false}
            />
          </section>

          {buddy.phone ? (
            <section className="bg-surface border border-border rounded-sm p-6">
              <p className="text-eyebrow text-muted mb-2">Contact</p>
              <p className="text-sm">
                <Phone size={14} className="inline mr-1" aria-hidden="true" />
                {buddy.phone}
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
