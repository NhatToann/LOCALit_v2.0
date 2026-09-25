import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import MiniMessenger from '../../components/MiniMessenger/MiniMessenger'
import './Buddies.css'

const Buddies = () => {
  const [searchParams] = useSearchParams()
  const destinationQuery = searchParams.get('destination')?.trim() || ''
  const dateQuery = searchParams.get('date') || ''
  const hasSearchQuery = Boolean(destinationQuery || dateQuery)
  const [likedBuddies, setLikedBuddies] = useState<number[]>([])
  const [expandedBuddyId, setExpandedBuddyId] = useState<number | null>(null)
  const [selectedMapBuddyId, setSelectedMapBuddyId] = useState<number | null>(null)
  const [activeFilter, setActiveFilter] = useState('All')

  const buddies = [
    { 
      id: 1, 
      name: 'Lan Pham', 
      age: 28,
      location: 'Da Nang', 
      mapArea: 'My Khe Beach',
      lat: 16.0544,
      lng: 108.2023,
      mapPosition: { left: 84, top: 46 },
      rating: 4.9, 
      reviews: 156, 
      languages: ['English', 'Vietnamese'], 
      bio: 'Da Nang local buddy who loves beach mornings, food stops, and easy first-time routes.',
      tags: ['Beach', 'Food Tours', 'Photography'],
      interests: ['Beach mornings', 'Seafood', 'Cafe hopping', 'Sunset photos'],
      price: '$45',
      image: null 
    },
    { 
      id: 2, 
      name: 'Minh Nguyen', 
      age: 26,
      location: 'Da Nang', 
      mapArea: 'Han River',
      lat: 16.0678,
      lng: 108.2108,
      mapPosition: { left: 72, top: 56 },
      rating: 4.8, 
      reviews: 134, 
      languages: ['English', 'French'], 
      bio: 'Photography-friendly city guide for riverside cafes, bridges, and local stories.',
      tags: ['Photography', 'Cultural', 'Coffee'],
      interests: ['Street photography', 'Riverside cafes', 'Dragon Bridge', 'Local stories'],
      price: '$50',
      image: null 
    },
    { 
      id: 3, 
      name: 'Huy Nguyen', 
      age: 32,
      location: 'Hoi An', 
      mapArea: 'Hoi An Ancient Town',
      lat: 15.8801,
      lng: 108.3380,
      mapPosition: { left: 62, top: 66 },
      rating: 4.7, 
      reviews: 32, 
      languages: ['English', 'Japanese'], 
      bio: 'Cultural heritage expert. I\'ll take you through the ancient streets and share stories of the past! 🎎',
      tags: ['History', 'Art', 'Cooking'],
      interests: ['Ancient houses', 'Lanterns', 'Cooking class', 'Craft villages'],
      price: '$40',
      image: null 
    },
    { 
      id: 4, 
      name: 'Linh Tran', 
      age: 25,
      location: 'Hanoi', 
      mapArea: 'Da Nang Night Market',
      lat: 16.0607,
      lng: 108.2239,
      mapPosition: { left: 77, top: 64 },
      rating: 4.9, 
      reviews: 52, 
      languages: ['English', 'Korean'], 
      bio: 'Food tour specialist 🍜 Let\'s taste the best street food in the Old Quarter!',
      tags: ['Food Tours', 'Nightlife', 'Shopping'],
      interests: ['Street food', 'Night markets', 'Hidden alleys', 'Local snacks'],
      price: '$35',
      image: null 
    },
    { 
      id: 5, 
      name: 'Mai Le', 
      age: 29,
      location: 'Nha Trang', 
      mapArea: 'Son Tra Beach',
      lat: 16.0933,
      lng: 108.2506,
      mapPosition: { left: 91, top: 31 },
      rating: 4.6, 
      reviews: 28, 
      languages: ['English', 'Russian'], 
      bio: 'Beach and diving expert. The ocean is my second home! 🤿',
      tags: ['Beach', 'Diving', 'Party'],
      interests: ['Island hopping', 'Diving', 'Beach bars', 'Seafood BBQ'],
      price: '$55',
      image: null 
    },
    { 
      id: 6, 
      name: 'Tuan Vu', 
      age: 31,
      location: 'Sapa', 
      mapArea: 'Hai Van Pass',
      lat: 16.2008,
      lng: 108.1311,
      mapPosition: { left: 28, top: 39 },
      rating: 4.8, 
      reviews: 41, 
      languages: ['English', 'Mandarin'], 
      bio: 'Mountain trekking specialist. The views at the top are worth every step! 🏔️',
      tags: ['Trekking', 'Photography', 'Local Culture'],
      interests: ['Mountain trails', 'Village stays', 'Viewpoints', 'Local culture'],
      price: '$42',
      image: null 
    },
  ]

  useEffect(() => {
    setExpandedBuddyId(null)
  }, [hasSearchQuery, destinationQuery, dateQuery])

  const handleLike = (id: number) => {
    setLikedBuddies((prev) => (
      prev.includes(id) ? prev.filter((likedId) => likedId !== id) : [...prev, id]
    ))
  }

  const normalizeText = (value: string) => value.toLowerCase().trim()
  const normalizedDestination = normalizeText(destinationQuery)
  const searchMatchedBuddies = normalizedDestination
    ? buddies.filter((buddy) => {
        const searchableText = [
          buddy.name,
          buddy.location,
          buddy.bio,
          ...buddy.tags,
          ...buddy.interests,
          ...buddy.languages
        ].map(normalizeText).join(' ')

        return searchableText.includes(normalizedDestination)
      })
    : buddies

  const visibleBuddies = [...searchMatchedBuddies]
    .filter((buddy) => activeFilter !== 'Near Me' || buddy.location === 'Da Nang')
    .sort((a, b) => {
      if (activeFilter === 'Top Rated') return b.rating - a.rating
      return a.id - b.id
    })
  const selectedMapBuddy = visibleBuddies.find((buddy) => buddy.id === selectedMapBuddyId)

  return (
    <div className="buddies-page">
      {/* Header */}
      <div className="buddies-header">
        <div className="header-left">
          <h1>{hasSearchQuery ? 'Search Results' : 'Find Buddies'}</h1>
          <p>
            {hasSearchQuery
              ? `${visibleBuddies.length} buddies found${destinationQuery ? ` for ${destinationQuery}` : ''}${dateQuery ? ` on ${dateQuery}` : ''}`
              : 'Discover locals ready to explore with you'}
          </p>
        </div>
      </div>

      <div className="buddies-list-view">
          <div className="grid-filters">
            {hasSearchQuery && (
              <div className="search-results-note">
                <div>
                  <span className="search-results-label">Showing results</span>
                  <strong>{destinationQuery || 'All destinations'}</strong>
                  {dateQuery && <span>Travel date: {dateQuery}</span>}
                </div>
                <Link to="/buddies" className="clear-search-link">Clear search</Link>
              </div>
            )}
            <div className="filter-chips">
              {['All', 'Top Rated', 'Near Me'].map((filter) => (
                <button
                  key={filter}
                  className={`filter-chip ${activeFilter === filter ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <section className="find-buddies-map" aria-label="Buddy map">
            <div className="buddy-map-copy">
              <span>Buddy Map</span>
              <h2>Find local buddies around Da Nang</h2>
              <p>Tap a marker or a buddy row to see where they usually guide tourists.</p>
            </div>
            <div className="buddy-google-map">
              <iframe
                title="Da Nang buddy map"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3833.9225758!2d108.2022973!3d16.0544068!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31420f91c1340f23%3A0xc4f8e3b8a9b23f1e!2zQ-G6o25nIFRhbmcgQ2l0eQ!5e0!3m2!1sen!2s!4v1700000000000!5m2!1sen!2s"
              />
              <div className="buddy-map-markers">
                {visibleBuddies.map((buddy) => (
                  <button
                    key={buddy.id}
                    type="button"
                    className={`buddy-map-marker ${selectedMapBuddyId === buddy.id ? 'selected' : ''}`}
                    style={{
                      left: `${buddy.mapPosition.left}%`,
                      top: `${buddy.mapPosition.top}%`
                    }}
                    onClick={() => {
                      setSelectedMapBuddyId(buddy.id)
                      setExpandedBuddyId(buddy.id)
                    }}
                    title={buddy.name}
                  >
                    <span>{buddy.name.charAt(0)}</span>
                    <strong>{buddy.name}</strong>
                  </button>
                ))}
              </div>
              {selectedMapBuddy && (
                <div className="buddy-map-popup">
                  <button type="button" onClick={() => setSelectedMapBuddyId(null)} aria-label="Close map popup">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/>
                      <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                  <h3>{selectedMapBuddy.name}</h3>
                  <p>{selectedMapBuddy.mapArea}</p>
                  <span>⭐ {selectedMapBuddy.rating} · {selectedMapBuddy.languages.join(', ')}</span>
                </div>
              )}
              <div className="buddy-map-note">Google Map preview from the previous map feature.</div>
            </div>
          </section>
          
          {visibleBuddies.length > 0 ? (
            <div className="buddy-accordion-list">
              {visibleBuddies.map((buddy) => (
                <article
                  key={buddy.id}
                  className={`buddy-list-card ${expandedBuddyId === buddy.id ? 'expanded' : ''}`}
                >
                  <button
                    type="button"
                    className="buddy-list-summary"
                    onClick={() => setExpandedBuddyId(expandedBuddyId === buddy.id ? null : buddy.id)}
                    onMouseEnter={() => setSelectedMapBuddyId(buddy.id)}
                    aria-expanded={expandedBuddyId === buddy.id}
                  >
                    <span className="list-avatar">{buddy.name.charAt(0)}</span>
                    <span className="list-main">
                      <span className="list-name">{buddy.name}, {buddy.age}</span>
                      <span className="list-location">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                        {buddy.location}
                        <span className="map-area-text">· {buddy.mapArea}</span>
                      </span>
                    </span>
                    <span className="list-tags">
                      {buddy.tags.slice(0, 2).map((tag) => (
                        <span key={tag} className="list-tag">{tag}</span>
                      ))}
                    </span>
                    <span className="list-meta">
                      <span>⭐ {buddy.rating}</span>
                    </span>
                    <span className="list-chevron">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M6 9l6 6 6-6"/>
                      </svg>
                    </span>
                  </button>

                  <div className="buddy-dropdown-panel">
                    <p className="list-bio">{buddy.bio}</p>
                    <div className="list-detail-grid">
                      <div>
                        <span className="detail-label">Languages</span>
                        <div className="languages">
                          {buddy.languages.map((lang) => (
                            <span key={lang} className="lang-chip">{lang}</span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="detail-label">Reviews</span>
                        <strong>{buddy.reviews} reviews</strong>
                      </div>
                      <div>
                        <span className="detail-label">Interests</span>
                        <div className="buddy-interests">
                          {buddy.interests.map((interest) => (
                            <span key={interest} className="interest-chip">{interest}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="list-actions">
                      <button
                        type="button"
                        className={`save-buddy-btn ${likedBuddies.includes(buddy.id) ? 'saved' : ''}`}
                        onClick={() => handleLike(buddy.id)}
                      >
                        {likedBuddies.includes(buddy.id) ? 'Saved' : 'Save'}
                      </button>
                      <Link to={`/buddies/${buddy.id}`} className="grid-btn">View Profile</Link>
                      <MiniMessenger
                        buddy={{
                          id: buddy.id,
                          name: buddy.name,
                          avatar: buddy.name.charAt(0),
                          isOnline: buddy.id <= 2,
                          subtitle: buddy.mapArea
                        }}
                        buttonClassName="connect-list-btn"
                        buttonLabel="Send Message"
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-results">
              <h3>No buddies found</h3>
              <p>Try another destination like Da Nang, Hoi An, Hanoi, Sapa, or Nha Trang.</p>
              <Link to="/buddies" className="grid-btn">Browse all buddies</Link>
            </div>
          )}
        </div>
    </div>
  )
}

export default Buddies
