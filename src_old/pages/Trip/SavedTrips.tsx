import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import './Trip.css'

const SavedTrips = () => {
  const [activeFilter, setActiveFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const trips = [
    { id: 1, name: 'Da Nang Beach Adventure', destination: 'Da Nang', date: '2026-08-15', status: 'Upcoming', buddy: 'Lan Pham' },
    { id: 2, name: 'Hoi An Lantern Night', destination: 'Hoi An', date: '2026-09-02', status: 'Planning', buddy: 'Huy Nguyen' },
    { id: 3, name: 'Sapa Mountain Trek', destination: 'Lao Cai', date: '2026-06-10', status: 'Completed', buddy: 'Linh Tran' },
    { id: 4, name: 'Ho Chi Minh City Discovery', destination: 'Ho Chi Minh', date: '2026-05-05', status: 'Completed', buddy: 'Huy Nguyen' },
  ]

  const filterOptions = ['All', 'Upcoming', 'Planning', 'Completed']
  const visibleTrips = useMemo(() => trips.filter((trip) => {
    const matchesFilter = activeFilter === 'All' || trip.status === activeFilter
    const query = searchQuery.toLowerCase().trim()
    const matchesSearch = !query || [trip.name, trip.destination, trip.status, trip.buddy || ''].join(' ').toLowerCase().includes(query)

    return matchesFilter && matchesSearch
  }), [activeFilter, searchQuery])

  return (
    <div className="saved-trips-page">
      <section className="page-header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1 className="page-title">My Trips</h1>
              <p className="page-subtitle">Manage your travel itineraries</p>
            </div>
            <Link to="/trip/create" className="btn btn-primary">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Create New Trip
            </Link>
          </div>
        </div>
      </section>

      <section className="trips-content profile-style-trips">
        <div className="container">
          <div className="saved-profile-card">
            <div className="saved-profile-panel">
              <div className="saved-profile-header">
                <h2>My Trips</h2>
                <Link to="/trip/create" className="btn btn-primary">
                  Create New Trip
                </Link>
              </div>

              <div className="saved-profile-tools">
                <div className="filter-tabs">
                  {filterOptions.map((option) => (
                    <button
                      key={option}
                      className={`filter-tab ${activeFilter === option ? 'active' : ''}`}
                      onClick={() => setActiveFilter(option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <div className="search-box">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Search trips..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </div>
              </div>

              {visibleTrips.length > 0 ? (
                <div className="profile-trips-list">
                  {visibleTrips.map((trip) => (
                    <div key={trip.id} className="profile-trip-item">
                      <div className="profile-trip-info">
                        <h3>{trip.name}</h3>
                        <span className="profile-trip-date">{trip.date}</span>
                      </div>
                      <div className="profile-trip-actions">
                        <span className={`profile-trip-status ${trip.status.toLowerCase()}`}>
                          {trip.status}
                        </span>
                        <Link to={`/trip/${trip.id}`} className="btn btn-outline btn-sm">
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <h3>No trips found</h3>
                  <p>Try a different status or search keyword.</p>
                  <button className="btn btn-outline" onClick={() => { setActiveFilter('All'); setSearchQuery('') }}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default SavedTrips
