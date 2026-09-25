import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Dashboard.css'

const BuddyDashboard = () => {
  const [status, setStatus] = useState('')
  const stats = [
    { label: 'Total Earnings', value: '$1,250', icon: '💰', color: '#28A745' },
    { label: 'Total Trips', value: '15', icon: '🧳', color: '#FF6B35' },
    { label: 'Pending Requests', value: '3', icon: '📋', color: '#17A2B8' },
    { label: 'Average Rating', value: '4.9', icon: '⭐', color: '#FFC107' },
  ]

  const pendingRequests = [
    { id: 1, tourist: 'John Doe', location: 'Da Nang', date: '2026-08-15', duration: '3 days' },
    { id: 2, tourist: 'Sarah Smith', location: 'Da Nang', date: '2026-08-22', duration: '2 days' },
    { id: 3, tourist: 'Mike Johnson', location: 'Hoi An', date: '2026-09-02', duration: '4 days' },
  ]

  const upcomingTrips = [
    { id: 1, tourist: 'Emily Davis', location: 'Da Nang', date: '2026-08-05', status: 'Confirmed' },
    { id: 2, tourist: 'Chris Lee', location: 'Da Nang', date: '2026-08-18', status: 'Pending' },
  ]

  return (
    <div className="dashboard-page">
      <section className="dashboard-header">
        <div className="container">
          <div className="header-content">
            <div className="welcome-section">
              <h1>Welcome, Minh!</h1>
              <p>You have 3 new booking requests</p>
            </div>
            <div className="header-actions">
              <Link to="/buddy/requests" className="btn btn-primary">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                View Requests
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
            {/* Pending Requests */}
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Pending Requests</h2>
                <Link to="/buddy/requests" className="view-all">View All</Link>
              </div>
              <div className="requests-list">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="request-item">
                    <div className="request-avatar">
                      {request.tourist.charAt(0)}
                    </div>
                    <div className="request-info">
                      <h3>{request.tourist}</h3>
                      <p className="request-details">
                        <span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          {request.location}
                        </span>
                        <span>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                            <line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/>
                          </svg>
                          {request.date}
                        </span>
                      </p>
                    </div>
                    <div className="request-actions">
                      <Link to="/buddy/requests" className="btn btn-primary btn-sm">Review</Link>
                      <Link to="/buddy/requests" className="btn btn-outline btn-sm">Decide</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Upcoming Trips */}
            <div className="dashboard-card">
              <div className="card-header">
                <h2>Upcoming Trips</h2>
              </div>
              <div className="trips-list">
                {upcomingTrips.map((trip) => (
                  <div key={trip.id} className="trip-item">
                    <div className="trip-info">
                      <h3>{trip.tourist}</h3>
                      <span className="trip-date">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {trip.location}
                      </span>
                      <span className="trip-date">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                          <line x1="16" y1="2" x2="16" y2="6"/>
                        </svg>
                        {trip.date}
                      </span>
                    </div>
                    <div className="trip-status">
                      <span className={`status-badge ${trip.status.toLowerCase()}`}>
                        {trip.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <h2>Quick Actions</h2>
            {status && <div className="mvp-message info">{status}</div>}
            <div className="actions-grid">
              <Link to="/profile" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <h3>Edit Profile</h3>
                <p>Update your availability</p>
              </Link>
              <Link to="/buddies" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </div>
                <h3>View Reviews</h3>
                <p>Check your ratings</p>
              </Link>
              <Link to="/map-search" className="action-card">
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                <h3>Area Map</h3>
                <p>View your service area</p>
              </Link>
              <button className="action-card" onClick={() => setStatus('Schedule management is planned for the next MVP iteration. Use Requests to confirm available dates for now.')}>
                <div className="action-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <h3>Set Schedule</h3>
                <p>Manage availability</p>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default BuddyDashboard
