import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import './Review.css'

const Review = () => {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const [rating, setRating] = useState(0)
  const [hoverRating, setHoverRating] = useState(0)
  const [status, setStatus] = useState('')
  const [formData, setFormData] = useState({
    title: '',
    comment: '',
    aspects: {
      guide: 5,
      itinerary: 5,
      value: 5,
      organization: 5
    }
  })

  const trip = {
    id: tripId || '1',
    name: 'Da Nang Beach Adventure',
    buddy: 'Lan Pham',
    date: '2026-08-15'
  }

  const handleSubmit = () => {
    setStatus('Review submitted. Returning to your dashboard...')
    setTimeout(() => navigate('/tourist/dashboard'), 700)
  }

  const canSubmit = rating > 0 && Boolean(formData.title.trim()) && Boolean(formData.comment.trim())

  const aspectLabels = {
    guide: 'Guide Performance',
    itinerary: 'Itinerary Quality',
    value: 'Value for Money',
    organization: 'Organization'
  }

  return (
    <div className="review-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">Write a Review</h1>
          <p className="page-subtitle">Share your experience with others</p>
        </div>
      </section>

      <section className="review-content">
        <div className="container">
          <div className="review-container">
            {/* Trip Info */}
            <div className="trip-info-card">
              <h3>You are reviewing</h3>
              <div className="trip-details">
                <h4>{trip.name}</h4>
                <p>with {trip.buddy} • {trip.date}</p>
              </div>
            </div>

            {/* Overall Rating */}
            <div className="rating-section">
              <h3>Overall Rating</h3>
              <div className="star-rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    className={`star ${star <= (hoverRating || rating) ? 'active' : ''}`}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                  >
                    <svg width="40" height="40" viewBox="0 0 24 24" fill={star <= (hoverRating || rating) ? '#FFB347' : 'none'} stroke="#FFB347" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                  </button>
                ))}
              </div>
              <p className="rating-text">
                {rating === 0 && 'Click to rate'}
                {rating === 1 && 'Poor'}
                {rating === 2 && 'Fair'}
                {rating === 3 && 'Good'}
                {rating === 4 && 'Very Good'}
                {rating === 5 && 'Excellent'}
              </p>
            </div>

            {/* Aspect Ratings */}
            <div className="aspects-section">
              <h3>Rate Different Aspects</h3>
              <div className="aspects-list">
                {(Object.keys(formData.aspects) as Array<keyof typeof formData.aspects>).map((aspect) => (
                  <div key={aspect} className="aspect-item">
                    <span className="aspect-label">{aspectLabels[aspect]}</span>
                    <div className="aspect-rating">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          className={`aspect-star ${star <= formData.aspects[aspect] ? 'active' : ''}`}
                          onClick={() => setFormData({
                            ...formData,
                            aspects: { ...formData.aspects, [aspect]: star }
                          })}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill={star <= formData.aspects[aspect] ? '#FFB347' : 'none'} stroke="#FFB347" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Review Details */}
            <div className="details-section">
              <h3>Your Review</h3>
              <div className="form-group">
                <label>Review Title</label>
                <input 
                  type="text" 
                  className="form-input"
                  placeholder="Summarize your experience"
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Your Review</label>
                <textarea 
                  className="form-input form-textarea"
                  rows={6}
                  placeholder="Tell others about your experience..."
                  value={formData.comment}
                  onChange={(e) => setFormData({...formData, comment: e.target.value})}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="review-actions">
              <Link to="/tourist/dashboard" className="btn btn-outline">
                Cancel
              </Link>
              <button 
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                Submit Review
              </button>
            </div>
            {!canSubmit && (
              <p className="form-hint">Choose a star rating, add a short title, and write a comment before submitting.</p>
            )}
            {status && <div className="mvp-message success">{status}</div>}
          </div>
        </div>
      </section>
    </div>
  )
}

export default Review
