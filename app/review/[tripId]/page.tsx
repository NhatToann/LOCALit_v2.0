'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'

const LABELS = ['', 'Poor', 'Below average', 'Average', 'Great', 'Excellent']

export default function ReviewPage() {
  const params = useParams()
  const tripId = params?.tripId as string
  const router = useRouter()
  const [trip, setTrip] = useState<any>(null)
  const [reviewing, setReviewing] = useState<any>(null)
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [existingReview, setExistingReview] = useState<boolean>(false)

  useEffect(() => {
    if (tripId) load()
  }, [tripId])

  async function load() {
    const supabase = createClient()
    const user = await getCurrentUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: tripData, error: tripErr } = await supabase
      .from('trips')
      .select('*, buddy:buddies(id, profile:profiles(full_name))')
      .eq('id', tripId)
      .single()

    if (tripErr || !tripData) {
      setError('Trip not found.')
      return
    }

    if (tripData.tourist_id !== user.id) {
      setError('You don&apos;t have permission to review this trip.')
      return
    }

    if (!tripData.buddy_id) {
      setError('This trip does not have a buddy to review yet.')
      return
    }

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('trip_id', tripId)
      .eq('reviewer_id', user.id)
      .eq('reviewee_id', tripData.buddy_id)
      .maybeSingle()

    if (existing) {
      setExistingReview(true)
    }

    setTrip(tripData)
    setReviewing(tripData.buddy)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (rating < 1 || rating > 5) {
      setError('Please choose a rating (1-5 stars).')
      return
    }
    if (comment.length > 1000) {
      setError('Comment must be 1000 characters or fewer.')
      return
    }

    const user = await getCurrentUser()
    if (!user || !trip || !reviewing) return

    setSubmitting(true)
    const supabase = createClient()

    const { data: dup } = await supabase
      .from('reviews')
      .select('id')
      .eq('trip_id', tripId)
      .eq('reviewer_id', user.id)
      .eq('reviewee_id', reviewing.id)
      .maybeSingle()
    if (dup) {
      setError('You have already reviewed this trip.')
      setSubmitting(false)
      return
    }

    const { error: reviewError } = await supabase.from('reviews').insert({
      trip_id: tripId,
      reviewer_id: user.id,
      reviewee_id: reviewing.id,
      rating,
      comment: comment.trim() || null,
    })

    setSubmitting(false)
    if (reviewError) {
      setError(reviewError.message)
      return
    }
    setSubmitted(true)
    setTimeout(() => router.push('/tourist/dashboard'), 2200)
  }

  if (error && !trip) {
    return (
      <div className="container py-xl">
        <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="card-body text-center">
            <div style={{ fontSize: 48 }}>⚠️</div>
            <h3>{error}</h3>
            <button onClick={() => router.push('/tourist/dashboard')} className="btn btn-primary mt-md">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!trip || !reviewing) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>

  return (
    <div className="container py-xl">
      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card-body">
          <h1 className="text-2xl font-bold mb-md">Review your trip</h1>
          <p className="text-muted mb-lg">
            Trip: <strong>{trip.title}</strong>
          </p>

          {submitted ? (
            <div className="alert alert-success">
              <span>✓</span>
              <div>
                <p className="font-semibold">Thanks for leaving a review!</p>
                <p className="text-sm mt-xs">Redirecting to your dashboard...</p>
              </div>
            </div>
          ) : existingReview ? (
            <div className="alert alert-info">
              <span>ℹ️</span>
              <span>You have already reviewed this trip.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ textAlign: 'center', marginBottom: 'var(--space-lg)' }}>
                <p className="text-sm text-muted mb-sm">Reviewing</p>
                <div className="flex items-center gap-md" style={{ justifyContent: 'center' }}>
                  <span className="avatar avatar-lg">{reviewing.profile?.full_name?.charAt(0) ?? 'B'}</span>
                  <div style={{ textAlign: 'left' }}>
                    <strong>{reviewing.profile?.full_name}</strong>
                    <p className="text-sm text-muted">Your Local Buddy</p>
                  </div>
                </div>
              </div>

              <div className="form-group text-center">
                <label className="form-label">Star rating</label>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, fontSize: 36, margin: '12px 0' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      aria-label={`Rate ${n} stars`}
                      style={{
                        background: 'none',
                        color: n <= (hover || rating) ? '#FFB347' : '#ddd',
                        cursor: 'pointer',
                        fontSize: 40,
                        lineHeight: 1,
                        transition: 'transform 150ms',
                        transform: hover === n ? 'scale(1.2)' : 'scale(1)',
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
                  {(hover || rating) ? LABELS[hover || rating] : 'Choose a rating'}
                </p>
              </div>

              <div className="form-group">
                <label className="form-label">Comment (optional)</label>
                <textarea
                  className="form-input form-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Share your experience..."
                />
                <p className="text-xs text-muted mt-xs">{comment.length}/1000</p>
              </div>

              {error && (
                <div className="alert alert-error mb-md"><span>⚠️</span><span>{error}</span></div>
              )}

              <button type="submit" disabled={submitting || rating === 0} className="btn btn-primary btn-block">
                {submitting ? 'Submitting...' : 'Submit review'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
