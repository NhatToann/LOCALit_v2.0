import { useState } from 'react'
import { Link } from 'react-router-dom'
import './MapSearch.css'

const MapSearch = () => {
  const [selectedMarker, setSelectedMarker] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [priceRange, setPriceRange] = useState('')
  const [language, setLanguage] = useState('')

  // Buddies with coordinates in Da Nang area
  const nearbyBuddies = [
    { 
      id: 1, 
      name: 'Lan Pham', 
      location: 'My Khe Beach', 
      lat: 16.0544, 
      lng: 108.2023, 
      rating: 4.9, 
      price: 45,
      type: 'buddy',
      languages: ['English', 'Vietnamese'] 
    },
    { 
      id: 2, 
      name: 'Minh Nguyen', 
      location: 'Han River', 
      lat: 16.0678, 
      lng: 108.2108, 
      rating: 4.8, 
      price: 50,
      type: 'buddy',
      languages: ['English', 'French'] 
    },
    { 
      id: 3, 
      name: 'Huy Nguyen', 
      location: 'Hoi An', 
      lat: 15.8801, 
      lng: 108.3380, 
      rating: 4.7, 
      price: 40,
      type: 'buddy',
      languages: ['English', 'Japanese'] 
    },
    { 
      id: 4, 
      name: 'Thu Ha', 
      location: 'Son Tra', 
      lat: 16.0933, 
      lng: 108.2506, 
      rating: 4.9, 
      price: 55,
      type: 'buddy',
      languages: ['English', 'Korean'] 
    },
  ]

  // Tourists with coordinates
  const nearbyTourists = [
    { 
      id: 101, 
      name: 'Sarah M.', 
      location: 'Dragon Bridge', 
      lat: 16.0597, 
      lng: 108.2242, 
      type: 'tourist',
      interests: ['Photography', 'Food'] 
    },
    { 
      id: 102, 
      name: 'John D.', 
      location: 'Marble Mountains', 
      lat: 16.0017, 
      lng: 108.2670, 
      type: 'tourist',
      interests: ['Culture', 'History'] 
    },
    { 
      id: 103, 
      name: 'Emily R.', 
      location: 'Ba Na Hills', 
      lat: 15.9951, 
      lng: 107.9868, 
      type: 'tourist',
      interests: ['Nature', 'Adventure'] 
    },
  ]

  const query = searchQuery.toLowerCase().trim()
  const visibleBuddies = nearbyBuddies.filter((buddy) => {
    const matchesSearch = !query || [buddy.name, buddy.location, ...buddy.languages].join(' ').toLowerCase().includes(query)
    const matchesLanguage = !language || buddy.languages.some((item) => item.toLowerCase().startsWith(language))
    const matchesPrice = !priceRange ||
      (priceRange === '0-40' && buddy.price <= 40) ||
      (priceRange === '40-60' && buddy.price >= 40 && buddy.price <= 60) ||
      (priceRange === '60+' && buddy.price > 60)

    return matchesSearch && matchesLanguage && matchesPrice
  })
  const visibleTourists = nearbyTourists.filter((tourist) => (
    !query || [tourist.name, tourist.location, ...tourist.interests].join(' ').toLowerCase().includes(query)
  ))
  const allMarkers = [...visibleBuddies, ...visibleTourists]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
  }

  return (
    <div className="map-search-page">
      <section className="map-header">
        <div className="container">
          <h1 className="page-title">Map Search</h1>
          <p className="page-subtitle">Find Tourists and Local Buddies in Da Nang</p>
        </div>
      </section>

      <section className="map-content">
        <div className="map-layout">
          {/* Buddy List Sidebar */}
          <aside className="map-sidebar">
            <div className="search-form">
              <form onSubmit={handleSearch}>
                <div className="search-input-wrapper">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                  <input 
                    type="text" 
                    placeholder="Search in Da Nang..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </form>
            </div>

            <div className="nearby-section">
              <h3>Nearby Buddies</h3>
              <div className="nearby-list">
                {visibleBuddies.map((buddy) => (
                  <div 
                    key={buddy.id} 
                    className={`nearby-item ${selectedMarker === buddy.id ? 'selected' : ''}`}
                    onClick={() => setSelectedMarker(buddy.id)}
                  >
                    <div className="buddy-avatar">{buddy.name.charAt(0)}</div>
                    <div className="buddy-info">
                      <h4>{buddy.name}</h4>
                      <p className="location">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {buddy.location}
                      </p>
                      <div className="buddy-meta">
                        <span className="rating">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                          </svg>
                          {buddy.rating} · ${buddy.price}/day
                        </span>
                        <div className="buddy-languages">
                          {buddy.languages.slice(0, 2).map((lang) => (
                            <span key={lang} className="lang-tag">{lang}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <Link to={`/buddies/${buddy.id}`} className="btn btn-outline btn-sm">
                      View
                    </Link>
                  </div>
                ))}
                {visibleBuddies.length === 0 && (
                  <div className="empty-state">
                    <p>No buddies match your filters.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="nearby-section">
              <h3>Nearby Tourists</h3>
              <div className="nearby-list">
                {visibleTourists.map((tourist) => (
                  <div 
                    key={tourist.id} 
                    className={`nearby-item tourist-item ${selectedMarker === tourist.id ? 'selected' : ''}`}
                    onClick={() => setSelectedMarker(tourist.id)}
                  >
                    <div className="buddy-avatar tourist-avatar">{tourist.name.charAt(0)}</div>
                    <div className="buddy-info">
                      <h4>{tourist.name}</h4>
                      <p className="location">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {tourist.location}
                      </p>
                      <div className="buddy-meta">
                        <div className="interest-tags">
                          {tourist.interests.map(interest => (
                            <span key={interest} className="interest-tag-small">{interest}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {visibleTourists.length === 0 && (
                  <div className="empty-state">
                    <p>No tourists match your search.</p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Map Area */}
          <div className="map-area">
            <div className="map-container">
              <iframe
                title="Da Nang Map"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3833.9225758!2d108.2022973!3d16.0544068!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31420f91c1340f23%3A0xc4f8e3b8a9b23f1e!2zQ-G6o25nIFRhbmcgQ2l0eQ!5e0!3m2!1sen!2s!4v1700000000000!5m2!1sen!2s"
              />
              
              {/* Map Markers Overlay */}
              <div className="map-markers">
                {visibleBuddies.map((buddy) => (
                  <div 
                    key={buddy.id}
                    className={`map-marker buddy-marker ${selectedMarker === buddy.id ? 'selected' : ''}`}
                    style={{
                      left: `${35 + (buddy.lng - 108.2) * 150}%`,
                      top: `${50 - (buddy.lat - 16.05) * 200}%`
                    }}
                    onClick={() => setSelectedMarker(buddy.id)}
                  >
                    <div className="marker-pin">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF6B35" stroke="white" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div className="marker-label">{buddy.name}</div>
                  </div>
                ))}
                
                {visibleTourists.map((tourist) => (
                  <div 
                    key={tourist.id}
                    className={`map-marker tourist-marker ${selectedMarker === tourist.id ? 'selected' : ''}`}
                    style={{
                      left: `${35 + (tourist.lng - 108.2) * 150}%`,
                      top: `${50 - (tourist.lat - 16.05) * 200}%`
                    }}
                    onClick={() => setSelectedMarker(tourist.id)}
                  >
                    <div className="marker-pin">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="#17B2B8" stroke="white" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                      </svg>
                    </div>
                    <div className="marker-label">{tourist.name}</div>
                  </div>
                ))}
              </div>

              {/* Selected Marker Info */}
              {selectedMarker && (
                <div className="marker-popup">
                  {(() => {
                    const marker = allMarkers.find(m => m.id === selectedMarker)
                    if (!marker) return null
                    return (
                      <>
                        <div className="popup-header">
                          <span className={`popup-type ${marker.type}`}>
                            {marker.type === 'buddy' ? 'Local Buddy' : 'Tourist'}
                          </span>
                          <button className="popup-close" onClick={() => setSelectedMarker(null)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                        <h3>{marker.name}</h3>
                        <p className="popup-location">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                            <circle cx="12" cy="10" r="3"/>
                          </svg>
                          {marker.location}
                        </p>
                        {'rating' in marker && (
                          <p className="popup-rating">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            {(marker as typeof nearbyBuddies[0]).rating}
                          </p>
                        )}
                        {'languages' in marker && (
                          <div className="popup-languages">
                            {(marker as typeof nearbyBuddies[0]).languages.map((lang: string) => (
                              <span key={lang} className="language-tag">{lang}</span>
                            ))}
                          </div>
                        )}
                        {'interests' in marker && (
                          <div className="popup-interests">
                            {(marker as typeof nearbyTourists[0]).interests.map((interest: string) => (
                              <span key={interest} className="interest-tag-small">{interest}</span>
                            ))}
                          </div>
                        )}
                        {'type' in marker && (marker as typeof nearbyBuddies[0]).type === 'buddy' && (
                          <Link to={`/buddies/${marker.id}`} className="btn btn-primary btn-sm">
                            View Profile
                          </Link>
                        )}
                      </>
                    )
                  })()}
                </div>
              )}
              
              {/* Map Legend */}
              <div className="map-legend">
                <div className="legend-item">
                  <span className="legend-marker buddy"></span>
                  Local Buddy
                </div>
                <div className="legend-item">
                  <span className="legend-marker tourist"></span>
                  Tourist
                </div>
              </div>
              <div className="map-offline-note">
                If the online map does not load, use the filtered list on the left.
              </div>
            </div>

            {/* Map Filters */}
            <div className="map-filters">
              <div className="filter-group">
                <label>Price Range</label>
                <select className="form-input" value={priceRange} onChange={(event) => setPriceRange(event.target.value)}>
                  <option value="">Any Price</option>
                  <option value="0-40">Under $40/day</option>
                  <option value="40-60">$40-60/day</option>
                  <option value="60+">$60+/day</option>
                </select>
              </div>
              <div className="filter-group">
                <label>Language</label>
                <select className="form-input" value={language} onChange={(event) => setLanguage(event.target.value)}>
                  <option value="">Any Language</option>
                  <option value="en">English</option>
                  <option value="vi">Vietnamese</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default MapSearch
