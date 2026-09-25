import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './ProfileEdit.css'

const ProfileEdit = () => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'preferences' | 'profile' | 'account'>('preferences')

  const [preferences, setPreferences] = useState({
    interests: ['food', 'photography'] as string[],
    travelStyle: 'solo',
    languages: ['english'] as string[],
    budget: '50-100',
    tripDuration: '3-5',
    destination: 'da-nang'
  })

  const [profile, setProfile] = useState({
    fullName: 'John Traveler',
    email: 'john@example.com',
    phone: '+84 123 456 789',
    nationality: 'us',
    bio: 'Adventure seeker and photography enthusiast. Love exploring local cultures and authentic food.',
    avatar: null as string | null
  })

  const interests = [
    { id: 'food', label: 'Food & Dining', icon: '🍜' },
    { id: 'history', label: 'History & Culture', icon: '🏛️' },
    { id: 'nature', label: 'Nature & Adventure', icon: '🏔️' },
    { id: 'beach', label: 'Beach & Relaxation', icon: '🏖️' },
    { id: 'nightlife', label: 'Nightlife', icon: '🌃' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️' },
    { id: 'photography', label: 'Photography', icon: '📷' },
    { id: 'fitness', label: 'Fitness & Wellness', icon: '🧘' },
  ]

  const travelStyles = [
    { id: 'solo', label: 'Solo Travel', icon: '🎒' },
    { id: 'couple', label: 'Couple Trip', icon: '💑' },
    { id: 'friends', label: 'With Friends', icon: '👥' },
    { id: 'family', label: 'Family', icon: '👨‍👩‍👧' },
  ]

  const languages = [
    { id: 'english', label: 'English' },
    { id: 'vietnamese', label: 'Vietnamese' },
    { id: 'chinese', label: 'Chinese' },
    { id: 'japanese', label: 'Japanese' },
    { id: 'korean', label: 'Korean' },
    { id: 'french', label: 'French' },
  ]

  const destinations = [
    { id: 'da-nang', label: 'Da Nang' },
    { id: 'hoi-an', label: 'Hoi An' },
    { id: 'ha-long', label: 'Ha Long Bay' },
    { id: 'hanoi', label: 'Hanoi' },
    { id: 'nha-trang', label: 'Nha Trang' },
    { id: 'phu-quoc', label: 'Phu Quoc' },
  ]

  const handleInterestToggle = (id: string) => {
    setPreferences({
      ...preferences,
      interests: preferences.interests.includes(id)
        ? preferences.interests.filter(i => i !== id)
        : [...preferences.interests, id]
    })
  }

  const handleLanguageToggle = (id: string) => {
    setPreferences({
      ...preferences,
      languages: preferences.languages.includes(id)
        ? preferences.languages.filter(l => l !== id)
        : [...preferences.languages, id]
    })
  }

  const handleSave = () => {
    navigate('/matching')
  }

  return (
    <div className="profile-edit-page">
      {/* Header */}
      <header className="edit-header">
        <div className="container">
          <div className="header-nav">
            <Link to="/matching" className="back-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              Back to Matching
            </Link>
          </div>
          <h1>Edit Your Profile</h1>
          <p>Customize your preferences to get better buddy matches</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="edit-tabs-container">
        <div className="container">
          <div className="edit-tabs">
            <button 
              className={`edit-tab ${activeTab === 'preferences' ? 'active' : ''}`}
              onClick={() => setActiveTab('preferences')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
              Travel Preferences
            </button>
            <button 
              className={`edit-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              Profile Info
            </button>
            <button 
              className={`edit-tab ${activeTab === 'account' ? 'active' : ''}`}
              onClick={() => setActiveTab('account')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              Account
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="edit-content">
        <div className="container">
          <div className="edit-layout">
            {/* Main Content */}
            <div className="edit-main">
              {/* Travel Preferences Tab */}
              {activeTab === 'preferences' && (
                <div className="edit-section">
                  <div className="section-header">
                    <h2>Travel Preferences</h2>
                    <p>Help us find the perfect buddies for you</p>
                  </div>

                  {/* Destination */}
                  <div className="form-group">
                    <label>Where are you traveling?</label>
                    <select 
                      value={preferences.destination}
                      onChange={(e) => setPreferences({...preferences, destination: e.target.value})}
                    >
                      {destinations.map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Interests */}
                  <div className="form-group">
                    <label>What are you interested in? <span className="label-hint">(Select all that apply)</span></label>
                    <div className="interests-grid">
                      {interests.map(interest => (
                        <button
                          key={interest.id}
                          type="button"
                          className={`interest-card ${preferences.interests.includes(interest.id) ? 'selected' : ''}`}
                          onClick={() => handleInterestToggle(interest.id)}
                        >
                          <span className="interest-icon">{interest.icon}</span>
                          <span className="interest-label">{interest.label}</span>
                          {preferences.interests.includes(interest.id) && (
                            <span className="check-mark">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Travel Style */}
                  <div className="form-group">
                    <label>Your Travel Style</label>
                    <div className="style-grid">
                      {travelStyles.map(style => (
                        <button
                          key={style.id}
                          type="button"
                          className={`style-card ${preferences.travelStyle === style.id ? 'selected' : ''}`}
                          onClick={() => setPreferences({...preferences, travelStyle: style.id})}
                        >
                          <span className="style-icon">{style.icon}</span>
                          <span className="style-label">{style.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Languages */}
                  <div className="form-group">
                    <label>Languages You Speak</label>
                    <div className="languages-grid">
                      {languages.map(lang => (
                        <button
                          key={lang.id}
                          type="button"
                          className={`language-btn ${preferences.languages.includes(lang.id) ? 'selected' : ''}`}
                          onClick={() => handleLanguageToggle(lang.id)}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Budget */}
                  <div className="form-group">
                    <label>Daily Budget (per person)</label>
                    <div className="budget-options">
                      <label className={`budget-option ${preferences.budget === 'under-50' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="budget"
                          value="under-50"
                          checked={preferences.budget === 'under-50'}
                          onChange={(e) => setPreferences({...preferences, budget: e.target.value})}
                        />
                        <span className="budget-label">Under $50</span>
                      </label>
                      <label className={`budget-option ${preferences.budget === '50-100' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="budget"
                          value="50-100"
                          checked={preferences.budget === '50-100'}
                          onChange={(e) => setPreferences({...preferences, budget: e.target.value})}
                        />
                        <span className="budget-label">$50 - $100</span>
                      </label>
                      <label className={`budget-option ${preferences.budget === '100-200' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="budget"
                          value="100-200"
                          checked={preferences.budget === '100-200'}
                          onChange={(e) => setPreferences({...preferences, budget: e.target.value})}
                        />
                        <span className="budget-label">$100 - $200</span>
                      </label>
                      <label className={`budget-option ${preferences.budget === '200+' ? 'selected' : ''}`}>
                        <input
                          type="radio"
                          name="budget"
                          value="200+"
                          checked={preferences.budget === '200+'}
                          onChange={(e) => setPreferences({...preferences, budget: e.target.value})}
                        />
                        <span className="budget-label">$200+</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Profile Info Tab */}
              {activeTab === 'profile' && (
                <div className="edit-section">
                  <div className="section-header">
                    <h2>Profile Information</h2>
                    <p>Update your personal details</p>
                  </div>

                  <div className="avatar-upload">
                    <div className="avatar-preview">
                      <span>J</span>
                    </div>
                    <div className="avatar-actions">
                      <button type="button" className="btn btn-outline btn-sm">Upload Photo</button>
                      <button type="button" className="btn btn-text btn-sm">Remove</button>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        value={profile.fullName}
                        onChange={(e) => setProfile({...profile, fullName: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={profile.email}
                        onChange={(e) => setProfile({...profile, email: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Phone</label>
                      <input
                        type="tel"
                        value={profile.phone}
                        onChange={(e) => setProfile({...profile, phone: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Nationality</label>
                      <select
                        value={profile.nationality}
                        onChange={(e) => setProfile({...profile, nationality: e.target.value})}
                      >
                        <option value="us">United States</option>
                        <option value="uk">United Kingdom</option>
                        <option value="au">Australia</option>
                        <option value="sg">Singapore</option>
                        <option value="jp">Japan</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Bio</label>
                    <textarea
                      rows={4}
                      value={profile.bio}
                      onChange={(e) => setProfile({...profile, bio: e.target.value})}
                      placeholder="Tell buddies a bit about yourself..."
                    />
                    <span className="char-count">{profile.bio.length}/200</span>
                  </div>
                </div>
              )}

              {/* Account Tab */}
              {activeTab === 'account' && (
                <div className="edit-section">
                  <div className="section-header">
                    <h2>Account Settings</h2>
                    <p>Manage your account preferences</p>
                  </div>

                  <div className="account-option">
                    <div className="option-info">
                      <h3>Email Notifications</h3>
                      <p>Receive updates about new matches and messages</p>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="account-option">
                    <div className="option-info">
                      <h3>Location Services</h3>
                      <p>Allow app to access your location for nearby buddies</p>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="account-option">
                    <div className="option-info">
                      <h3>Push Notifications</h3>
                      <p>Receive push notifications for real-time updates</p>
                    </div>
                    <label className="toggle-switch">
                      <input type="checkbox" defaultChecked />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>

                  <div className="danger-zone">
                    <h3>Danger Zone</h3>
                    <div className="danger-action">
                      <div>
                        <h4>Delete Account</h4>
                        <p>Permanently delete your account and all data</p>
                      </div>
                      <button type="button" className="btn btn-danger-outline">Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sidebar */}
            <div className="edit-sidebar">
              <div className="sidebar-card">
                <h3>Matching Preview</h3>
                <p>Based on your preferences, we found:</p>
                
                <div className="preview-stats">
                  <div className="stat-item">
                    <span className="stat-value">{preferences.interests.length * 5 + 20}</span>
                    <span className="stat-label">Compatible Buddies</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-value">{preferences.languages.length}</span>
                    <span className="stat-label">Languages Matched</span>
                  </div>
                </div>

                <div className="preview-match">
                  <span className="match-label">Top Match</span>
                  <div className="match-buddy">
                    <div className="match-avatar">L</div>
                    <div className="match-info">
                      <span className="match-name">Lan Pham</span>
                      <span className="match-score">95% Match</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sidebar-actions">
                <button type="button" className="btn btn-primary btn-block" onClick={handleSave}>
                  Save Changes
                </button>
                <Link to="/matching" className="btn btn-outline btn-block">
                  Cancel
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProfileEdit
