'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Check, Info, AlertTriangle, Star } from 'lucide-react'
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
      .select('*, buddy:buddies(id, profile:safe_profiles(full_name))')
      .eq('id', tripId)
      .single()

    if (tripErr || !tripData) {
      setError('Trip not found.')
      return
    }

    if (tripData.tourist_id !== user.id) {
      setError("You don't have permission to review this trip.")
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
      setError('Please choose a rating from 1 to 5.')
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
      <main className="container-page py-16">
        <article className="max-w-[560px] mx-auto border border-border rounded-sm bg-surface p-12 text-center">
          <AlertTriangle className="mx-auto mb-4 text-danger" size={48} strokeWidth={1.5} aria-hidden="true" />
          <h1 className="text-xl font-semibold mb-4">{error}</h1>
          <button
            type="button"
            onClick={() => router.push('/tourist/dashboard')}
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            Back to dashboard
          </button>
        </article>
      </main>
    )
  }

  if (!trip || !reviewing) {
    return (
      <main className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" aria-hidden="true" />
      </main>
    )
  }

  return (
    <main className="container-page py-12">
      <article className="max-w-[560px] mx-auto border border-border rounded-sm bg-surface p-6 lg:p-8">
        <header className="mb-6">
          <p className="text-eyebrow text-muted mb-2">Trip review</p>
          <h1 className="text-2xl font-semibold text-ink mb-1 tracking-tight">Rate your Da Nang buddy</h1>
          <p className="text-sm text-muted">Trip: <strong className="text-ink">{trip.title}</strong></p>
        </header>

        {submitted ? (
          <div className="border border-success-bg bg-success-bg text-success rounded-sm p-4 flex items-start gap-3">
            <Check size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Thanks for leaving a review.</p>
              <p className="text-xs mt-1">Redirecting to your dashboard...</p>
            </div>
          </div>
        ) : existingReview ? (
          <div className="border border-info-bg bg-info-bg text-info rounded-sm p-4 flex items-start gap-3">
            <Info size={20} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span className="text-sm">You have already reviewed this trip.</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <section className="mb-6 text-center">
              <p className="text-eyebrow text-muted mb-3">Reviewing</p>
              <div className="flex items-center justify-center gap-3">
                <span className="avatar avatar-lg" aria-hidden="true">
                  {reviewing.profile?.full_name?.charAt(0) ?? 'B'}
                </span>
                <div className="text-left">
                  <strong className="text-base text-ink block">{reviewing.profile?.full_name}</strong>
                  <p className="text-xs text-muted">Your local buddy</p>
                </div>
              </div>
            </section>

            <fieldset className="mb-6 text-center">
              <legend className="text-sm font-medium text-ink mb-3">How was the trip?</legend>
              <div
                className="flex items-center justify-center gap-1 mb-2"
                role="radiogroup"
                aria-label="Star rating"
              >
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = n <= (hover || rating)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`Rate ${n} of 5`}
                      className="p-1 rounded-sm transition-colors duration-150"
                    >
                      <Star
                        size={36}
                        strokeWidth={1.5}
                        fill={active ? 'currentColor' : 'none'}
                        className={active ? 'text-primary' : 'text-subtle'}
                      />
                    </button>
                  )
                })}
              </div>
              <p className="text-sm font-medium text-ink">
                {(hover || rating) ? LABELS[hover || rating] : 'Choose a rating'}
              </p>
            </fieldset>

            <div className="mb-6">
              <label className="block text-sm font-medium text-ink mb-2" htmlFor="comment">
                Comment (optional)
              </label>
              <textarea
                id="comment"
                className="form-input form-textarea w-full"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="Share what you saw, ate, or learned in Da Nang."
              />
              <p className="text-xs text-muted mt-1">{comment.length}/1000</p>
            </div>

            {error ? (
              <div className="border border-danger-bg bg-danger-bg text-danger rounded-sm p-3 flex items-start gap-2 mb-4" role="alert">
                <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-sm">{error}</span>
              </div>
            ) : null}

            <button
              type="submit"
              disabled={submitting || rating === 0}
              className="inline-flex items-center justify-center w-full h-11 px-6 text-base font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Submitting...' : 'Submit review'}
            </button>
          </form>
        )}
      </article>
    </main>
  )
}
