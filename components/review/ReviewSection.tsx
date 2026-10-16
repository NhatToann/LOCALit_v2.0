'use client'

import { useEffect, useState } from 'react'
import { Star, Loader2, Trash2, MessageSquareQuote } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { readUserIdFromToken } from '@/utils/supabase/client-binding'
import { Avatar } from '@/components/ui/Avatar'
import { useAuthUser } from '@/lib/auth/useAuthUser'

/**
 * Star rating input.
 *
 * Built as a radio group rather than a row of buttons so it is keyboard
 * navigable (arrow keys move between stars) and screen readers announce
 * "3 of 5 stars". The visual stars are `aria-hidden`; the radios are
 * the accessible control underneath.
 */
export function StarInput({
  value,
  onChange,
  disabled = false,
  label = 'Rating',
}: {
  value: number
  onChange: (n: number) => void
  disabled?: boolean
  label?: string
}) {
  const [hovered, setHovered] = useState(0)
  const shown = hovered || value

  return (
    <fieldset disabled={disabled} className="border-0 p-0 m-0">
      <legend className="sr-only">{label}</legend>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <label
            key={n}
            className="relative inline-flex cursor-pointer p-0.5"
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
          >
            <input
              type="radio"
              name="rating"
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
              aria-label={`${n} ${n === 1 ? 'star' : 'stars'}`}
            />
            <Star
              size={26}
              aria-hidden="true"
              className={
                n <= shown
                  ? 'fill-warning text-warning'
                  : 'fill-transparent text-border-strong'
              }
            />
          </label>
        ))}
        {value > 0 ? (
          <span className="ml-2 text-xs font-medium text-muted tabular-nums">
            {RATING_LABELS[value]}
          </span>
        ) : null}
      </div>
    </fieldset>
  )
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Okay',
  4: 'Good',
  5: 'Excellent',
}

/** Read-only star row for displaying a rating. */
export function StarDisplay({
  rating,
  size = 14,
  showValue = false,
  count,
}: {
  rating: number
  size?: number
  showValue?: boolean
  count?: number
}) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={size}
            className={n <= Math.round(rating) ? 'fill-warning text-warning' : 'text-border-strong'}
          />
        ))}
      </span>
      {showValue ? (
        <strong className="text-sm font-semibold text-ink tabular-nums">{rating.toFixed(1)}</strong>
      ) : null}
      {typeof count === 'number' ? (
        <span className="text-xs text-muted">
          ({count} {count === 1 ? 'review' : 'reviews'})
        </span>
      ) : null}
    </span>
  )
}

/**
 * The composer + list on a public profile page.
 *
 * Who can review (product rule, 2026-10-10): only someone with an
 * ACCEPTED connection to the profile owner. The 403 for everyone else
 * is not an error state we show — it renders as an explanatory note, so
 * a signed-in visitor isn't left wondering what they did wrong.
 *
 * The gate is enforced by the `reviews_insert` RLS policy as well; this
 * component only decides what to *draw*.
 */
export default function ReviewSection({
  revieweeId,
  revieweeName,
}: {
  revieweeId: string
  revieweeName: string
}) {
  const [reviews, setReviews] = useState<ReviewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [myId, setMyId] = useState<string | null>(null)
  const [canReview, setCanReview] = useState<boolean | null>(null)
  const [composing, setComposing] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mineId, setMineId] = useState<string | null>(null)
  // Current user's name + avatar so the optimistic insert shows the
  // real reviewer (with avatar) instead of a hard-coded "You" / null
  // placeholder. The shared useAuthUser hook caches the profile so
  // mounting ReviewSection does NOT add a fresh profiles query on
  // top of the existing dashboard/profile ones.
  const auth = useAuthUser()
  const myName = auth?.fullName ?? 'You'
  const myAvatar = auth?.avatarUrl ?? null

  // Load reviews + determine whether the viewer may leave one.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        // Identity from the cookie — synchronous, no request. See
        // readUserIdFromToken for why getUser()/getSession() must not be
        // used for this: they either spam /auth/v1/user or deadlock the
        // auth lock, and either way the finally below never runs so
        // `loading` stays true and the section shows "Loading reviews…"
        // forever.
        const uid = readUserIdFromToken()
        if (!cancelled) setMyId(uid)

        const { data: rows } = await supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer_id, reviewer:safe_profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
          .eq('reviewee_id', revieweeId)
          .order('created_at', { ascending: false })
          .limit(50)

        if (cancelled) return
        const list = (rows ?? []) as unknown as ReviewRow[]
        setReviews(list)
        setMineId(list.find((r) => r.reviewer_id === uid)?.id ?? null)

        if (!uid) {
          setCanReview(false)
        } else if (uid === revieweeId) {
          setCanReview(false)
        } else {
          // Same query the API uses, so the UI and the server agree.
          const { data: link } = await supabase
            .from('connections')
            .select('id')
            .eq('status', 'accepted')
            .or(
              `and(requester_id.eq.${uid},recipient_id.eq.${revieweeId}),` +
                `and(requester_id.eq.${revieweeId},recipient_id.eq.${uid})`,
            )
            .limit(1)
            .maybeSingle()
          if (!cancelled) setCanReview(Boolean(link))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [revieweeId])

  async function submit() {
    if (!rating) {
      setError('Pick a star rating first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewee_id: revieweeId, rating, comment }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; review?: ReviewRow }
      if (!res.ok) {
        setError(json.error ?? 'Could not save your review.')
        return
      }
      // Prepend optimistically rather than refetching — we already
      // know exactly what we wrote and who we are. The reviewer
      // name + avatar come from the shared useAuthUser cache, so
      // the new row renders identically to the existing join data
      // and the avatar shows up immediately (no "You / no avatar"
      // placeholder).
      setReviews((prev) => [
        {
          id: json.review?.id ?? 'pending',
          rating,
          comment: comment.trim() || null,
          created_at: new Date().toISOString(),
          reviewer_id: myId ?? '',
          reviewer: { full_name: myName, avatar_url: myAvatar },
        },
        ...prev.filter((r) => r.reviewer_id !== myId),
      ])
      setMineId(json.review?.id ?? 'pending')
      setComment('')
      setRating(0)
      setComposing(false)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!confirm('Delete your review? This cannot be undone.')) return
    setBusy(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewee_id: revieweeId }),
      })
      if (res.ok) {
        setReviews((prev) => prev.filter((r) => r.id !== mineId))
        setMineId(null)
      }
    } finally {
      setBusy(false)
    }
  }

  const avg =
    reviews.length > 0
      ? reviews.reduce((s, r) => s + (r.rating ?? 0), 0) / reviews.length
      : 0

  return (
    <section aria-labelledby="reviews-heading" className="border border-border rounded-sm bg-surface p-5">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
        <h2 id="reviews-heading" className="text-section-title">
          Reviews
          {reviews.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-muted tabular-nums">
              {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
            </span>
          ) : null}
        </h2>
        <div className="flex items-center gap-3">
          {reviews.length > 0 ? <StarDisplay rating={avg} showValue /> : null}
          {canReview && !composing ? (
            <button
              type="button"
              onClick={() => {
                setComposing(true)
                setError(null)
              }}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              {mineId ? 'Edit your review' : 'Write a review'}
            </button>
          ) : null}
        </div>
      </header>

      {/* Signed-out / not-connected explanation */}
      {!loading && canReview === false ? (
        <p className="text-sm text-muted mb-4 max-w-prose">
          {myId
            ? `Only people who have connected with ${revieweeName} can leave a review. Send a connection request first — the review option unlocks once it is accepted.`
            : 'Sign in to leave a review. Reviews are only accepted from members who have connected with this person.'}
        </p>
      ) : null}

      {/* Composer */}
      {composing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          className="border border-border rounded-sm bg-paper p-4 mb-4 space-y-3"
        >
          <div>
            <span className="block text-sm font-medium text-ink mb-1.5">
              Your rating for {revieweeName}
            </span>
            <StarInput value={rating} onChange={setRating} disabled={busy} />
          </div>
          <div>
            <label htmlFor="review-comment" className="form-label">
              Your review <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              id="review-comment"
              rows={4}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What was it like to spend time with them? What should the next person know?"
              className="form-input form-textarea"
              disabled={busy}
            />
            <p className="form-hint">{comment.length}/1000</p>
          </div>
          {error ? (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy || !rating}
              className="inline-flex items-center gap-1 h-9 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
              {mineId ? 'Update review' : 'Post review'}
            </button>
            <button
              type="button"
              onClick={() => {
                setComposing(false)
                setRating(0)
                setComment('')
                setError(null)
              }}
              disabled={busy}
              className="inline-flex items-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted py-4">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" /> Loading reviews…
        </div>
      ) : reviews.length === 0 ? (
        <div className="flex items-start gap-3 py-6 text-center border border-dashed border-border rounded-sm px-4">
          <MessageSquareQuote size={20} className="text-muted shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-muted text-left">
            No reviews yet. {canReview
              ? 'Be the first to say how it went.'
              : `Reviews appear here once members who connected with ${revieweeName} write them.`}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {reviews.map((r) => {
            const isMine = r.reviewer_id === myId
            return (
              <li key={r.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <Avatar
                    name={r.reviewer?.full_name ?? 'Anonymous'}
                    src={r.reviewer?.avatar_url ?? null}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-ink">
                        {r.reviewer?.full_name ?? 'Anonymous'}
                      </span>
                      {isMine ? <span className="badge badge-neutral text-xs">Your review</span> : null}
                      <time
                        dateTime={r.created_at}
                        className="text-xs text-muted ml-auto tabular-nums"
                      >
                        {new Date(r.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </time>
                    </div>
                    <div className="mt-1.5">
                      <StarDisplay rating={r.rating} />
                    </div>
                    {r.comment ? (
                      <p className="text-sm text-ink leading-relaxed mt-2 whitespace-pre-line">
                        {r.comment}
                      </p>
                    ) : (
                      <p className="text-xs text-muted italic mt-2">No comment left.</p>
                    )}
                    {isMine ? (
                      <button
                        type="button"
                        onClick={() => void remove()}
                        disabled={busy}
                        className="inline-flex items-center gap-1 mt-2 text-xs text-muted hover:text-danger"
                      >
                        <Trash2 size={12} aria-hidden="true" /> Delete review
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface ReviewRow {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_id: string
  reviewer?: { full_name: string; avatar_url: string | null } | null
}