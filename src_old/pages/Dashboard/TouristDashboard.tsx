import { Link } from 'react-router-dom'
import './Dashboard.css'

const TouristDashboard = () => {
  const stats = [
    { label: 'Total Trips', value: '12', icon: '🧳', color: '#FF6B35' },
    { label: 'Upcoming', value: '3', icon: '📅', color: '#17A2B8' },
    { label: 'Saved Buddies', value: '8', icon: '👥', color: '#28A745' },
    { label: 'Reviews', value: '5', icon: '⭐', color: '#FFC107' },
  ]

  const recentTrips = [
    { id: 1, name: 'Da Nang Beach Adventure', date: '2026-08-15', status: 'Upcoming', buddy: 'Lan Pham' },
    { id: 2, name: 'Hoi An Lantern Night', date: '2026-09-02', status: 'Planning', buddy: 'Huy Nguyen' },
    { id: 3, name: 'Saigon Food Discovery', date: '2026-06-10', status: 'Completed', buddy: 'Minh Tran' },
  ]

  const suggestedBuddies = [
    { id: 1, name: 'Lan Pham', location: 'Da Nang', rating: 4.9, languages: ['English', 'Vietnamese'] },
    { id: 2, name: 'Minh Nguyen', location: 'Da Nang', rating: 4.8, languages: ['English', 'French'] },
    { id: 3, name: 'Huy Nguyen', location: 'Hoi An', rating: 4.7, languages: ['English', 'Japanese'] },
  ]

  return (
    <div className="dashboard-page">
      <section className="dashboard-header">
        <div className="container">
          <div className="header-content">
            <div className="welcome-section">
              <h1>Welcome back, John!</h1>
              <p>Ready for your next adventure?</p>
            </div>
            <div className="header-actions">
              <Link to="/trip/create" className="btn btn-outline">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Trip
              </Link>
              <Link to="/trip/ai-generate" className="btn btn-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
                AI Generate
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-content">
        <div className="container">
          {/* Stats Cards */}
          <div className="stats-grid">
            {stats.map((stat, index) => (
              <div key={index} className="stat-card" style={{ '--accent-color': stat.color } as React.CSSProperties}>
                <div className="stat-icon">{stat.icon}</div>
                <div className="stat-info">
                  <span className="stat-value">{stat.value}</span>
                  <span className="stat-label">{stat.label}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-grid">
            {/* Recent Trips */}
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Recent Trips</h2>
                <Link to="/trips" className="view-all">View All</Link>
              </div>
              <div className="trips-list">
                {recentTrips.map((trip) => (
                  <div key={trip.id} className="trip-item">
                    <div className="trip-info">
                      <h3>{trip.name}</h3>
                      <span className="trip-date">{trip.date}</span>
                      {trip.buddy && (
                        <span className="trip-buddy">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                            <circle cx="12" cy="7" r="4"/>
                          </svg>
                          {trip.buddy}
                        </span>
                      )}
                    </div>
                    <div className="trip-status">
                      <span className={`status-badge ${trip.status.toLowerCase()}`}>
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

            {/* Suggested Buddies */}
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Suggested Buddies</h2>
                <Link to="/buddies" className="view-all">View All</Link>
              </div>
              <div className="buddies-list">
                {suggestedBuddies.map((buddy) => (
                  <div key={buddy.id} className="buddy-item">
                    <div className="buddy-avatar">
                      {buddy.name.charAt(0)}
                    </div>
                    <div className="buddy-info">
                      <h3>{buddy.name}</h3>
                      <p className="buddy-location">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {buddy.location}
                      </p>
                      <div className="buddy-meta">
                        <span className="buddy-rating">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          {buddy.rating}
                        </span>
                        <span className="buddy-lang">{buddy.languages[0]}</span>
                      </div>
                    </div>
                    <Link to={`/buddies/${buddy.id}`} className="btn btn-outline btn-sm">
                      View
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h2>Quick Actions</h2>
            <div className="actions-grid">
              <Link to="/map-search" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <h3>Map Search</h3>
                <p>Find buddies near you</p>
              </Link>
              <Link to="/cities" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                    <polyline points="9 22 9 12 15 12 15 22"/>
                  </svg>
                </div>
                <h3>Explore</h3>
                <p>Discover new destinations</p>
              </Link>
              <Link to="/buddies" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                </div>
                <h3>Find Buddies</h3>
                <p>Connect with locals</p>
              </Link>
              <Link to="/review/1" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <h3>Write Review</h3>
                <p>Share your experience</p>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default TouristDashboard
