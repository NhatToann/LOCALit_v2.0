import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Cities.css'

const Cities = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')

  const filters = ['All', 'Beach', 'Mountain', 'Cultural', 'Food', 'Nightlife']

  const cities = [
    { 
      id: 1, 
      name: 'Ba Na Hills', 
      country: 'Da Nang, Vietnam', 
      rating: 4.8, 
      keywords: ['Mountain', 'Beautiful View', 'Cultural'],
      image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=600&h=400&fit=crop' 
    },
    { 
      id: 2, 
      name: 'My Khe Beach', 
      country: 'Da Nang, Vietnam', 
      rating: 4.9, 
      keywords: ['Beach', 'Beautiful View', 'Sunset'],
      image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop' 
    },
    { 
      id: 3, 
      name: 'Marble Mountains', 
      country: 'Da Nang, Vietnam', 
      rating: 4.7, 
      keywords: ['Mountain', 'Cultural', 'Historical'],
      image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&h=400&fit=crop' 
    },
    { 
      id: 4, 
      name: 'Madame Lan Restaurant', 
      country: 'Da Nang, Vietnam', 
      rating: 4.8,
      keywords: ['Food', 'Cultural', 'Restaurant'],
      image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=400&fit=crop' 
    },
    { 
      id: 5, 
      name: 'Dragon Bridge', 
      country: 'Da Nang, Vietnam', 
      rating: 4.6, 
      keywords: ['Cultural', 'Nightlife', 'Beautiful View'],
      image: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=600&h=400&fit=crop' 
    },
    { 
      id: 6, 
      name: 'Be Man Seafood', 
      country: 'Da Nang, Vietnam', 
      rating: 4.7,
      keywords: ['Food', 'Seafood', 'Restaurant'],
      image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=400&fit=crop' 
    },
    { 
      id: 7, 
      name: 'Han Market', 
      country: 'Da Nang, Vietnam', 
      rating: 4.5, 
      keywords: ['Food', 'Cultural', 'Shopping'],
      image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=400&fit=crop' 
    },
    { 
      id: 8, 
      name: 'Linh Ung Pagoda', 
      country: 'Da Nang, Vietnam', 
      rating: 4.6, 
      keywords: ['Cultural', 'Historical', 'Beautiful View'],
      image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=600&h=400&fit=crop' 
    },
    { 
      id: 9, 
      name: 'Son Tra Peninsula', 
      country: 'Da Nang, Vietnam', 
      rating: 4.8, 
      keywords: ['Mountain', 'Beautiful View', 'Adventure'],
      image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=400&fit=crop' 
    },
  ]

  const filteredCities = cities.filter(city => {
    const matchesSearch = city.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         city.country.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         city.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesFilter = activeFilter === 'All' || city.keywords.includes(activeFilter)
    return matchesSearch && matchesFilter
  })

  return (
    <div className="cities-page">
      {/* Page Header */}
      <section className="page-header">
        <div className="container">
          <div className="breadcrumb">
            <Link to="/">Home</Link>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
            <span>Destinations</span>
          </div>
          <h1 className="page-title">Famous Places in Da Nang</h1>
          <p className="page-subtitle">Explore the most beautiful destinations in Da Nang</p>
        </div>
      </section>

      <section className="cities-content">
        <div className="container">
          {/* Search Bar */}
          <div className="search-section">
            <div className="search-bar">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8"/>
                <path d="m21 21-4.35-4.35"/>
              </svg>
              <input 
                type="text" 
                placeholder="Search by place name, keyword..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="filter-tabs">
              {filters.map((filter) => (
                <button
                  key={filter}
                  className={`filter-tab ${activeFilter === filter ? 'active' : ''}`}
                  onClick={() => setActiveFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          <div className="results-info">
            <p>Showing <strong>{filteredCities.length}</strong> destinations</p>
          </div>

          {/* Cities Grid */}
          {filteredCities.length > 0 ? (
            <div className="cities-cards">
              {filteredCities.map((city) => (
              <Link to={`/cities/${city.id}`} key={city.id} className="city-card">
                <div className="city-image">
                  <img src={city.image} alt={city.name} />
                </div>
                <div className="city-info">
                  <h3>{city.name}</h3>
                  <p>{city.country}</p>
                  <div className="city-keywords">
                    {city.keywords.map((keyword) => (
                      <span key={keyword} className="keyword-tag">{keyword}</span>
                    ))}
                  </div>
                  <div className="city-rating">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    <span>{city.rating}</span>
                  </div>
                </div>
              </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h3>No destinations found</h3>
              <p>Try another keyword or choose All to browse Da Nang highlights.</p>
              <button className="btn btn-outline" onClick={() => { setSearchQuery(''); setActiveFilter('All') }}>
                Clear search
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

export default Cities
