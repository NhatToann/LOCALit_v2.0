import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './CityTour.css'

const CityTour = () => {
  const { id } = useParams()
  const [activeTab, setActiveTab] = useState('overview')
  const [bookingDate, setBookingDate] = useState('2026-08-15')
  const [bookingGuests, setBookingGuests] = useState('2')
  const [addedActivities, setAddedActivities] = useState<string[]>([])
  const [itineraryStatus, setItineraryStatus] = useState('')
  const [messagePerson, setMessagePerson] = useState<{ name: string; role: string; avatar: string } | null>(null)
  const [messageText, setMessageText] = useState('')

  const tours = {
    '1': { name: 'Ba Na Hills', location: 'Da Nang, Vietnam', rating: 4.8, reviews: 234, duration: '1 Day', groupSize: 'Up to 8 people', image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=1200&h=600&fit=crop', description: 'Ba Na Hills is one of Da Nangs most famous mountain resorts, known for cool weather, cable cars, French Village, and the Golden Bridge viewpoint.', highlights: ['Golden Bridge photo stop', 'Cable car ride', 'French Village walk', 'Mountain viewpoints'] },
    '2': { name: 'My Khe Beach', location: 'Da Nang, Vietnam', rating: 4.9, reviews: 198, duration: 'Half Day', groupSize: 'Up to 6 people', image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=600&fit=crop', description: 'My Khe Beach is Da Nangs signature beach, loved for soft sand, sunrise walks, seafood spots, and easy access from the city center.', highlights: ['Sunrise walk', 'Beach cafes', 'Seafood nearby', 'Relaxed swimming area'] },
    '3': { name: 'Marble Mountains', location: 'Da Nang, Vietnam', rating: 4.7, reviews: 156, duration: 'Half Day', groupSize: 'Up to 10 people', image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=1200&h=600&fit=crop', description: 'Marble Mountains is a cultural landmark with caves, pagodas, stone paths, and viewpoints over Da Nang and the coastline.', highlights: ['Cave visit', 'Pagoda walk', 'Stone village nearby', 'City and sea views'] },
    '4': { name: 'Madame Lan Restaurant', location: 'Da Nang, Vietnam', rating: 4.8, reviews: 176, duration: '2 Hours', groupSize: 'Table for 2-8', image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=600&fit=crop', description: 'Madame Lan is a well-known Da Nang restaurant for Vietnamese dishes, riverside atmosphere, and a polished local dining experience.', highlights: ['Vietnamese set menu', 'Riverside dinner', 'Good for groups', 'Local specialties'] },
    '5': { name: 'Dragon Bridge', location: 'Da Nang, Vietnam', rating: 4.6, reviews: 145, duration: 'Evening', groupSize: 'Open public spot', image: 'https://images.unsplash.com/photo-1470004914212-05527e49370b?w=1200&h=600&fit=crop', description: 'Dragon Bridge is Da Nangs most iconic bridge, especially popular at night and during the weekend fire and water show.', highlights: ['Night photos', 'Weekend fire show', 'Han River walk', 'Nearby cafes'] },
    '6': { name: 'Be Man Seafood', location: 'Da Nang, Vietnam', rating: 4.7, reviews: 221, duration: '2 Hours', groupSize: 'Table for 2-10', image: 'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200&h=600&fit=crop', description: 'Be Man Seafood is a famous local seafood restaurant area near the coast, known for lively tables, fresh seafood, and casual local energy.', highlights: ['Fresh seafood', 'Local dining vibe', 'Group table', 'Near beach roads'] },
    '7': { name: 'Han Market', location: 'Da Nang, Vietnam', rating: 4.5, reviews: 129, duration: '1-2 Hours', groupSize: 'Flexible', image: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&h=600&fit=crop', description: 'Han Market is a central Da Nang market for snacks, local products, souvenirs, fabrics, and quick food discoveries.', highlights: ['Souvenir shopping', 'Local snacks', 'Central location', 'Coffee nearby'] },
    '8': { name: 'Linh Ung Pagoda', location: 'Da Nang, Vietnam', rating: 4.6, reviews: 188, duration: 'Half Day', groupSize: 'Up to 8 people', image: 'https://images.unsplash.com/photo-1528181304800-259b08848526?w=1200&h=600&fit=crop', description: 'Linh Ung Pagoda on Son Tra is known for its large Lady Buddha statue, calm atmosphere, and open views over the bay.', highlights: ['Lady Buddha statue', 'Bay viewpoint', 'Peaceful pagoda', 'Son Tra route'] },
    '9': { name: 'Son Tra Peninsula', location: 'Da Nang, Vietnam', rating: 4.8, reviews: 167, duration: 'Half Day', groupSize: 'Up to 6 people', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=600&fit=crop', description: 'Son Tra Peninsula is a scenic green escape with ocean roads, viewpoints, pagodas, and quiet stops away from the busy beach strip.', highlights: ['Coastal viewpoints', 'Monkey Mountain route', 'Linh Ung stop', 'Sunset drive'] },
  }

  const tour = {
    id: id || '1',
    ...(tours[(id || '1') as keyof typeof tours] || {
      name: 'Da Nang Local Highlights',
      location: 'Da Nang, Vietnam',
      rating: 4.7,
      reviews: 142,
      duration: '1 Day',
      groupSize: 'Up to 8 people',
      image: 'https://images.unsplash.com/photo-1566041510639-8d95a2490bfb?w=1200&h=600&fit=crop',
      description: 'A trusted Da Nang highlight with local context, easy timing tips, and nearby places to eat or relax.',
      highlights: ['Local context', 'Photo stops', 'Food nearby', 'Easy planning']
    })
  }

  const itinerary = [
    {
      day: 1,
      title: 'Arrival & Beach Orientation',
      activities: [
        { time: '08:00', activity: 'Hotel pickup and trip briefing', location: 'Da Nang City' },
        { time: '09:00', activity: 'My Khe Beach walk', location: 'My Khe Beach' },
        { time: '11:30', activity: 'Local seafood lunch', location: 'Beachside restaurant' },
        { time: '14:00', activity: 'Marble Mountains visit', location: 'Ngu Hanh Son' },
        { time: '16:30', activity: 'Coffee and photo stop', location: 'Son Tra viewpoint' },
        { time: '19:00', activity: 'Night market tasting', location: 'Da Nang Night Market' },
      ]
    },
    {
      day: 2,
      title: 'Culture & Local Food',
      activities: [
        { time: '08:30', activity: 'Breakfast with local noodles', location: 'Han Market area' },
        { time: '10:00', activity: 'Dragon Bridge and riverside walk', location: 'Han River' },
        { time: '12:00', activity: 'Local lunch recommendations', location: 'City center' },
        { time: '14:00', activity: 'Museum or cafe break', location: 'Hai Chau' },
        { time: '17:30', activity: 'Sunset viewpoint', location: 'Son Tra Peninsula' },
        { time: '19:30', activity: 'Optional dinner with buddy', location: 'An Thuong area' },
      ]
    },
    {
      day: 3,
      title: 'Flexible Departure',
      activities: [
        { time: '08:00', activity: 'Breakfast and checkout support', location: 'Hotel' },
        { time: '09:30', activity: 'Last souvenir stop', location: 'Han Market' },
        { time: '11:00', activity: 'Airport transfer planning', location: 'Da Nang City' },
        { time: '11:30', activity: 'Trip wrap-up with buddy', location: 'Pickup point' },
      ]
    }
  ]

  const visitedPeople = [
    { name: 'Lan Pham', role: 'Buddy', avatar: 'L', date: 'Visited last week', note: 'Knows the easiest timing and less crowded photo spots.' },
    { name: 'Sarah Miller', role: 'Tourist', avatar: 'S', date: 'Visited in Jul 2026', note: 'Recommended this stop for first-time Da Nang travelers.' },
    { name: 'Minh Nguyen', role: 'Buddy', avatar: 'M', date: 'Visited this month', note: 'Can help with food stops and transport nearby.' },
    { name: 'John Doe', role: 'Tourist', avatar: 'J', date: 'Visited in Jun 2026', note: 'Added this place to a 3-day Da Nang itinerary.' },
  ]

  const addToItinerary = (day: number, activity: typeof itinerary[number]['activities'][number], activityIndex: number) => {
    const activityKey = `${tour.id}-${day}-${activityIndex}`
    if (addedActivities.includes(activityKey)) return

    const savedItems = JSON.parse(localStorage.getItem('localit.pendingItineraryItems') || '[]')
    const nextItem = {
      id: activityKey,
      tourId: tour.id,
      tourName: tour.name,
      day,
      time: activity.time,
      activity: activity.activity,
      location: activity.location,
      addedAt: new Date().toISOString()
    }

    localStorage.setItem('localit.pendingItineraryItems', JSON.stringify([nextItem, ...savedItems]))
    setAddedActivities((current) => [...current, activityKey])
    setItineraryStatus(`${activity.activity} added to your itinerary.`)
  }

  return (
    <div className="city-tour-page">
      {/* Hero Image */}
      <section className="tour-hero">
        <img src={tour.image} alt={tour.name} />
        <div className="tour-hero-overlay">
          <div className="container">
            <div className="tour-hero-content">
              <h1>{tour.name}</h1>
              <div className="tour-meta">
                <span className="tour-location">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {tour.location}
                </span>
                <span className="tour-rating">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  {tour.rating} ({tour.reviews} reviews)
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="tour-content">
        <div className="container">
          <div className="tour-layout">
            {/* Left Column - Tour Info */}
            <div className="tour-main">
              {/* Tabs */}
              <div className="tour-tabs">
                <button
                  className={`tour-tab ${activeTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveTab('overview')}
                >
                  Overview
                </button>
                <button
                  className={`tour-tab ${activeTab === 'itinerary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('itinerary')}
                >
                  Itinerary
                </button>
                <button
                  className={`tour-tab ${activeTab === 'visited' ? 'active' : ''}`}
                  onClick={() => setActiveTab('visited')}
                >
                  Visited
                </button>
                <button
                  className={`tour-tab ${activeTab === 'reviews' ? 'active' : ''}`}
                  onClick={() => setActiveTab('reviews')}
                >
                  Reviews
                </button>
              </div>

              {/* Tab Content */}
              <div className="tab-content">
                {activeTab === 'overview' && (
                  <div className="overview-content">
                    <h2>About {tour.name}</h2>
                    <p className="tour-description">
                      {tour.description}
                    </p>
                    
                    <h3>Highlights</h3>
                    <ul className="highlights-list">
                      {tour.highlights.map((highlight) => (
                        <li key={highlight}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          {highlight}
                        </li>
                      ))}
                    </ul>

                    <h3>Tour Information</h3>
                    <div className="tour-info-grid">
                      <div className="info-item">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <div>
                          <span className="info-label">Duration</span>
                          <span className="info-value">{tour.duration}</span>
                        </div>
                      </div>
                      <div className="info-item">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <div>
                          <span className="info-label">Group Size</span>
                          <span className="info-value">{tour.groupSize}</span>
                        </div>
                      </div>
                      <div className="info-item">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                          <polyline points="10 9 9 9 8 9"/>
                        </svg>
                        <div>
                          <span className="info-label">Languages</span>
                          <span className="info-value">English, Vietnamese</span>
                        </div>
                      </div>
                      <div className="info-item">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                        </svg>
                        <div>
                          <span className="info-label">Cancellation</span>
                          <span className="info-value">Free up to 7 days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'itinerary' && (
                  <div className="itinerary-content">
                    <h2>Detailed Itinerary</h2>
                    {itineraryStatus && <div className="itinerary-status">{itineraryStatus}</div>}
                    <div className="itinerary-timeline">
                      {itinerary.map((day) => (
                        <div key={day.day} className="day-card">
                          <div className="day-header">
                            <div className="day-badge">Day {day.day}</div>
                            <h3>{day.title}</h3>
                          </div>
                          <div className="day-activities">
                            {day.activities.map((activity, index) => {
                              const activityKey = `${tour.id}-${day.day}-${index}`
                              const isAdded = addedActivities.includes(activityKey)

                              return (
                              <div key={index} className="activity-item">
                                <div className="activity-time">{activity.time}</div>
                                <div className="activity-dot"></div>
                                <div className="activity-details">
                                  <span className="activity-name">{activity.activity}</span>
                                  <span className="activity-location">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                      <circle cx="12" cy="10" r="3"/>
                                    </svg>
                                    {activity.location}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  className={`add-itinerary-btn ${isAdded ? 'added' : ''}`}
                                  onClick={() => addToItinerary(day.day, activity, index)}
                                  disabled={isAdded}
                                >
                                  {isAdded ? 'Added' : 'Add to itinerary'}
                                </button>
                              </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'visited' && (
                  <div className="visited-content">
                    <h2>Visited {tour.name}</h2>
                    <p className="visited-intro">Tourists and buddies who have already been here. Message them to ask about timing, food nearby, transport, or photo spots.</p>
                    <div className="visited-list">
                      {visitedPeople.map((person) => (
                        <article key={person.name} className="visited-card">
                          <div className="visited-avatar">{person.avatar}</div>
                          <div className="visited-info">
                            <div className="visited-title-row">
                              <div>
                                <h3>{person.name}</h3>
                                <span>{person.role} · {person.date}</span>
                              </div>
                              <button
                                type="button"
                                className="message-btn"
                                onClick={() => {
                                  setMessagePerson(person)
                                  setMessageText('')
                                }}
                              >
                                Message
                              </button>
                            </div>
                            <p>{person.note}</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="reviews-content">
                    <h2>Customer Reviews</h2>
                    <div className="review-summary">
                      <div className="review-score">
                        <span className="score">{tour.rating}</span>
                        <div className="stars">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <svg key={star} width="20" height="20" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                          ))}
                        </div>
                        <span className="count">{tour.reviews} reviews</span>
                      </div>
                    </div>
                    <div className="reviews-list">
                      <div className="review-card">
                        <div className="review-header">
                          <div className="reviewer-avatar">M</div>
                          <div className="reviewer-info">
                            <span className="reviewer-name">Michael Chen</span>
                            <span className="review-date">December 2025</span>
                          </div>
                          <div className="review-rating">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <svg key={star} width="14" height="14" viewBox="0 0 24 24" fill="#FFB347" stroke="#FFB347" strokeWidth="2">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                              </svg>
                            ))}
                          </div>
                        </div>
                        <p className="review-text">
                          Amazing experience! The scenery was breathtaking and the staff were incredibly 
                          friendly. Highly recommend the kayaking activity!
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Booking Card */}
            <aside className="booking-sidebar">
              <div className="booking-card">
                <div className="booking-form">
                  <div className="form-group">
                    <label>Date</label>
                    <input
                      type="date"
                      className="form-input"
                      min="2026-07-21"
                      value={bookingDate}
                      onChange={(event) => setBookingDate(event.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Guests</label>
                    <select className="form-input" value={bookingGuests} onChange={(event) => setBookingGuests(event.target.value)}>
                      <option value="1">1 Guest</option>
                      <option value="2">2 Guests</option>
                      <option value="3">3 Guests</option>
                      <option value="4">4 Guests</option>
                    </select>
                  </div>
                </div>

                <Link to={`/booking?city=Da%20Nang&date=${bookingDate}&guests=${bookingGuests}`} className="btn btn-primary btn-full">
                  Book This Experience
                </Link>

                <div className="booking-features">
                  <div className="feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                    </svg>
                    Free cancellation
                  </div>
                  <div className="feature">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Secure payment
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
      {messagePerson && (
        <div className="messenger-window" role="dialog" aria-label={`Message ${messagePerson.name}`}>
          <div className="messenger-header">
            <div className="messenger-person">
              <span className="messenger-avatar">{messagePerson.avatar}</span>
              <div>
                <strong>{messagePerson.name}</strong>
                <span>{messagePerson.role} · Active now</span>
              </div>
            </div>
            <button type="button" className="messenger-close" onClick={() => setMessagePerson(null)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="messenger-body">
            <div className="chat-bubble incoming">
              Hi! I visited {tour.name}. Ask me anything about timing, food nearby, or what to prepare.
            </div>
            {messageText && (
              <div className="chat-bubble outgoing">{messageText}</div>
            )}
          </div>
          <form
            className="messenger-compose"
            onSubmit={(event) => {
              event.preventDefault()
              if (!messageText.trim()) setMessageText(`Hi ${messagePerson.name}, can you share tips for ${tour.name}?`)
            }}
          >
            <input
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        </div>
      )}
    </div>
  )
}

export default CityTour
