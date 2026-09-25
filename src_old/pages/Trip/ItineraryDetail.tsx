import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import './Trip.css'

type Activity = {
  time: string
  activity: string
  location: string
  transport: string | null
  cost: number
  icon: string
  editedBy: string
  meetingPoint?: string
  notes?: string
}

type DayPlan = {
  day: number
  title: string
  date: string
  activities: Activity[]
}

const initialDays: DayPlan[] = [
  {
    day: 1,
    title: 'Arrival & Beach',
    date: 'August 15, 2026',
    activities: [
      { time: '08:00', activity: 'Arrival at Da Nang Airport', location: 'Da Nang International Airport', transport: 'Flight', cost: 0, icon: '✈️', editedBy: 'You' },
      { time: '14:00', activity: 'My Khe Beach relaxation', location: 'My Khe Beach', transport: null, cost: 0, icon: '🏖️', editedBy: 'You' },
      { time: '19:00', activity: 'Dinner at Night Market', location: 'Da Nang Night Market', transport: null, cost: 20, icon: '🌙', editedBy: 'Lan Pham' },
    ]
  },
  {
    day: 2,
    title: 'Hoi An Highlights',
    date: 'August 16, 2026',
    activities: [
      { time: '08:30', activity: 'Travel to Hoi An', location: 'Hoi An Ancient Town', transport: 'Car', cost: 30, icon: '🚗', editedBy: 'Lan Pham' },
      { time: '10:00', activity: 'Explore Ancient Town', location: 'Hoi An Old Quarter', transport: null, cost: 0, icon: '🏛️', editedBy: 'Lan Pham' },
      { time: '19:00', activity: 'Hoi An Lantern Festival', location: 'Hoi An Old Town', transport: null, cost: 0, icon: '🏮', editedBy: 'Lan Pham' },
    ]
  },
  {
    day: 3,
    title: 'Ba Na Hills',
    date: 'August 17, 2026',
    activities: [
      { time: '09:00', activity: 'Ba Na Hills Cable Car', location: 'Ba Na Hills', transport: 'Cable Car', cost: 45, icon: '🚡', editedBy: 'Lan Pham' },
      { time: '10:30', activity: 'Golden Bridge exploration', location: 'Ba Na Hills', transport: null, cost: 0, icon: '🌉', editedBy: 'Lan Pham' },
      { time: '18:00', activity: 'Return to hotel', location: 'Da Nang', transport: 'Car', cost: 20, icon: '🏨', editedBy: 'Lan Pham' },
    ]
  },
  {
    day: 4,
    title: 'City & Departure',
    date: 'August 18, 2026',
    activities: [
      { time: '10:00', activity: 'Dragon Bridge photo stop', location: 'Dragon Bridge', transport: null, cost: 0, icon: '🐉', editedBy: 'Lan Pham' },
      { time: '14:00', activity: 'Airport transfer', location: 'Da Nang International Airport', transport: 'Car', cost: 15, icon: '✈️', editedBy: 'Lan Pham' },
    ]
  }
]

const ItineraryDetail = () => {
  const { id } = useParams()
  const [status, setStatus] = useState('')
  const [days, setDays] = useState<DayPlan[]>(initialDays)
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [showInviteCollaborator, setShowInviteCollaborator] = useState(false)
  const [collaboratorEmail, setCollaboratorEmail] = useState('lan.pham@localit.demo')
  const [newActivity, setNewActivity] = useState({
    day: '1',
    name: '',
    time: '09:00',
    location: '',
    meetingPoint: '',
    cost: '0',
    transport: '',
    notes: ''
  })
  const [editingActivity, setEditingActivity] = useState<{ day: number; index: number } | null>(null)
  const [selectedActivity, setSelectedActivity] = useState<{
    activity: string
    location: string
    meetingPoint: string
    time: string
  } | null>(null)

  const trip = {
    id: id || '1',
    name: 'Da Nang Beach Adventure',
    destination: 'Da Nang, Vietnam',
    date: '2026-08-15',
    endDate: '2026-08-18',
    duration: '4 Days 3 Nights',
    travelers: 2,
    coverImage: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1200',
    buddy: { 
      name: 'Lan Pham', 
      avatar: 'L',
      rating: 4.9,
      reviews: 156,
      responseTime: 'Within 1 hour'
    }
  }

  const handleAddActivity = () => {
    if (!newActivity.name.trim() || !newActivity.location.trim()) return

    const activity: Activity = {
      time: newActivity.time,
      activity: newActivity.name.trim(),
      location: newActivity.location.trim(),
      transport: newActivity.transport.trim() || null,
      cost: Number(newActivity.cost) || 0,
      icon: '📍',
      editedBy: 'You',
      meetingPoint: newActivity.meetingPoint.trim(),
      notes: newActivity.notes.trim()
    }

    if (editingActivity) {
      setDays((currentDays) => currentDays.map((day) => {
        const withoutEditedActivity = day.day === editingActivity.day
          ? day.activities.filter((_, index) => index !== editingActivity.index)
          : day.activities
        const updatedActivities = day.day === Number(newActivity.day)
          ? [...withoutEditedActivity, activity].sort((a, b) => a.time.localeCompare(b.time))
          : withoutEditedActivity

        return { ...day, activities: updatedActivities }
      }))
      setStatus(`${activity.activity} updated.`)
    } else {
      setDays((currentDays) => currentDays.map((day) => (
        day.day === Number(newActivity.day)
          ? { ...day, activities: [...day.activities, activity].sort((a, b) => a.time.localeCompare(b.time)) }
          : day
      )))
      setStatus(`${activity.activity} added to Day ${newActivity.day}.`)
    }

    setShowAddActivity(false)
    setEditingActivity(null)
    setNewActivity({
      day: newActivity.day,
      name: '',
      time: '09:00',
      location: '',
      meetingPoint: '',
      cost: '0',
      transport: '',
      notes: ''
    })
  }

  const openEditActivity = (day: DayPlan, activity: Activity, index: number) => {
    setEditingActivity({ day: day.day, index })
    setNewActivity({
      day: String(day.day),
      name: activity.activity,
      time: activity.time,
      location: activity.location,
      meetingPoint: activity.meetingPoint || activity.location,
      cost: String(activity.cost),
      transport: activity.transport || '',
      notes: activity.notes || ''
    })
    setShowAddActivity(true)
  }

  const closeActivityForm = () => {
    setShowAddActivity(false)
    setEditingActivity(null)
    setNewActivity({
      day: editingActivity ? String(editingActivity.day) : newActivity.day,
      name: '',
      time: '09:00',
      location: '',
      meetingPoint: '',
      cost: '0',
      transport: '',
      notes: ''
    })
  }

  const openActivityMap = (activity: Activity) => {
    setSelectedActivity({
      activity: activity.activity,
      location: activity.location,
      meetingPoint: activity.meetingPoint || activity.location,
      time: activity.time
    })
  }

  const handleInviteCollaborator = () => {
    if (!collaboratorEmail.trim()) return

    setShowInviteCollaborator(false)
    setStatus(`${collaboratorEmail.trim()} invited as a collaborator. Buddy can edit this itinerary in demo mode.`)
  }

  return (
    <div className="itinerary-detail-page">
      {/* Hero Section */}
      <section className="trip-hero" style={{ backgroundImage: `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url(${trip.coverImage})` }}>
        <div className="container">
          <div className="hero-content">
            <div className="hero-breadcrumb">
              <Link to="/trips">My Trips</Link>
              <span>/</span>
              <span>{trip.name}</span>
            </div>
            <h1 className="hero-title">{trip.name}</h1>
            <div className="hero-meta">
              <span className="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                {trip.destination}
              </span>
              <span className="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                {trip.date} - {trip.endDate}
              </span>
              <span className="meta-item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                {trip.travelers} Travelers
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="trip-content">
        <div className="container">
          <div className="trip-layout">
            {/* Main Column */}
            <div className="trip-main">
              {days.map((day) => (
                <div key={day.day} className="day-section">
                  <div className="day-header">
                    <div className="day-info">
                      <div className="day-badge">Day {day.day}</div>
                      <div className="day-date">{day.date}</div>
                    </div>
                    <h2 className="day-title">{day.title}</h2>
                  </div>
                  <div className="activities-timeline">
                    {day.activities.map((activity, index) => (
                      <article
                        key={index}
                        className="activity-card"
                        role="button"
                        tabIndex={0}
                        onClick={() => openActivityMap(activity)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openActivityMap(activity)
                          }
                        }}
                      >
                        <div className="activity-icon">{activity.icon}</div>
                        <div className="activity-body">
                          <div className="activity-time">{activity.time}</div>
                          <div className="activity-details">
                            <h4>{activity.activity}</h4>
                            <button
                              type="button"
                              className="activity-location"
                              onClick={(event) => {
                                event.stopPropagation()
                                openActivityMap(activity)
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                              </svg>
                              {activity.location}
                            </button>
                            {activity.meetingPoint && activity.meetingPoint !== activity.location && (
                              <p className="activity-meeting-point">
                                Meeting point: {activity.meetingPoint}
                              </p>
                            )}
                            <p className="activity-editor">Edited by {activity.editedBy}</p>
                            {activity.notes && <p className="activity-notes">{activity.notes}</p>}
                          </div>
                          <div className="activity-meta">
                            {activity.transport && (
                              <span className="transport-tag">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="1" y="3" width="15" height="13"/>
                                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
                                  <circle cx="5.5" cy="18.5" r="2.5"/>
                                  <circle cx="18.5" cy="18.5" r="2.5"/>
                                </svg>
                                {activity.transport}
                              </span>
                            )}
                            {activity.cost > 0 && (
                              <span className="cost-tag">${activity.cost}</span>
                            )}
                            <button
                              type="button"
                              className="activity-edit-btn"
                              onClick={(event) => {
                                event.stopPropagation()
                                openEditActivity(day, activity, index)
                              }}
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Sidebar */}
            <aside className="trip-sidebar">
              {/* Action Buttons */}
              <div className="action-buttons">
                {status && <div className="mvp-message info">{status}</div>}
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingActivity(null)
                    setShowAddActivity(true)
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  Add Activity
                </button>
                <Link to={`/trip/${id}/edit`} className="btn btn-outline">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit Trip
                </Link>
                <button className="btn btn-outline" onClick={() => setStatus('Share link copied for this MVP demo.')}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="18" cy="5" r="3"/>
                    <circle cx="6" cy="12" r="3"/>
                    <circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  Share
                </button>
                <button className="btn btn-outline" onClick={() => setShowInviteCollaborator(true)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <line x1="19" y1="8" x2="19" y2="14"/>
                    <line x1="22" y1="11" x2="16" y2="11"/>
                  </svg>
                  Invite Collaborator
                </button>
                <Link to="/chat" className="btn btn-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  Chat with Buddy
                </Link>
              </div>

              {/* Buddy Card */}
              <div className="buddy-card">
                <div className="buddy-header">
                  <div className="buddy-avatar-lg">{trip.buddy.avatar}</div>
                  <div className="buddy-status online"></div>
                </div>
                <div className="buddy-info">
                  <h3>{trip.buddy.name}</h3>
                  <div className="buddy-rating">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#FBBF24" stroke="#FBBF24" strokeWidth="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                    </svg>
                    <span>{trip.buddy.rating}</span>
                    <span className="reviews">({trip.buddy.reviews} reviews)</span>
                  </div>
                </div>
                <div className="buddy-meta">
                  <div className="meta-row">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span>Responds {trip.buddy.responseTime}</span>
                  </div>
                </div>
                <Link to={`/buddies/${trip.buddy.name.toLowerCase().replace(' ', '-')}`} className="btn btn-outline btn-full">
                  View Profile
                </Link>
              </div>

              {/* Quick Actions */}
              <div className="quick-actions">
                <button className="quick-action-btn" onClick={() => setStatus('PDF export is queued for the next MVP iteration.')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Download PDF
                </button>
                <button className="quick-action-btn" onClick={() => setStatus('Trip photos saved in demo mode.')}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Save to Photos
                </button>
              </div>
            </aside>
          </div>
        </div>
      </section>
      {selectedActivity && (
        <div className="map-modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="activity-map-modal" onClick={(event) => event.stopPropagation()}>
            <div className="activity-map-header">
              <div>
                <span>{selectedActivity.time}</span>
                <h2>{selectedActivity.activity}</h2>
                <p>Meeting point: {selectedActivity.meetingPoint}</p>
                {selectedActivity.meetingPoint !== selectedActivity.location && (
                  <p className="activity-map-address">Activity address: {selectedActivity.location}</p>
                )}
                <div className="meeting-map-summary">
                  <span className="meeting-pill you">You</span>
                  <span className="meeting-line"></span>
                  <span className="meeting-pill buddy">{trip.buddy.name}</span>
                </div>
              </div>
              <button type="button" onClick={() => setSelectedActivity(null)} aria-label="Close map">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="activity-map-frame">
              <iframe
                title={`${selectedActivity.meetingPoint} map`}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.google.com/maps?q=${encodeURIComponent(`${selectedActivity.meetingPoint}, Da Nang, Vietnam`)}&output=embed`}
              />
              <div className="meeting-map-markers" aria-hidden="true">
                <div className="meeting-marker you-marker">
                  <span>Y</span>
                  <strong>You</strong>
                </div>
                <div className="meeting-point-marker">
                  <span></span>
                  <strong>Meeting point</strong>
                </div>
                <div className="meeting-marker buddy-marker">
                  <span>{trip.buddy.avatar}</span>
                  <strong>{trip.buddy.name}</strong>
                </div>
              </div>
            </div>
            <div className="activity-map-actions">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedActivity.meetingPoint}, Da Nang, Vietnam`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary"
              >
                Open in Google Maps
              </a>
              <button type="button" className="btn btn-outline" onClick={() => setSelectedActivity(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {showAddActivity && (
        <div className="modal-overlay" onClick={closeActivityForm}>
          <div className="modal-content activity-modal trip-detail-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingActivity ? 'Edit Activity' : 'Add Activity'}</h2>
              <button className="modal-close" onClick={closeActivityForm} aria-label="Close activity form">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Day / Date</label>
                  <select
                    className="form-input"
                    value={newActivity.day}
                    onChange={(event) => setNewActivity({ ...newActivity, day: event.target.value })}
                  >
                    {days.map((day) => (
                      <option key={day.day} value={day.day}>
                        Day {day.day} - {day.date}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Time</label>
                  <input
                    type="time"
                    className="form-input"
                    value={newActivity.time}
                    onChange={(event) => setNewActivity({ ...newActivity, time: event.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Activity name</label>
                <input
                  className="form-input"
                  value={newActivity.name}
                  onChange={(event) => setNewActivity({ ...newActivity, name: event.target.value })}
                  placeholder="e.g., Coffee at Han River"
                />
              </div>

              <div className="form-group">
                <label>Location / Address</label>
                <input
                  className="form-input"
                  value={newActivity.location}
                  onChange={(event) => setNewActivity({ ...newActivity, location: event.target.value })}
                  placeholder="e.g., Han River, Da Nang"
                />
              </div>

              <div className="form-group">
                <label>Meeting point</label>
                <input
                  className="form-input"
                  value={newActivity.meetingPoint}
                  onChange={(event) => setNewActivity({ ...newActivity, meetingPoint: event.target.value })}
                  placeholder="e.g., Hotel lobby, main gate, beach entrance..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Transport</label>
                  <input
                    className="form-input"
                    value={newActivity.transport}
                    onChange={(event) => setNewActivity({ ...newActivity, transport: event.target.value })}
                    placeholder="Car, scooter, walk..."
                  />
                </div>
                <div className="form-group">
                  <label>Estimated cost ($)</label>
                  <input
                    type="number"
                    min="0"
                    className="form-input"
                    value={newActivity.cost}
                    onChange={(event) => setNewActivity({ ...newActivity, cost: event.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Notes</label>
                <textarea
                  className="form-input form-textarea"
                  rows={3}
                  value={newActivity.notes}
                  onChange={(event) => setNewActivity({ ...newActivity, notes: event.target.value })}
                  placeholder="Anything the buddy should know..."
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeActivityForm}>Cancel</button>
              <button className="btn btn-primary" onClick={handleAddActivity} disabled={!newActivity.name.trim() || !newActivity.location.trim()}>
                {editingActivity ? 'Save Changes' : 'Add Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showInviteCollaborator && (
        <div className="modal-overlay" onClick={() => setShowInviteCollaborator(false)}>
          <div className="modal-content collaborator-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Invite Collaborator</h2>
              <button className="modal-close" onClick={() => setShowInviteCollaborator(false)} aria-label="Close invite collaborator">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <p className="collaborator-copy">Invite your buddy or travel partner so they can edit this itinerary.</p>
              <div className="form-group">
                <label>Buddy email or username</label>
                <input
                  className="form-input"
                  value={collaboratorEmail}
                  onChange={(event) => setCollaboratorEmail(event.target.value)}
                  placeholder="buddy@localit.demo"
                />
              </div>
              <div className="collaborator-permission">
                <strong>Permission</strong>
                <span>Can add, edit, and remove activities</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowInviteCollaborator(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleInviteCollaborator} disabled={!collaboratorEmail.trim()}>
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ItineraryDetail
