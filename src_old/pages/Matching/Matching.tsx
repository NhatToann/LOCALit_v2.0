import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import './Matching.css'

// Fix default marker icon issue with webpack
delete (L.Icon.Default.prototype as any)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

// Custom user icon (blue)
const userIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

// Custom online buddy icon (green)
const onlineIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

// Custom offline buddy icon (gray)
const offlineIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
})

// Component to center map on user location
function MapCenter({ position }: { position: [number, number] }) {
  const map = useMap()
  map.setView(position, 14)
  return null
}

const Matching = () => {
  const [selectedBuddy, setSelectedBuddy] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'nearby' | 'recommended'>('nearby')
  const [openChatWindows, setOpenChatWindows] = useState<number[]>([])
  const [chatDrafts, setChatDrafts] = useState<Record<number, string>>({})
  const [chatMessages, setChatMessages] = useState<Record<number, Array<{ sender: 'user' | 'buddy'; text: string }>>>({})

  // Current user location - Da Nang city center
  const userLocation: [number, number] = [16.0544, 108.2022]

  // Nearby buddies with location data around Da Nang
  const nearbyBuddies = [
    { 
      id: 1, 
      name: 'Lan Pham', 
      avatar: 'L',
      rating: 4.9, 
      reviews: 156,
      languages: ['English', 'Vietnamese'],
      distance: '0.5 km',
      location: { lat: 16.0545, lng: 108.2025 },
      isOnline: true,
      specialties: ['Food & Dining', 'History'],
      matchScore: 95,
      bio: 'Passionate local guide with 5 years of experience showing travelers the authentic side of Da Nang.'
    },
    { 
      id: 2, 
      name: 'Minh Nguyen', 
      avatar: 'M',
      rating: 4.8, 
      reviews: 134,
      languages: ['English', 'French', 'Vietnamese'],
      distance: '1.2 km',
      location: { lat: 16.0580, lng: 108.2080 },
      isOnline: true,
      specialties: ['Photography', 'Nature'],
      matchScore: 88,
      bio: 'Professional photographer and nature enthusiast. I love sharing hidden spots with fellow travelers.'
    },
    { 
      id: 3, 
      name: 'Huy Nguyen', 
      avatar: 'H',
      rating: 4.7, 
      reviews: 98,
      languages: ['English', 'Japanese', 'Vietnamese'],
      distance: '2.8 km',
      location: { lat: 16.0500, lng: 108.2100 },
      isOnline: true,
      specialties: ['Nightlife', 'Shopping'],
      matchScore: 82,
      bio: 'Nightlife expert and shopping guru. Let me show you the best bars, cafes, and markets in town!'
    },
    { 
      id: 4, 
      name: 'Linh Tran', 
      avatar: 'T',
      rating: 4.9, 
      reviews: 87,
      languages: ['English', 'Korean', 'Vietnamese'],
      distance: '3.5 km',
      location: { lat: 16.0620, lng: 108.1950 },
      isOnline: false,
      specialties: ['Beach', 'Wellness'],
      matchScore: 91,
      bio: 'Beach lover and wellness advocate. Join me for yoga sessions and beach explorations.'
    },
    { 
      id: 5, 
      name: 'Mai Le', 
      avatar: 'M',
      rating: 4.6, 
      reviews: 76,
      languages: ['English', 'Chinese', 'Vietnamese'],
      distance: '4.1 km',
      location: { lat: 16.0480, lng: 108.2150 },
      isOnline: false,
      specialties: ['History', 'Culture'],
      matchScore: 79,
      bio: 'History buff and culture enthusiast. Discover the rich heritage of Vietnam with me.'
    },
    { 
      id: 6, 
      name: 'Khanh Vo', 
      avatar: 'K',
      rating: 4.8, 
      reviews: 65,
      languages: ['English', 'Spanish', 'Vietnamese'],
      distance: '5.2 km',
      location: { lat: 16.0650, lng: 108.1900 },
      isOnline: true,
      specialties: ['Adventure', 'Fitness'],
      matchScore: 85,
      bio: 'Adventure seeker and fitness trainer. Let\'s explore the mountains and stay active together!'
    },
  ]

  const onlineBuddies = nearbyBuddies.filter(b => b.isOnline)
  const recommendedBuddies = [...nearbyBuddies].sort((a, b) => b.matchScore - a.matchScore)

  const handleBuddyClick = (buddyId: number) => {
    setSelectedBuddy(buddyId)
  }

  const handleOpenMiniChat = (buddyId: number) => {
    const buddy = nearbyBuddies.find(b => b.id === buddyId)
    if (!buddy) return

    setOpenChatWindows(prev => (
      prev.includes(buddyId) ? prev : [...prev, buddyId].slice(-3)
    ))

    setChatMessages(prev => ({
      ...prev,
      [buddyId]: prev[buddyId] || [
        {
          sender: 'buddy',
          text: `Hi, I'm ${buddy.name}. Tell me what you want to explore in Da Nang.`
        }
      ]
    }))
  }

  const handleCloseMiniChat = (buddyId: number) => {
    setOpenChatWindows(prev => prev.filter(id => id !== buddyId))
  }

  const handleSendMiniMessage = (buddyId: number) => {
    const text = chatDrafts[buddyId]?.trim()
    if (!text) return

    setChatMessages(prev => ({
      ...prev,
      [buddyId]: [
        ...(prev[buddyId] || []),
        { sender: 'user', text },
        { sender: 'buddy', text: 'Got it. I can help you plan that.' }
      ]
    }))

    setChatDrafts(prev => ({ ...prev, [buddyId]: '' }))
  }

  const handleMiniChatKeyDown = (event: KeyboardEvent<HTMLInputElement>, buddyId: number) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      handleSendMiniMessage(buddyId)
    }
  }

  const getBuddyById = (id: number) => nearbyBuddies.find(b => b.id === id)

  return (
    <div className="matching-page">
      {/* Header */}
      <header className="matching-header">
        <div className="container">
          <div className="header-content">
            <div className="header-left">
              <h1>Find Your Buddy</h1>
              <p className="location-info">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Da Nang, Vietnam
              </p>
            </div>
            <div className="header-right">
              <Link to="/booking" className="btn btn-outline">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                </svg>
                Book a Local Buddy
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="matching-tabs">
            <button 
              className={`tab-btn ${activeTab === 'nearby' ? 'active' : ''}`}
              onClick={() => setActiveTab('nearby')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              Nearby ({onlineBuddies.length} online)
            </button>
            <button 
              className={`tab-btn ${activeTab === 'recommended' ? 'active' : ''}`}
              onClick={() => setActiveTab('recommended')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
              </svg>
              Recommended for You
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="matching-content">
        <div className="container">
          <div className="matching-layout">
            {/* Map Section with Real Google Maps / OpenStreetMap */}
            <div className="map-section">
              <div className="map-container">
                <MapContainer 
                  center={userLocation} 
                  zoom={14} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  {/* Center map on user location */}
                  <MapCenter position={userLocation} />
                  
                  {/* User location marker */}
                  <Marker position={userLocation} icon={userIcon}>
                    <Popup>
                      <div className="map-popup user-popup">
                        <strong>Your Location</strong>
                        <p>Da Nang City Center</p>
                      </div>
                    </Popup>
                  </Marker>

                  {/* Buddy markers */}
                  {nearbyBuddies.map((buddy) => (
                    <Marker 
                      key={buddy.id}
                      position={[buddy.location.lat, buddy.location.lng]}
                      icon={buddy.isOnline ? onlineIcon : offlineIcon}
                      eventHandlers={{
                        click: () => handleBuddyClick(buddy.id),
                      }}
                    >
                      <Popup>
                        <div className={`map-popup buddy-popup ${buddy.isOnline ? 'online' : 'offline'}`}>
                          <div className="popup-header">
                            <div className="popup-avatar">{buddy.avatar}</div>
                            <div className="popup-info">
                              <strong>{buddy.name}</strong>
                              <span className={`status ${buddy.isOnline ? 'online' : ''}`}>
                                {buddy.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                          </div>
                          <div className="popup-meta">
                            <span className="rating">⭐ {buddy.rating}</span>
                            <span className="distance">{buddy.distance} away</span>
                          </div>
                          <div className="popup-specialties">
                            {buddy.specialties.map((s) => (
                              <span key={s} className="specialty">{s}</span>
                            ))}
                          </div>
                          <button 
                            className="popup-btn"
                            onClick={() => handleOpenMiniChat(buddy.id)}
                          >
                            Chat Now
                          </button>
                        </div>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>

                {/* Map Legend */}
                <div className="map-legend">
                  <div className="legend-item">
                    <span className="legend-marker user"></span>
                    <span>You</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-marker online"></span>
                    <span>Online</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-marker offline"></span>
                    <span>Offline</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Buddies List */}
            <div className="buddies-list-section">
              {activeTab === 'nearby' ? (
                <div className="buddies-list">
                  <div className="list-header">
                    <h2>Online Buddies Near You</h2>
                    <span className="buddy-count">{onlineBuddies.length} available</span>
                  </div>
                  {onlineBuddies.map((buddy) => (
                    <div 
                      key={buddy.id}
                      className={`buddy-list-card ${selectedBuddy === buddy.id ? 'selected' : ''}`}
                      onClick={() => handleBuddyClick(buddy.id)}
                    >
                      <div className="buddy-avatar-wrapper">
                        <div className="buddy-avatar-large">{buddy.avatar}</div>
                        <span className="online-dot"></span>
                      </div>
                      <div className="buddy-info-section">
                        <div className="buddy-header-row">
                          <h3>{buddy.name}</h3>
                          <span className="distance-badge">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                              <circle cx="12" cy="10" r="3"/>
                            </svg>
                            {buddy.distance}
                          </span>
                        </div>
                        <div className="buddy-rating-row">
                          <div className="rating">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fbbf24" stroke="#fbbf24" strokeWidth="2">
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                            </svg>
                            {buddy.rating} ({buddy.reviews})
                          </div>
                          <div className="languages">
                            {buddy.languages.slice(0, 2).join(', ')}
                          </div>
                        </div>
                        <div className="buddy-specialties">
                          {buddy.specialties.map((specialty) => (
                            <span key={specialty} className="specialty-tag">{specialty}</span>
                          ))}
                        </div>
                      </div>
                      <div className="buddy-actions-list">
                        <Link
                          to={`/buddies/${buddy.id}`}
                          className="btn btn-outline btn-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={(e) => { e.stopPropagation(); handleOpenMiniChat(buddy.id); }}
                        >
                          Chat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="buddies-list">
                  <div className="list-header">
                    <h2>Best Matches for You</h2>
                    <span className="buddy-count">Based on your preferences</span>
                  </div>
                  {recommendedBuddies.map((buddy) => (
                    <div 
                      key={buddy.id}
                      className={`buddy-list-card recommended ${selectedBuddy === buddy.id ? 'selected' : ''}`}
                      onClick={() => handleBuddyClick(buddy.id)}
                    >
                      <div className="match-score">
                        <span className="score-value">{buddy.matchScore}%</span>
                        <span className="score-label">Match</span>
                      </div>
                      <div className="buddy-avatar-wrapper">
                        <div className="buddy-avatar-large">{buddy.avatar}</div>
                        <span className={`online-dot ${buddy.isOnline ? '' : 'offline'}`}></span>
                      </div>
                      <div className="buddy-info-section">
                        <div className="buddy-header-row">
                          <h3>{buddy.name}</h3>
                          <span className={`status-badge ${buddy.isOnline ? 'online' : 'offline'}`}>
                            {buddy.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <p className="buddy-bio">{buddy.bio}</p>
                        <div className="buddy-specialties">
                          {buddy.specialties.map((specialty) => (
                            <span key={specialty} className="specialty-tag">{specialty}</span>
                          ))}
                        </div>
                      </div>
                      <div className="buddy-actions-list">
                        <Link
                          to={`/buddies/${buddy.id}`}
                          className="btn btn-outline btn-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                        <button 
                          className="btn btn-primary btn-sm" 
                          onClick={(e) => { e.stopPropagation(); handleOpenMiniChat(buddy.id); }}
                        >
                          Chat
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {openChatWindows.length > 0 && (
        <div className="mini-chat-dock">
          {openChatWindows.map((buddyId) => {
            const buddy = getBuddyById(buddyId)
            if (!buddy) return null

            return (
              <div key={buddy.id} className="mini-chat-window">
                <div className="mini-chat-header">
                  <div className="mini-chat-user">
                    <div className="mini-chat-avatar">
                      {buddy.avatar}
                      <span className={`mini-chat-status ${buddy.isOnline ? 'online' : 'offline'}`}></span>
                    </div>
                    <div>
                      <strong>{buddy.name}</strong>
                      <span>{buddy.isOnline ? 'Online now' : 'Offline'}</span>
                    </div>
                  </div>
                  <button
                    className="mini-chat-close"
                    onClick={() => handleCloseMiniChat(buddy.id)}
                    aria-label={`Close chat with ${buddy.name}`}
                  >
                    x
                  </button>
                </div>
                <div className="mini-chat-messages">
                  {(chatMessages[buddy.id] || []).map((message, index) => (
                    <div key={`${buddy.id}-${index}`} className={`mini-message ${message.sender}`}>
                      {message.text}
                    </div>
                  ))}
                </div>
                <div className="mini-chat-input-row">
                  <input
                    type="text"
                    value={chatDrafts[buddy.id] || ''}
                    onChange={(event) => setChatDrafts(prev => ({ ...prev, [buddy.id]: event.target.value }))}
                    onKeyDown={(event) => handleMiniChatKeyDown(event, buddy.id)}
                    placeholder="Write a message..."
                  />
                  <button
                    type="button"
                    onClick={() => handleSendMiniMessage(buddy.id)}
                    disabled={!chatDrafts[buddy.id]?.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Matching
