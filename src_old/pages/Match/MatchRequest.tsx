import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import './Match.css'

const MatchRequest = () => {
  const { buddyId } = useParams()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [status, setStatus] = useState('')
  const [formData, setFormData] = useState({
    tripName: '',
    destination: '',
    startDate: '',
    endDate: '',
    message: ''
  })

  const buddies = {
    '1': { name: 'Lan Pham', location: 'Da Nang', rating: 4.9, tripPlaceholder: 'Da Nang Beach Adventure', destinationValue: 'danang' },
    '2': { name: 'Minh Nguyen', location: 'Da Nang', rating: 4.8, tripPlaceholder: 'Da Nang Photography Walk', destinationValue: 'danang' },
    '3': { name: 'Huy Nguyen', location: 'Hoi An', rating: 4.7, tripPlaceholder: 'Hoi An Culture Walk', destinationValue: 'hoian' },
  }
  const buddy = {
    id: buddyId || '1',
    ...(buddies[(buddyId || '1') as keyof typeof buddies] || buddies['1'])
  }

  const handleSubmit = () => {
    setStatus('Request sent. Redirecting to your dashboard...')
    setTimeout(() => navigate('/tourist/dashboard'), 700)
  }

  return (
    <div className="match-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">Connect with {buddy.name}</h1>
          <p className="page-subtitle">Send a connection request</p>
        </div>
      </section>

      <section className="match-content">
        <div className="container">
          <div className="match-layout">
            {/* Buddy Card */}
            <aside className="buddy-preview">
              <div className="preview-card">
                <div className="buddy-avatar">{buddy.name.charAt(0)}</div>
                <h2>{buddy.name}</h2>
                <p className="location">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {buddy.location}
                </p>
                <p className="rating">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  {buddy.rating}
                </p>
                <Link to={`/buddies/${buddyId}`} className="btn btn-outline btn-full">
                  View Full Profile
                </Link>
              </div>
            </aside>

            {/* Request Form */}
            <div className="request-form">
              <div className="form-card">
                <div className="form-steps">
                  <div className={`step ${step >= 1 ? 'active' : ''}`}>
                    <span className="step-num">1</span>
                    <span>Trip Details</span>
                  </div>
                  <div className="step-line"></div>
                  <div className={`step ${step >= 2 ? 'active' : ''}`}>
                    <span className="step-num">2</span>
                    <span>Message</span>
                  </div>
                </div>

                {step === 1 && (
                  <div className="form-step">
                    <h3>Trip Details</h3>
                    <div className="form-group">
                      <label>Trip Name</label>
                      <input 
                        type="text" 
                        className="form-input"
                        placeholder={`e.g., ${buddy.tripPlaceholder}`}
                        value={formData.tripName}
                        onChange={(e) => setFormData({...formData, tripName: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Destination</label>
                      <select 
                        className="form-input"
                        value={formData.destination}
                        onChange={(e) => setFormData({...formData, destination: e.target.value})}
                      >
                        <option value="">Select destination</option>
                        <option value="danang">Da Nang</option>
                        <option value="hoian">Hoi An</option>
                        <option value="hanoi">Hanoi</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>Start Date</label>
                        <input 
                          type="date" 
                          className="form-input"
                          value={formData.startDate}
                          onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                        />
                      </div>
                      <div className="form-group">
                        <label>End Date</label>
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
                        disabled={!formData.tripName || !formData.destination || !formData.startDate}
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="form-step">
                    <h3>Your Message</h3>
                    <p className="step-desc">Introduce yourself and tell {buddy.name.split(' ')[0]} about your trip</p>
                    <div className="form-group">
                      <label>Message (Optional)</label>
                      <textarea 
                        className="form-input form-textarea"
                        rows={6}
                        placeholder={`Hi! I'm planning a trip to ${buddy.location} and would love to have you as my local buddy...`}
                        value={formData.message}
                        onChange={(e) => setFormData({...formData, message: e.target.value})}
                      />
                    </div>
                    <div className="step-actions">
                      <button className="btn btn-outline" onClick={() => setStep(1)}>
                        Back
                      </button>
                      <button className="btn btn-primary" onClick={handleSubmit}>
                        Send Request
                      </button>
                    </div>
                    {status && <div className="mvp-message success">{status}</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default MatchRequest
