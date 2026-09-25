'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/utils/supabase/auth'

export default function ReviewPage() {
  const params = useParams()
  const tripId = params?.tripId as string
  const router = useRouter()
  const [trip, setTrip] = useState<any>(null)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('trips')
        .select('*, buddy:buddies(*, profile:profiles(*)), tourist:tourists(*)')
        .eq('id', tripId)
        .single()
      setTrip(data)
    }
    if (tripId) load()
  }, [tripId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !trip) return

    const revieweeId = trip.tourist_id === user.id ? trip.buddy?.id : trip.tourist_id

    const { error: reviewError } = await supabase.from('reviews').insert({
      trip_id: tripId,
      reviewer_id: user.id,
      reviewee_id: revieweeId,
      rating,
      comment: comment || null,
    })

    if (reviewError) {
      setError(reviewError.message)
      setSubmitting(false)
      return
    }

    setSubmitted(true)
    setSubmitting(false)
    setTimeout(() => router.push('/tourist/dashboard'), 2000)
  }

  if (!trip) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  const buddy = trip.buddy as any

  return (
    <div className="container py-xl">
      <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
        <div className="card-body">
          <h1 className="text-2xl font-bold mb-md">Đánh giá chuyến đi</h1>
          <p className="text-muted mb-lg">
            Chuyến: <strong>{trip.title}</strong>
          </p>

          {submitted ? (
            <div className="alert alert-success">
              <span>✓</span>
              <span>Cảm ơn bạn đã đánh giá!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group text-center">
                <label className="form-label" style={{ textAlign: 'center' }}>
                  Đánh giá {buddy?.profile?.full_name?.split(' ')[0] || 'đối phương'}
                </label>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, fontSize: 32, margin: '16px 0' }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      style={{
                        background: 'none',
                        color: n <= rating ? '#FFB347' : '#ddd',
                        cursor: 'pointer',
                        fontSize: 36,
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <p className="text-sm text-muted">{rating}/5</p>
              </div>

              <div className="form-group">
                <label className="form-label">Nhận xét</label>
                <textarea
                  className="form-input form-textarea"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="Chia sẻ trải nghiệm của bạn..."
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}

              <button type="submit" disabled={submitting} className="btn btn-primary btn-block">
                {submitting ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
