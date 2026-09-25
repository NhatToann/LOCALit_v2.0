import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Trip.css'

const TripCreate = () => {
  const navigate = useNavigate()
  const formRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState({
    destination: '',
    startDate: '',
    endDate: '',
    travelers: 1,
    budget: '',
    interests: [] as string[],
    specialRequirements: ''
  })

  const savedTrips = [
    { 
      id: 1, 
      name: 'Da Nang Beach Adventure', 
      destination: 'Da Nang',
      date: '2026-08-15',
      status: 'Planning',
      buddy: 'Lan Pham',
      collaborators: ['Minh Nguyen', 'Huy Nguyen'],
      lastEdit: '2 hours ago'
    },
    { 
      id: 2, 
      name: 'Ha Long Bay Trip', 
      destination: 'Ha Long Bay',
      date: '2026-09-01',
      status: 'Confirmed',
      buddy: 'Minh Nguyen',
      collaborators: ['Lan Pham'],
      lastEdit: '1 day ago'
    },
  ]

  const interests = ['Beaches', 'History', 'Food & Dining', 'Adventure', 'Nature', 'Culture', 'Nightlife', 'Shopping']

  const handleInterestToggle = (interest: string) => {
    setFormData({
      ...formData,
      interests: formData.interests.includes(interest)
        ? formData.interests.filter(i => i !== interest)
        : [...formData.interests, interest]
    })
  }

  const handleSubmit = () => {
    navigate('/trip/ai-generate')
  }

  const handleCreateTrip = () => {
    setStep(1)
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  return (
    <div className="trip-create-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">My Itineraries</h1>
          <p className="page-subtitle">Create and collaborate on trip plans</p>
        </div>
      </section>

      <section className="trip-content">
        <div className="container">
          {/* Saved Trips Section */}
          <div className="saved-trips-section">
            <div className="section-header">
              <h2>Your Itineraries</h2>
              <span className="trip-count">{savedTrips.length} trips</span>
            </div>
            
            <div className="saved-trips-grid">
              {savedTrips.map((trip) => (
                <div key={trip.id} className="saved-trip-card">
                  <div className="saved-trip-header">
                    <h3>{trip.name}</h3>
                    <span className={`status-badge ${trip.status.toLowerCase()}`}>{trip.status}</span>
                  </div>
                  <div className="saved-trip-details">
                    <p className="trip-destination">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      {trip.destination}
                    </p>
                    <p className="trip-date">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      {trip.date}
                    </p>
                    <p className="trip-buddy">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                      {trip.buddy}
                    </p>
                  </div>
                  <div className="collaborators-section">
                    <span className="collaborators-label">Collaborators:</span>
                    <div className="collaborators-avatars">
                      {trip.collaborators.map((collab, index) => (
                        <span key={index} className="collaborator-avatar" title={collab}>
                          {collab.charAt(0)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <p className="last-edit">Edited {trip.lastEdit}</p>
                  <div className="saved-trip-actions">
                    <Link to={`/trip/${trip.id}`} className="btn btn-outline btn-sm">
                      View
                    </Link>
                    <Link to={`/trip/${trip.id}/edit`} className="btn btn-primary btn-sm">
                      Edit
                    </Link>
                  </div>
                </div>
              ))}
              
              {/* Create New Trip Card */}
              <button type="button" className="create-trip-card" onClick={handleCreateTrip}>
                <div className="create-trip-content">
                  <div className="create-icon">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </div>
                  <h3>Create New Itinerary</h3>
                  <p>Plan your next adventure</p>
                </div>
              </button>
            </div>
          </div>

          {/* Create Trip Form */}
          {step > 0 && (
            <div className="trip-form-container" ref={formRef}>
              {/* Progress Steps */}
              <div className="progress-steps">
                <div className={`step ${step >= 1 ? 'active' : ''}`}>
                  <div className="step-number">1</div>
                  <span>Destination</span>
                </div>
                <div className="step-line"></div>
                <div className={`step ${step >= 2 ? 'active' : ''}`}>
                  <div className="step-number">2</div>
                  <span>Details</span>
                </div>
                <div className="step-line"></div>
                <div className={`step ${step >= 3 ? 'active' : ''}`}>
                  <div className="step-number">3</div>
                  <span>Preferences</span>
                </div>
                <div className="close-step" onClick={() => setStep(0)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </div>
              </div>

              {/* Step 1: Destination */}
              {step === 1 && (
                <div className="form-step">
                  <h2>Where would you like to go?</h2>
                  <p className="step-desc">Choose your destination and travel dates</p>
                  
                  <div className="form-group">
                    <label className="form-label">Destination</label>
                    <select 
                      className="form-input"
                      value={formData.destination}
                      onChange={(e) => setFormData({...formData, destination: e.target.value})}
                    >
                      <option value="">Select a destination</option>
                      <option value="halong">Ha Long Bay</option>
                      <option value="danang">Da Nang</option>
                      <option value="hanoi">Hanoi</option>
                      <option value="hoian">Hoi An</option>
                      <option value="nhatrang">Nha Trang</option>
                      <option value="phuquoc">Phu Quoc</option>
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Start Date</label>
                      <input 
                        type="date" 
                        className="form-input"
                        value={formData.startDate}
                        onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">End Date</label>
                      <input 
                        type="date" 
                        className="form-input"
                        value={formData.endDate}
                        onChange={(e) => setFormData({...formData, endDate: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="step-actions">
                    <button 
                      className="btn btn-primary"
                      onClick={() => setStep(2)}
                      disabled={!formData.destination || !formData.startDate || !formData.endDate}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Details */}
              {step === 2 && (
                <div className="form-step">
                  <h2>Trip Details</h2>
                  <p className="step-desc">Tell us more about your trip</p>
                  
                  <div className="form-group">
                    <label className="form-label">Number of Travelers</label>
                    <select 
                      className="form-input"
                      value={formData.travelers}
                      onChange={(e) => setFormData({...formData, travelers: Number(e.target.value)})}
                    >
                      <option value={1}>1 Person</option>
                      <option value={2}>2 People</option>
                      <option value={3}>3 People</option>
                      <option value={4}>4 People</option>
                      <option value={5}>5+ People</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Budget per Person ($)</label>
                    <select 
                      className="form-input"
                      value={formData.budget}
                      onChange={(e) => setFormData({...formData, budget: e.target.value})}
                    >
                      <option value="">Select budget range</option>
                      <option value="50">Under $50</option>
                      <option value="50-100">$50 - $100</option>
                      <option value="100-200">$100 - $200</option>
                      <option value="200-500">$200 - $500</option>
                      <option value="500+">$500+</option>
                    </select>
                  </div>

                  <div className="step-actions">
                    <button className="btn btn-outline" onClick={() => setStep(1)}>
                      Back
                    </button>
                    <button 
                      className="btn btn-primary"
                      onClick={() => setStep(3)}
                      disabled={!formData.travelers || !formData.budget}
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Preferences */}
              {step === 3 && (
                <div className="form-step">
                  <h2>Travel Preferences</h2>
                  <p className="step-desc">What are you interested in?</p>
                  
                  <div className="interests-grid">
                    {interests.map((interest) => (
                      <button
                        key={interest}
                        className={`interest-btn ${formData.interests.includes(interest) ? 'selected' : ''}`}
                        onClick={() => handleInterestToggle(interest)}
                      >
                        {interest}
                      </button>
                    ))}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Special Requirements (Optional)</label>
                    <textarea 
                      className="form-input form-textarea"
                      rows={4}
                      placeholder="Any accessibility needs, dietary restrictions, or special requests..."
                      value={formData.specialRequirements}
                      onChange={(e) => setFormData({...formData, specialRequirements: e.target.value})}
                    />
                  </div>

                  <div className="step-actions">
                    <button className="btn btn-outline" onClick={() => setStep(2)}>
                      Back
                    </button>
                    <button className="btn btn-primary" onClick={handleSubmit}>
                      Generate with AI
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default TripCreate
