import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MiniMessenger from '../../components/MiniMessenger/MiniMessenger'
import './Home.css'

const Home = () => {
  const navigate = useNavigate()
  const [activeButton, setActiveButton] = useState<string>('all')
  const [searchDestination, setSearchDestination] = useState('')
  const [searchDates, setSearchDates] = useState('')

  const featuredDestinations = [
    { id: 1, name: 'My Khe Beach', country: 'Da Nang', tours: 45, rating: 4.9, reviews: 1289, image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&h=400&fit=crop', badge: 'Beach', popular: true },
    { id: 2, name: 'Ba Na Hills', country: 'Da Nang', tours: 38, rating: 4.8, reviews: 956, image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=600&h=400&fit=crop', badge: 'Wonder', popular: false },
    { id: 3, name: 'Marble Mountains', country: 'Da Nang', tours: 52, rating: 4.9, reviews: 1834, image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=600&h=400&fit=crop', badge: 'Heritage', popular: true },
    { id: 4, name: 'Dragon Bridge', country: 'Da Nang', tours: 22, rating: 4.7, reviews: 543, image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=600&h=400&fit=crop', badge: 'Trending', popular: false },
    { id: 5, name: 'Son Tra Peninsula', country: 'Da Nang', tours: 35, rating: 4.6, reviews: 789, image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=400&fit=crop', badge: 'Adventure', popular: false },
    { id: 6, name: 'Linh Ung Pagoda', country: 'Da Nang', tours: 28, rating: 4.8, reviews: 678, image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=600&h=400&fit=crop', badge: 'Heritage', popular: true },
  ]

  const onlineBuddies = [
    { id: 1, name: 'Lan Pham', distance: '0.5 km', rating: 4.9, reviews: 156, languages: ['English', 'Vietnamese'], isOnline: true, responseTime: '< 1h', gradient: 'linear-gradient(135deg, #FF6B6B 0%, #FF8E53 100%)', emoji: '🌟' },
    { id: 2, name: 'Minh Nguyen', distance: '1.2 km', rating: 4.8, reviews: 134, languages: ['English', 'French'], isOnline: true, responseTime: '< 2h', gradient: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)', emoji: '🎨' },
    { id: 3, name: 'Huy Nguyen', distance: '2.8 km', rating: 4.7, reviews: 98, languages: ['English', 'Japanese'], isOnline: true, responseTime: '< 3h', gradient: 'linear-gradient(135deg, #10B981 0%, #06B6D4 100%)', emoji: '📸' },
    { id: 4, name: 'Linh Tran', distance: '3.5 km', rating: 4.9, reviews: 87, languages: ['English', 'Korean'], isOnline: false, responseTime: '< 1h', gradient: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)', emoji: '🍜' },
    { id: 5, name: 'Mai Le', distance: '4.1 km', rating: 4.6, reviews: 76, languages: ['English', 'Chinese'], isOnline: false, responseTime: '< 2h', gradient: 'linear-gradient(135deg, #EC4899 0%, #F472B6 100%)', emoji: '🌸' },
    { id: 6, name: 'Khanh Vo', distance: '5.2 km', rating: 4.8, reviews: 65, languages: ['English', 'Spanish'], isOnline: true, responseTime: '< 1h', gradient: 'linear-gradient(135deg, #3B82F6 0%, #6366F1 100%)', emoji: '⚡' },
  ]

  const testimonials = [
    {
      id: 1,
      content: "LOCALit helped me find the perfect local guide in Da Nang. Lan showed me hidden gems that no tourist guide would know about!",
      author: "Sarah Johnson",
      location: "United States",
      avatar: "S"
    },
    {
      id: 2,
      content: "The matching system is amazing! It paired me with Minh who shared my interest in photography. Best trip ever!",
      author: "Michael Chen",
      location: "Singapore",
      avatar: "M"
    },
    {
      id: 3,
      content: "Wonderful experience! Thank you LOCALit for connecting me with amazing local friends.",
      author: "Yuki Tanaka",
      location: "Japan",
      avatar: "Y"
    }
  ]

  const handleButtonClick = (button: string) => {
    setActiveButton(button)
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const params = new URLSearchParams()
    const destination = searchDestination.trim()

    if (destination) {
      params.set('destination', destination)
    }

    if (searchDates) {
      params.set('date', searchDates)
    }

    const queryString = params.toString()
    navigate(queryString ? `/buddies?${queryString}` : '/buddies')
  }

  return (
    <div className="home">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-overlay"></div>
        <div className="hero-content">
          <div className="hero-badge">
            <span className="dot"></span>
            <span>50+ Local Buddies Available Now</span>
          </div>
          
          <h1 className="hero-title">
            Find Your Perfect <span>Local Buddy</span>
          </h1>
          <p className="hero-subtitle">
            Discover authentic travel experiences in Da Nang with friendly local guides.
            Connect with knowledgeable buddies who'll show you the real soul of this coastal city.
          </p>

          <div className="hero-stats">
            <div className="hero-stat">
              <span className="number">2,500+</span>
              <span className="label">Happy Travelers</span>
            </div>
            <div className="hero-stat">
              <span className="number">150+</span>
              <span className="label">Local Buddies</span>
            </div>
            <div className="hero-stat">
              <span className="number">4.9</span>
              <span className="label">Average Rating</span>
            </div>
          </div>
          
          {/* Search Box */}
          <div className="search-box">
            <form className="search-form" onSubmit={handleSearchSubmit}>
              <div className="search-input-group destination-field">
                <label>Where do you want to go?</label>
                <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="m21 21-4.35-4.35"/>
                </svg>
                <input 
                  type="text" 
                  placeholder="Search destinations: Da Nang, Hoi An, Ha Long..." 
                  className="search-input"
                  value={searchDestination}
                  onChange={(e) => setSearchDestination(e.target.value)}
                />
              </div>
              <div className="search-input-group date-field">
                <label>Travel Dates</label>
                <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <input 
                  type="date" 
                  className="search-input"
                  value={searchDates}
                  onChange={(e) => setSearchDates(e.target.value)}
                />
              </div>
              <div className="search-action">
                <button type="submit" className="search-btn">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"/>
                    <path d="m21 21-4.35-4.35"/>
                  </svg>
                  Find Buddy
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Trust Bar */}
        <div className="trust-bar">
          <div className="container trust-bar-content">
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              <span>Verified Local Guides</span>
            </div>
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Secure Payments</span>
            </div>
            <div className="trust-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <span>24/7 Support</span>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Destinations */}
      <section className="section featured-destinations">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Top Da Nang Landmarks</h2>
            <Link to="/cities" className="section-link">
              View All
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          
          <div className="destinations-grid">
            {featuredDestinations.slice(0, 3).map((city) => (
              <Link to={`/cities/${city.id}`} key={city.id} className={`destination-card ${city.popular ? 'popular' : ''}`}>
                <div className="destination-image">
                  <img src={city.image} alt={city.name} />
                  <div className="destination-badges">
                    <span className={`badge-trending ${city.badge === 'UNESCO' ? 'unesco' : ''} ${city.badge === 'Wonder' ? 'wonder' : ''} ${city.badge === 'Heritage' ? 'heritage' : ''} ${city.badge === 'Beach' ? 'beach' : ''} ${city.badge === 'Adventure' ? 'adventure' : ''}`}>
                      {city.badge === 'Trending' && '🔥 '}{city.badge === 'UNESCO' && '🏛️ '}{city.badge === 'Wonder' && '✨ '}{city.badge === 'Heritage' && '🎭 '}{city.badge === 'Beach' && '🏖️ '}{city.badge === 'Adventure' && '⛰️ '}{city.badge}
                    </span>
                  </div>
                  <div className="destination-stats">
                    <span className="stat-tours">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                      </svg>
                      {city.tours}+ Tours
                    </span>
                  </div>
                </div>
                <div className="destination-info">
                  <div className="destination-header">
                    <h3>{city.name}</h3>
                    <div className="destination-rating-high">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                      </svg>
                      <span className="rating-number">{city.rating}</span>
                      <span className="rating-count">({(city.reviews / 1000).toFixed(1)}k)</span>
                    </div>
                  </div>
                  <p className="destination-country">{city.country}</p>
                  <div className="destination-cta">
                    <span>Explore Now</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Online Buddies */}
      <section className="section popular-tours">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">Online Buddies Near You</h2>
            <Link to="/buddies" className="section-link">
              View All
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </div>
          
          <div className="home-buddies-grid">
            {onlineBuddies.slice(0, 3).map((buddy) => (
              <div key={buddy.id} className={`home-buddy-card ${buddy.isOnline ? 'online' : ''}`}>
                <div className="home-buddy-header" style={{ background: buddy.gradient }}>
                  <span className={`home-buddy-badge ${buddy.isOnline ? 'online' : 'offline'}`}>
                    <span className="home-status-dot"></span>
                    {buddy.isOnline ? 'Online' : 'Away'}
                  </span>
                  <div className="home-buddy-avatar">
                    {buddy.emoji}
                  </div>
                </div>
                <div className="home-buddy-info">
                  <div className="home-buddy-title-row">
                    <div>
                      <h3>{buddy.name}</h3>
                      <p className="home-buddy-location">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                          <circle cx="12" cy="10" r="3"/>
                        </svg>
                        {buddy.distance} away
                      </p>
                    </div>
                  </div>
                  <div className="home-buddy-languages">
                    {buddy.languages.map((lang) => (
                      <span key={lang} className="home-language-tag">{lang}</span>
                    ))}
                  </div>
                  <div className="home-buddy-meta">
                    <div className="home-buddy-stat">
                      <span className="home-buddy-stat-label">Rating</span>
                      <span className="home-buddy-stat-value home-buddy-rating">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                        {buddy.rating}
                      </span>
                    </div>
                    <div className="home-buddy-stat">
                      <span className="home-buddy-stat-label">Reviews</span>
                      <span className="home-buddy-stat-value">{buddy.reviews}</span>
                    </div>
                    <div className="home-buddy-stat">
                      <span className="home-buddy-stat-label">Response</span>
                      <span className="home-buddy-stat-value home-response-time">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {buddy.responseTime}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="home-buddy-actions">
                  <Link to={`/buddies/${buddy.id}`} className="btn btn-outline btn-sm">View Profile</Link>
                  <MiniMessenger
                    buddy={{
                      id: buddy.id,
                      name: buddy.name,
                      avatar: buddy.name.charAt(0),
                      isOnline: buddy.isOnline,
                      subtitle: buddy.isOnline ? 'Active now' : 'Away'
                    }}
                    buttonClassName="btn btn-primary btn-sm"
                    buttonLabel="Send Message"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section how-it-works">
        <div className="container">
          <h2 className="section-title text-center">How It Works</h2>
          <p className="section-subtitle text-center">Your journey to unforgettable experiences in 3 simple steps</p>
          
          <div className="steps-grid">
            <div className="step-card">
              <div className="step-number">1</div>
              <h3>Discover</h3>
              <p>Search destinations and browse local buddies who match your interests and travel style</p>
            </div>
            <div className="step-card">
              <div className="step-number">2</div>
              <h3>Match</h3>
              <p>Our smart matching system connects you with compatible buddies based on interests and availability</p>
            </div>
            <div className="step-card">
              <div className="step-number">3</div>
              <h3>Experience</h3>
              <p>Enjoy authentic local experiences and create unforgettable memories with your personal guide</p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section testimonials-section">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">What Travelers Say</h2>
          </div>
          
          <div className="testimonials-grid">
            {testimonials.map((testimonial) => (
              <div key={testimonial.id} className="testimonial-card">
                <p className="testimonial-content">"{testimonial.content}"</p>
                <div className="testimonial-author">
                  <div className="testimonial-avatar">{testimonial.avatar}</div>
                  <div className="testimonial-info">
                    <h4>{testimonial.author}</h4>
                    <p>{testimonial.location}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Start Your Adventure?</h2>
            <p>Join thousands of travelers discovering Vietnam with local guides</p>
            <div className="cta-buttons">
              <Link to="/register" className="btn btn-primary btn-lg">
                Get Started Free
              </Link>
              <Link to="/buddies" className="btn btn-secondary btn-lg">
                Browse Buddies
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
