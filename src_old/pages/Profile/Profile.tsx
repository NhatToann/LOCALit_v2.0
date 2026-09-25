import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Profile.css'

const PROFILE_INTERESTS_KEY = 'localit.profile.interests'
const defaultProfileInterests = ['Beach', 'Food', 'Beautiful View']
const PROFILE_DATA_KEY = 'localit.profile.data'

const defaultUser = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '+84 123 456 789',
  dateOfBirth: '1995-06-15',
  address: '123 Nguyen Hue Street, District 1',
  bio: 'Passionate traveler who loves exploring new cultures and meeting local people.',
  role: 'Tourist',
  avatar: null as string | null
}

const Profile = () => {
  const [activeTab, setActiveTab] = useState('personal')
  const [isEditing, setIsEditing] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [actionStatus, setActionStatus] = useState('')
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(PROFILE_DATA_KEY)
    return saved ? JSON.parse(saved) as typeof defaultUser : defaultUser
  })

  const baseInterests = [
    'Beach', 'Mountain', 'Food', 'Nightlife', 'Beautiful View', 'Cultural',
    'Historical', 'Shopping', 'Adventure', 'Sunset', 'Photography', 'Nature',
    'Local Culture', 'Architecture', 'Relaxation', 'Water Sports'
  ]

  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => {
    const saved = localStorage.getItem(PROFILE_INTERESTS_KEY)
    return saved ? JSON.parse(saved) : defaultProfileInterests
  })

  const allInterests = Array.from(new Set([...baseInterests, ...selectedInterests]))

  useEffect(() => {
    localStorage.setItem(PROFILE_INTERESTS_KEY, JSON.stringify(selectedInterests))
  }, [selectedInterests])

  const toggleInterest = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest))
    } else {
      setSelectedInterests([...selectedInterests, interest])
    }
  }

  const updateUser = (field: keyof typeof defaultUser, value: string) => {
    setSaveStatus('')
    setUser((current) => ({ ...current, [field]: value }))
  }

  const saveProfile = () => {
    localStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(user))
    setIsEditing(false)
    setSaveStatus('Profile changes saved for this demo.')
  }

  const savedTrips = [
    { id: 1, name: 'Da Nang Beach Adventure', date: '2026-08-15', status: 'Upcoming' },
    { id: 2, name: 'Hoi An Lantern Night', date: '2026-09-02', status: 'Planning' },
  ]

  const savedBuddies = [
    { id: 1, name: 'Lan Pham', location: 'Da Nang', rating: 4.9, languages: ['English', 'Vietnamese'] },
    { id: 2, name: 'Minh Nguyen', location: 'Da Nang', rating: 4.8, languages: ['English', 'French'] },
  ]

  const reviews = [
    { id: 1, trip: 'Da Nang Beach Adventure', rating: 5, comment: 'Amazing experience!', date: '2026-06-16' },
  ]

  const reviewsAboutMe = [
    { id: 1, reviewerName: 'Sarah M.', reviewerAvatar: 'S', trip: 'Da Nang Tour', rating: 5, comment: 'John was a wonderful tourist! Very respectful and fun to be with.', date: '2026-06-01' },
    { id: 2, reviewerName: 'Minh L.', reviewerAvatar: 'M', trip: 'Hue Imperial City', rating: 4, comment: 'Great experience together!', date: '2026-05-20' },
  ]

  return (
    <div className="profile-page">
      {/* Page Header */}
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">My Profile</h1>
        </div>
      </section>

      {/* Profile Content */}
      <section className="profile-content">
        <div className="container">
          <div className="profile-layout">
            {/* Profile Main Content - Center */}
            <div className="profile-main">
              <div className="content-card">
                {/* Personal Info Tab */}
                {activeTab === 'personal' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Personal Information</h2>
                      {isEditing && <button type="button" className="btn btn-primary" onClick={saveProfile}>Save Changes</button>}
                    </div>
                    {saveStatus && <div className="mvp-message success">{saveStatus}</div>}
                    
                    <form className="profile-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Full Name</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={user.firstName} 
                            onChange={(event) => updateUser('firstName', event.target.value)}
                            disabled={!isEditing}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Last Name</label>
                          <input 
                            type="text" 
                            className="form-input" 
                            value={user.lastName} 
                            onChange={(event) => updateUser('lastName', event.target.value)}
                            disabled={!isEditing}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input 
                          type="email" 
                          className="form-input" 
                          value={user.email} 
                          onChange={(event) => updateUser('email', event.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Phone</label>
                        <input 
                          type="tel" 
                          className="form-input" 
                          value={user.phone} 
                          onChange={(event) => updateUser('phone', event.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Date of Birth</label>
                        <input 
                          type="date" 
                          className="form-input" 
                          value={user.dateOfBirth} 
                          onChange={(event) => updateUser('dateOfBirth', event.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Address</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          value={user.address} 
                          onChange={(event) => updateUser('address', event.target.value)}
                          disabled={!isEditing}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Bio</label>
                        <textarea 
                          className="form-input form-textarea" 
                          rows={4}
                          value={user.bio} 
                          onChange={(event) => updateUser('bio', event.target.value)}
                          disabled={!isEditing}
                        />
                      </div>
                    </form>
                  </div>
                )}

                {/* My Trips Tab */}
                {activeTab === 'trips' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>My Trips</h2>
                      <Link to="/trip/create" className="btn btn-primary">
                        Create New Trip
                      </Link>
                    </div>
                    
                    <div className="trips-list">
                      {savedTrips.map((trip) => (
                        <div key={trip.id} className="trip-item">
                          <div className="trip-info">
                            <h3>{trip.name}</h3>
                            <span className="trip-date">{trip.date}</span>
                          </div>
                          <div className="trip-actions">
                            <span className={`trip-status ${trip.status.toLowerCase()}`}>
                              {trip.status}
                            </span>
                            <Link to={`/trip/${trip.id}`} className="btn btn-outline btn-sm">
                              View
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Saved Buddies Tab */}
                {activeTab === 'buddies' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Saved Buddies</h2>
                      <Link to="/buddies" className="btn btn-primary">
                        Find More Buddies
                      </Link>
                    </div>
                    
                    <div className="buddies-grid">
                      {savedBuddies.map((buddy) => (
                        <div key={buddy.id} className="buddy-card">
                          <div className="buddy-avatar">
                            <span>{buddy.name.charAt(0)}</span>
                          </div>
                          <div className="buddy-info">
                            <h3>{buddy.name}</h3>
                            <p className="buddy-location">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                              </svg>
                              {buddy.location}
                            </p>
                            <div className="buddy-rating">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                              {buddy.rating}
                            </div>
                            <div className="buddy-languages">
                              {buddy.languages.map((lang) => (
                                <span key={lang} className="language-tag">{lang}</span>
                              ))}
                            </div>
                          </div>
                          <Link to={`/buddies/${buddy.id}`} className="btn btn-outline btn-sm btn-full">
                            View Profile
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reviews Tab */}
                {activeTab === 'reviews' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>My Reviews</h2>
                    </div>
                    
                    <div className="reviews-section">
                      <h3 className="reviews-subtitle">Reviews I Wrote</h3>
                      <div className="reviews-list">
                        {reviews.map((review) => (
                          <div key={review.id} className="review-item">
                            <div className="review-header">
                              <h3>{review.trip}</h3>
                              <span className="review-date">{review.date}</span>
                            </div>
                            <div className="review-rating">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg key={star} width="16" height="16" viewBox="0 0 24 24" fill={star <= review.rating ? '#FFB347' : 'none'} stroke="#FFB347" strokeWidth="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              ))}
                            </div>
                            <p className="review-comment">{review.comment}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="reviews-section">
                      <h3 className="reviews-subtitle">Reviews About Me</h3>
                      <div className="reviews-list">
                        {reviewsAboutMe.map((review) => (
                          <div key={review.id} className="review-item about-me">
                            <div className="review-header">
                              <div className="reviewer-info-inline">
                                <div className="reviewer-avatar-small">{review.reviewerAvatar}</div>
                                <div>
                                  <h3>{review.reviewerName}</h3>
                                  <span className="review-trip">{review.trip}</span>
                                </div>
                              </div>
                              <span className="review-date">{review.date}</span>
                            </div>
                            <div className="review-rating">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <svg key={star} width="16" height="16" viewBox="0 0 24 24" fill={star <= review.rating ? '#FFB347' : 'none'} stroke="#FFB347" strokeWidth="2">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              ))}
                            </div>
                            <p className="review-comment">{review.comment}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Interests Tab */}
                {activeTab === 'interests' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>My Interests</h2>
                      <p className="panel-desc">Select interests to help match you with the right buddies</p>
                    </div>
                    
                    <div className="interests-section">
                      <div className="interests-grid">
                        {allInterests.map((interest) => (
                          <button
                            key={interest}
                            className={`interest-tag ${selectedInterests.includes(interest) ? 'selected' : ''}`}
                            onClick={() => toggleInterest(interest)}
                            type="button"
                          >
                            {interest}
                          </button>
                        ))}
                      </div>
                      
                      <div className="selected-interests-info">
                        <h3>Selected Interests ({selectedInterests.length})</h3>
                        <p className="interests-hint">
                          These interests will be used to match you with compatible buddies
                        </p>
                        <div className="selected-tags">
                          {selectedInterests.map((interest) => (
                            <span key={interest} className="selected-tag">{interest}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Settings Tab */}
                {activeTab === 'settings' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Settings</h2>
                    </div>
                    
                    <div className="settings-section">
                      <h3>Notifications</h3>
                      <div className="setting-item">
                        <div>
                          <span className="setting-label">Email notifications</span>
                          <span className="setting-desc">Receive updates about your trips</span>
                        </div>
                        <label className="toggle">
                          <input type="checkbox" defaultChecked />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                      <div className="setting-item">
                        <div>
                          <span className="setting-label">Push notifications</span>
                          <span className="setting-desc">Receive push notifications</span>
                        </div>
                        <label className="toggle">
                          <input type="checkbox" defaultChecked />
                          <span className="toggle-slider"></span>
                        </label>
                      </div>
                    </div>

                    <div className="settings-section">
                      <h3>Privacy</h3>
                      <div className="setting-item">
                        <div>
                          <span className="setting-label">Profile visibility</span>
                          <span className="setting-desc">Who can see your profile</span>
                        </div>
                        <select className="form-input setting-select">
                          <option>Everyone</option>
                          <option>Friends only</option>
                          <option>Private</option>
                        </select>
                      </div>
                    </div>

                    <div className="settings-section danger">
                      <h3>Danger Zone</h3>
                  <button className="btn btn-danger">Delete Account</button>
                  <p className="form-hint">Account deletion is disabled in the MVP demo.</p>
                </div>
                  </div>
                )}
              </div>
            </div>

            {/* Profile Card - Right Sidebar */}
            <aside className="profile-sidebar">
              <div className="profile-card">
                <div className="profile-avatar">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.firstName} />
                  ) : (
                    <span className="avatar-placeholder">{user.firstName.charAt(0)}</span>
                  )}
                  <button className="edit-avatar-btn" type="button" onClick={() => setActionStatus('Avatar upload is a demo placeholder. Use Profile Edit for preference changes.')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </button>
                </div>
                <h2 className="profile-name">{user.firstName} {user.lastName}</h2>
                <span className="profile-role">{user.role}</span>
                {actionStatus && <div className="mvp-message info">{actionStatus}</div>}
                
                <button 
                  className={`btn ${isEditing ? 'btn-secondary' : 'btn-outline'} edit-btn`}
                  onClick={() => {
                    setIsEditing(!isEditing)
                    setSaveStatus('')
                  }}
                >
                  {isEditing ? 'Cancel' : 'Edit Profile'}
                </button>

                <nav className="profile-nav">
                  <button 
                    className={`nav-item ${activeTab === 'personal' ? 'active' : ''}`}
                    onClick={() => setActiveTab('personal')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                      <circle cx="12" cy="7" r="4"/>
                    </svg>
                    Personal Info
                  </button>
                  <button 
                    className={`nav-item ${activeTab === 'trips' ? 'active' : ''}`}
                    onClick={() => setActiveTab('trips')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                      <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    My Trips
                  </button>
                  <button 
                    className={`nav-item ${activeTab === 'buddies' ? 'active' : ''}`}
                    onClick={() => setActiveTab('buddies')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                      <circle cx="9" cy="7" r="4"/>
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    Saved Buddies
                  </button>
                  <button 
                    className={`nav-item ${activeTab === 'reviews' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reviews')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    Reviews
                  </button>
                  <button 
                    className={`nav-item ${activeTab === 'interests' ? 'active' : ''}`}
                    onClick={() => setActiveTab('interests')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    Interests
                  </button>
                  <button 
                    className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
                    onClick={() => setActiveTab('settings')}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                    </svg>
                    Settings
                  </button>
                </nav>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Profile
