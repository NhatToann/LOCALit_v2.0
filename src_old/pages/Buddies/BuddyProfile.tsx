import { useParams, Link } from 'react-router-dom'
import MiniMessenger from '../../components/MiniMessenger/MiniMessenger'
import './BuddyProfile.css'

const BuddyProfile = () => {
  const { id } = useParams()

  const specialties = ['Beach Walks', 'Food Tours', 'Photography', 'Cultural Tours', 'Local Cafes']

  const buddyProfiles = {
    '1': { name: 'Lan Pham', avatar: 'L', location: 'Da Nang, Vietnam', conversationId: 'conv_1', rating: 4.9, reviews: 156, languages: ['Vietnamese', 'English'], bio: 'I am a Da Nang local buddy who loves beach mornings, food stops, and simple routes that help travelers enjoy the city without stress.' },
    '2': { name: 'Minh Nguyen', avatar: 'M', location: 'Da Nang, Vietnam', conversationId: 'conv_2', rating: 4.8, reviews: 134, languages: ['Vietnamese', 'English', 'French'], bio: 'I help travelers find Da Nang photography spots, riverside cafes, and local stories around the city.' },
    '3': { name: 'Huy Nguyen', avatar: 'H', location: 'Hoi An, Vietnam', conversationId: 'conv_3', rating: 4.7, reviews: 98, languages: ['Vietnamese', 'English', 'Japanese'], bio: 'I focus on Hoi An culture walks, lantern streets, local food, and calm travel plans for first-time visitors.' },
    'lan-pham': { name: 'Lan Pham', avatar: 'L', location: 'Da Nang, Vietnam', conversationId: 'conv_1', rating: 4.9, reviews: 156, languages: ['Vietnamese', 'English'], bio: 'I am a Da Nang local buddy who loves beach mornings, food stops, and simple routes that help travelers enjoy the city without stress.' },
    'minh-nguyen': { name: 'Minh Nguyen', avatar: 'M', location: 'Da Nang, Vietnam', conversationId: 'conv_2', rating: 4.8, reviews: 134, languages: ['Vietnamese', 'English', 'French'], bio: 'I help travelers find Da Nang photography spots, riverside cafes, and local stories around the city.' },
    'huy-nguyen': { name: 'Huy Nguyen', avatar: 'H', location: 'Hoi An, Vietnam', conversationId: 'conv_3', rating: 4.7, reviews: 98, languages: ['Vietnamese', 'English', 'Japanese'], bio: 'I focus on Hoi An culture walks, lantern streets, local food, and calm travel plans for first-time visitors.' }
  }

  const profile = buddyProfiles[id as keyof typeof buddyProfiles] || buddyProfiles['1']

  const buddy = {
    id: id || '1',
    name: profile.name,
    avatar: profile.avatar,
    location: profile.location,
    rating: profile.rating,
    reviews: profile.reviews,
    languages: profile.languages.map((language, index) => ({ name: language, level: index === 0 ? 'Native' : 'Fluent' })),
    bio: profile.bio,
    joined: '2023',
    responseTime: 'Within 1 hour',
    responseRate: 98,
    tripsCompleted: 120,
    tripsThisMonth: 8,
    happyTourists: 340,
    repeatCustomers: 28,
    averageRating: 4.9,
    specialties,
    availability: 'Available Today',
    responseTimeDetail: 'Last responded 15 minutes ago',
    memberSince: 'March 2023',
    lastActive: 'Active now'
  }

  const reviews = [
    { id: 1, tourist: 'John D.', date: 'Jul 2026', rating: 5, comment: `${buddy.name.split(' ')[0]} made the route easy to follow and explained every stop clearly.` },
    { id: 2, tourist: 'Sarah M.', date: 'Jun 2026', rating: 5, comment: 'Friendly, practical, and great for first-time travelers.' },
    { id: 3, tourist: 'Mike R.', date: 'May 2026', rating: 4, comment: 'Great local tips and smooth communication.' },
  ]

  return (
    <div className="buddy-profile-page">
      <section className="profile-hero">
        <div className="container">
          <div className="profile-header">
            <div className="profile-avatar">
              {buddy.avatar}
            </div>
            <div className="profile-info">
              <h1>{buddy.name}</h1>
              <p className="profile-location">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {buddy.location}
              </p>
              <div className="profile-meta">
                <span className="rating">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  {buddy.rating} ({buddy.reviews} reviews)
                </span>
                <span>Member since {buddy.memberSince}</span>
              </div>
            </div>
            <div className="profile-actions">
              <MiniMessenger
                buddy={{
                  id: buddy.id,
                  name: buddy.name,
                  avatar: buddy.avatar,
                  isOnline: true,
                  subtitle: buddy.lastActive
                }}
                buttonClassName="btn btn-outline"
                buttonLabel="Message"
              />
              <MiniMessenger
                buddy={{
                  id: buddy.id,
                  name: buddy.name,
                  avatar: buddy.avatar,
                  isOnline: true,
                  subtitle: buddy.responseTimeDetail
                }}
                buttonClassName="btn btn-primary"
                buttonLabel="Send Message"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="profile-content">
        <div className="container">
          <div className="profile-layout">
            <div className="profile-main">
              {/* About */}
              <div className="content-section">
                <h2>About Me</h2>
                <p className="bio">{buddy.bio}</p>
              </div>

              {/* Specialties */}
              <div className="content-section">
                <h2>Specialties</h2>
                <div className="specialties-list">
                  {specialties.map((specialty) => (
                    <span key={specialty} className="specialty-tag">{specialty}</span>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div className="content-section">
                <h2>Languages</h2>
                <div className="languages-list">
                  {buddy.languages.map((lang) => (
                    <div key={lang.name} className="language-item">
                      <span className="language-name">{lang.name}</span>
                      <span className={`language-level ${lang.level.toLowerCase()}`}>{lang.level}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviews */}
              <div className="content-section">
                <h2>Reviews ({buddy.reviews})</h2>
                <div className="reviews-list">
                  {reviews.map((review) => (
                    <div key={review.id} className="review-card">
                      <div className="review-header">
                        <div className="reviewer-avatar">{review.tourist.charAt(0)}</div>
                        <div className="reviewer-info">
                          <span className="reviewer-name">{review.tourist}</span>
                          <span className="review-date">{review.date}</span>
                        </div>
                        <div className="review-rating">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <svg key={star} width="14" height="14" viewBox="0 0 24 24" fill={star <= review.rating ? '#FFB347' : 'none'} stroke="#FFB347" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                          ))}
                        </div>
                      </div>
                      <p className="review-comment">{review.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="profile-sidebar">
              {/* Quick Stats - Detailed */}
              <div className="stats-card">
                <h3>Quick Stats</h3>
                
                {/* Main Stats */}
                <div className="stats-main">
                  <div className="stat-highlight">
                    <span className="stat-highlight-value">{buddy.tripsCompleted}</span>
                    <span className="stat-highlight-label">Trips Completed</span>
                  </div>
                </div>

                {/* Availability Status */}
                <div className="availability-badge">
                  <span className="availability-dot"></span>
                  <span className="availability-text">{buddy.availability}</span>
                </div>

                {/* Detailed Stats */}
                <div className="stats-details">
                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                      <span className="stat-row-label">Response Time</span>
                    </div>
                    <span className="stat-row-value">{buddy.responseTime}</span>
                  </div>
                  
                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
                      </svg>
                      <span className="stat-row-label">Response Rate</span>
                    </div>
                    <span className="stat-row-value">{buddy.responseRate}%</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      <span className="stat-row-label">Happy Tourists</span>
                    </div>
                    <span className="stat-row-value">{buddy.happyTourists}+</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                      </svg>
                      <span className="stat-row-label">Repeat Customers</span>
                    </div>
                    <span className="stat-row-value">{buddy.repeatCustomers}%</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                      <span className="stat-row-label">Average Rating</span>
                    </div>
                    <span className="stat-row-value">
                      <span className="rating-stars">{buddy.averageRating}</span>
                    </span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                        <line x1="16" y1="2" x2="16" y2="6"/>
                        <line x1="8" y1="2" x2="8" y2="6"/>
                        <line x1="3" y1="10" x2="21" y2="10"/>
                      </svg>
                      <span className="stat-row-label">This Month</span>
                    </div>
                    <span className="stat-row-value">{buddy.tripsThisMonth} trips</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                      </svg>
                      <span className="stat-row-label">Last Active</span>
                    </div>
                    <span className="stat-row-value active">{buddy.lastActive}</span>
                  </div>

                  <div className="stat-row">
                    <div className="stat-row-left">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                      <span className="stat-row-label">Languages</span>
                    </div>
                    <span className="stat-row-value">{buddy.languages.length}</span>
                  </div>
                </div>

                {/* Response Time Detail */}
                <div className="response-time-detail">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <span>{buddy.responseTimeDetail}</span>
                </div>
              </div>

            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}

export default BuddyProfile
