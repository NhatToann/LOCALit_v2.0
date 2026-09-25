import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import './Auth.css'

const Register = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const destinationParam = searchParams.get('destination') || ''

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    nationality: '',
    arrivalDate: '',
    destination: destinationParam,
    interests: [] as string[],
    travelStyle: '',
    languages: [] as string[],
  })

  const allInterests = [
    { id: 'food', label: 'Food & Dining', icon: '🍜' },
    { id: 'history', label: 'History & Culture', icon: '🏛️' },
    { id: 'nature', label: 'Nature & Adventure', icon: '🏔️' },
    { id: 'beach', label: 'Beach & Relaxation', icon: '🏖️' },
    { id: 'nightlife', label: 'Nightlife & Entertainment', icon: '🌃' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'photography', label: 'Photography', icon: '📷' },
    { id: 'fitness', label: 'Fitness & Wellness', icon: '🧘' },
  ]

  const travelStyles = [
    { id: 'solo', label: 'Solo Travel', description: 'Exploring on my own' },
    { id: 'couple', label: 'Couple Trip', description: 'Romantic getaway' },
    { id: 'friends', label: 'With Friends', description: 'Group adventure' },
    { id: 'family', label: 'Family Vacation', description: 'All ages welcome' },
  ]

  const languages = [
    { id: 'english', label: 'English' },
    { id: 'vietnamese', label: 'Vietnamese' },
    { id: 'chinese', label: 'Chinese' },
    { id: 'japanese', label: 'Japanese' },
    { id: 'korean', label: 'Korean' },
    { id: 'french', label: 'French' },
  ]

  const handleInterestToggle = (interestId: string) => {
    setFormData({
      ...formData,
      interests: formData.interests.includes(interestId)
        ? formData.interests.filter(i => i !== interestId)
        : [...formData.interests, interestId]
    })
  }

  const handleLanguageToggle = (langId: string) => {
    setFormData({
      ...formData,
      languages: formData.languages.includes(langId)
        ? formData.languages.filter(l => l !== langId)
        : [...formData.languages, langId]
    })
  }

  const handleSubmit = () => {
    navigate('/login', { state: { registered: true } })
  }

  const emailLooksValid = formData.email.includes('@') && formData.email.includes('.')
  const passwordsMatch = formData.password === formData.confirmPassword
  const stepOneReady = Boolean(formData.fullName && emailLooksValid && formData.password.length >= 6 && passwordsMatch && formData.phone.trim().length >= 8)
  const stepTwoReady = Boolean(formData.destination && formData.arrivalDate && formData.nationality)
  const stepThreeReady = formData.interests.length > 0 && Boolean(formData.travelStyle) && formData.languages.length > 0

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Left Side - Branding */}
        <div className="auth-branding">
          <div className="branding-content">
            <Link to="/" className="auth-logo">
              <span className="logo-icon">L</span>
              <span>LOCALit</span>
            </Link>
            
            <div className="branding-text">
              <h1>Start Your Journey</h1>
              <p>Join thousands of travelers discovering authentic Vietnam with local buddies</p>
            </div>

            <div className="branding-features">
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Connect with verified local guides</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Personalized matching based on interests</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Create custom itineraries together</span>
              </div>
            </div>
          </div>

          <div className="branding-image">
            <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop" alt="Travel" />
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="auth-form-section">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2>Create Your Account</h2>
              <p>Step {step} of 3: {step === 1 ? 'Basic Info' : step === 2 ? 'Travel Preferences' : 'Complete Profile'}</p>
            </div>

            {/* Progress Bar */}
            <div className="auth-progress">
              <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
                <div className="step-circle">1</div>
              </div>
              <div className={`progress-line ${step >= 2 ? 'active' : ''}`}></div>
              <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
                <div className="step-circle">2</div>
              </div>
              <div className={`progress-line ${step >= 3 ? 'active' : ''}`}></div>
              <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
                <div className="step-circle">3</div>
              </div>
            </div>

            {/* Step 1: Basic Info */}
            {step === 1 && (
              <div className="form-step">
                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={formData.fullName}
                    onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  />
                  {formData.email && !emailLooksValid && (
                    <p className="form-hint error">Please enter a valid email address.</p>
                  )}
                </div>

                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Password</label>
                    <input
                      type="password"
                      placeholder="Create a password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                    />
                    {formData.password && formData.password.length < 6 && (
                      <p className="form-hint error">Use at least 6 characters.</p>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Confirm your password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                    />
                    {formData.confirmPassword && !passwordsMatch && (
                      <p className="form-hint error">Passwords do not match.</p>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Phone Number</label>
                  <input
                    type="tel"
                    placeholder="+84 123 456 789"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                  {formData.phone && formData.phone.trim().length < 8 && (
                    <p className="form-hint error">Please enter a phone number your buddy can contact.</p>
                  )}
                </div>

                {!stepOneReady && (
                  <p className="form-hint">Complete name, valid email, matching password, and phone to continue.</p>
                )}
                <button 
                  className="btn btn-primary btn-block"
                  onClick={() => setStep(2)}
                  disabled={!stepOneReady}
                >
                  Continue
                </button>
              </div>
            )}

            {/* Step 2: Travel Preferences */}
            {step === 2 && (
              <div className="form-step">
                <div className="form-group">
                  <label>Where are you traveling?</label>
                  <select
                    value={formData.destination}
                    onChange={(e) => setFormData({...formData, destination: e.target.value})}
                  >
                    <option value="">Select destination</option>
                    <option value="da-nang">Da Nang</option>
                    <option value="hoi-an">Hoi An</option>
                    <option value="ha-long">Ha Long Bay</option>
                    <option value="hanoi">Hanoi</option>
                    <option value="nha-trang">Nha Trang</option>
                    <option value="phu-quoc">Phu Quoc</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Arrival Date</label>
                  <input
                    type="date"
                    value={formData.arrivalDate}
                    onChange={(e) => setFormData({...formData, arrivalDate: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label>Nationality</label>
                  <select
                    value={formData.nationality}
                    onChange={(e) => setFormData({...formData, nationality: e.target.value})}
                  >
                    <option value="">Select nationality</option>
                    <option value="us">United States</option>
                    <option value="uk">United Kingdom</option>
                    <option value="au">Australia</option>
                    <option value="sg">Singapore</option>
                    <option value="jp">Japan</option>
                    <option value="kr">South Korea</option>
                    <option value="cn">China</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="form-actions">
                  <button className="btn btn-outline" onClick={() => setStep(1)}>
                    Back
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={() => setStep(3)}
                    disabled={!stepTwoReady}
                  >
                    Continue
                  </button>
                </div>
                {!stepTwoReady && (
                  <p className="form-hint">Choose destination, arrival date, and nationality so buddies can prepare.</p>
                )}
              </div>
            )}

            {/* Step 3: Interests & Languages */}
            {step === 3 && (
              <div className="form-step">
                <div className="form-group">
                  <label>What are you interested in? (Select all that apply)</label>
                  <div className="interests-grid">
                    {allInterests.map((interest) => (
                      <button
                        key={interest.id}
                        type="button"
                        className={`interest-card ${formData.interests.includes(interest.id) ? 'selected' : ''}`}
                        onClick={() => handleInterestToggle(interest.id)}
                      >
                        <span className="interest-icon">{interest.icon}</span>
                        <span className="interest-label">{interest.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Travel Style</label>
                  <div className="travel-style-grid">
                    {travelStyles.map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        className={`style-card ${formData.travelStyle === style.id ? 'selected' : ''}`}
                        onClick={() => setFormData({...formData, travelStyle: style.id})}
                      >
                        <span className="style-label">{style.label}</span>
                        <span className="style-desc">{style.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label>Languages You Speak</label>
                  <div className="languages-grid">
                    {languages.map((lang) => (
                      <button
                        key={lang.id}
                        type="button"
                        className={`language-btn ${formData.languages.includes(lang.id) ? 'selected' : ''}`}
                        onClick={() => handleLanguageToggle(lang.id)}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-actions">
                  <button className="btn btn-outline" onClick={() => setStep(2)}>
                    Back
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={!stepThreeReady}
                  >
                    Complete Registration
                  </button>
                </div>
                {!stepThreeReady && (
                  <p className="form-hint">Select at least one interest, one travel style, and one language.</p>
                )}
              </div>
            )}

            <div className="auth-footer">
              Already have an account? <Link to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Register
