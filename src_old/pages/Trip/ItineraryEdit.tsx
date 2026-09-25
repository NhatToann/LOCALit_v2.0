import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './Trip.css'

interface Activity {
  id: string
  time: string
  activity: string
  location: string
  transport: string
  buddyTransport: boolean
  cost: number
  notes: string
  icon: string
  addedBy?: string
}

interface Day {
  id: string
  day: number
  title: string
  date: string
  activities: Activity[]
}

const ItineraryEdit = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [hasChanges, setHasChanges] = useState(false)
  const [status, setStatus] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [editingActivity, setEditingActivity] = useState<{ dayId: string; activityId: string } | null>(null)
  const [newActivity, setNewActivity] = useState<Partial<Activity>>({
    time: '09:00',
    activity: '',
    location: '',
    transport: '',
    buddyTransport: false,
    cost: 0,
    notes: '',
    icon: '📍',
    addedBy: 'You'
  })

  const [days, setDays] = useState<Day[]>([
    {
      id: 'day_1',
      day: 1,
      title: 'Arrival & Bay Exploration',
      date: '2026-08-15',
      activities: [
        { id: '1', time: '08:00', activity: 'Arrival at Da Nang Airport', location: 'Da Nang International Airport', transport: 'Private Car', buddyTransport: true, cost: 15, notes: 'Buddy meets at arrival hall', icon: '✈️' },
        { id: '2', time: '09:30', activity: 'Hotel check-in & rest', location: 'My Khe Beach Hotel', transport: 'Car', buddyTransport: true, cost: 0, notes: 'Drop luggage before lunch', icon: '🏨' },
        { id: '3', time: '11:00', activity: 'Lunch at local seafood restaurant', location: 'My Khe Beach', transport: '', buddyTransport: false, cost: 25, notes: 'Ask for no spicy sauce if needed', icon: '🍽️' },
        { id: '4', time: '14:00', activity: 'Marble Mountains visit', location: 'Ngu Hanh Son', transport: 'Scooter', buddyTransport: true, cost: 10, notes: 'Wear comfortable shoes', icon: '🏔️' },
      ]
    },
    {
      id: 'day_2',
      day: 2,
      title: 'Fishing Villages & Activities',
      date: '2026-08-16',
      activities: [
        { id: '7', time: '06:30', activity: 'Morning tai chi session', location: 'Sun Deck', transport: '', buddyTransport: false, cost: 0, notes: 'Optional activity', icon: '🧘' },
        { id: '8', time: '07:30', activity: 'Breakfast buffet', location: 'Restaurant', transport: '', buddyTransport: false, cost: 10, notes: '', icon: '🍳' },
        { id: '9', time: '09:00', activity: 'Visit floating fishing village', location: 'Vung Vieng', transport: 'Rowboat', buddyTransport: true, cost: 5, notes: 'Traditional fishing experience', icon: '🏘️' },
        { id: '10', time: '11:00', activity: 'Swimming at Titop Island', location: 'Titop Beach', transport: 'Speedboat', buddyTransport: true, cost: 10, notes: 'Beautiful beach', icon: '🏖️' },
        { id: '11', time: '13:00', activity: 'Cooking class', location: 'Cruise Kitchen', transport: '', buddyTransport: false, cost: 15, notes: 'Learn to make spring rolls', icon: '👨‍🍳' },
        { id: '12', time: '16:00', activity: 'Sunbathing & relaxation', location: 'Sun Deck', transport: '', buddyTransport: false, cost: 0, notes: 'Free time', icon: '☀️' },
      ]
    },
    {
      id: 'day_3',
      day: 3,
      title: 'Departure',
      date: '2026-08-17',
      activities: [
        { id: '13', time: '07:00', activity: 'Breakfast buffet', location: 'Restaurant', transport: '', buddyTransport: false, cost: 10, notes: '', icon: '🍳' },
        { id: '14', time: '09:00', activity: 'Visit Me Cung Cave', location: 'Me Cung Island', transport: 'Speedboat', buddyTransport: true, cost: 10, notes: 'Amazing stalactite formations', icon: '🕳️' },
        { id: '15', time: '11:00', activity: 'Check out and local coffee stop', location: 'Da Nang City', transport: '', buddyTransport: false, cost: 8, notes: 'Settle hotel extras before leaving', icon: '☕' },
        { id: '16', time: '11:30', activity: 'Return to Hanoi', location: 'Transfer Bus', transport: 'Bus', buddyTransport: true, cost: 20, notes: '3 hours journey', icon: '🚌' },
      ]
    }
  ])

  const trip = {
    id: id || '1',
    name: 'Da Nang Beach Adventure',
    destination: 'Da Nang, Vietnam'
  }

  const icons = ['📍', '🚗', '🚢', '🍽️', '🧘', '🍳', '🚣', '🕳️', '🏛️', '✈️', '🏨', '🏖️', '🏔️', '🌉', '🏮', '🛕', '🚡', '☕', '🛶', '📸', '🍜', '🌅', '🏕️', '🎭', '🏘️', '☀️', '👨‍🍳', '🚌', '🚕', '🚶']

  const transportOptions = ['Private Car', 'Speedboat', 'Rowboat', 'Bus', 'Scooter', 'Cable Car', 'Flight', 'Taxi', 'Ferry', 'Kayak', 'Walk', 'Van', 'Motorbike', 'Bicycle']

  const handleSave = () => {
    setStatus('Itinerary saved for this demo. Returning to trip details...')
    setTimeout(() => navigate(`/trip/${id}`), 600)
  }

  const updateDay = (dayId: string, updates: Partial<Pick<Day, 'title' | 'date'>>) => {
    setDays(prev => prev.map(day =>
      day.id === dayId ? { ...day, ...updates } : day
    ))
    setHasChanges(true)
  }

  const addDay = () => {
    const nextDayNumber = days.length + 1
    const lastDate = days[days.length - 1]?.date
    const nextDate = lastDate
      ? new Date(`${lastDate}T00:00:00`)
      : new Date()

    if (lastDate) {
      nextDate.setDate(nextDate.getDate() + 1)
    }

    const newDay: Day = {
      id: `day_${Date.now()}`,
      day: nextDayNumber,
      title: `Day ${nextDayNumber}`,
      date: nextDate.toISOString().slice(0, 10),
      activities: []
    }

    setDays(prev => [...prev, newDay])
    setHasChanges(true)
  }

  const removeDay = (dayId: string) => {
    setDays(prev => prev
      .filter(day => day.id !== dayId)
      .map((day, index) => ({ ...day, day: index + 1 }))
    )
    setHasChanges(true)
  }

  const openAddModal = (dayId: string) => {
    setSelectedDay(dayId)
    setEditingActivity(null)
    setNewActivity({
      time: '09:00',
      activity: '',
      location: '',
      transport: '',
      buddyTransport: false,
      cost: 0,
      notes: '',
      icon: '📍',
      addedBy: 'You'
    })
    setShowAddModal(true)
  }

  const openEditModal = (dayId: string, activity: Activity) => {
    setSelectedDay(dayId)
    setEditingActivity({ dayId, activityId: activity.id })
    setNewActivity({ ...activity })
    setShowAddModal(true)
  }

  const closeActivityModal = () => {
    setShowAddModal(false)
    setEditingActivity(null)
  }

  const handleSaveActivity = () => {
    if (!selectedDay || !newActivity.activity) return

    if (editingActivity) {
      const updatedActivity: Activity = {
        id: editingActivity.activityId,
        time: newActivity.time || '09:00',
        activity: newActivity.activity || '',
        location: newActivity.location || '',
        transport: newActivity.transport || '',
        buddyTransport: newActivity.buddyTransport || false,
        cost: newActivity.cost || 0,
        notes: newActivity.notes || '',
        icon: newActivity.icon || '📍',
        addedBy: newActivity.addedBy || 'You'
      }

      setDays(prev => prev.map(day =>
        day.id === editingActivity.dayId && day.id === selectedDay
          ? {
              ...day,
              activities: day.activities.map(activity =>
                activity.id === editingActivity.activityId
                  ? updatedActivity
                  : activity
              )
            }
          : day.id === editingActivity.dayId
            ? { ...day, activities: day.activities.filter(activity => activity.id !== editingActivity.activityId) }
            : day.id === selectedDay
              ? { ...day, activities: [...day.activities, updatedActivity] }
              : day
      ))

      closeActivityModal()
      setHasChanges(true)
      return
    }

    const activity: Activity = {
      id: Date.now().toString(),
      time: newActivity.time || '09:00',
      activity: newActivity.activity || '',
      location: newActivity.location || '',
      transport: newActivity.transport || '',
      buddyTransport: newActivity.buddyTransport || false,
      cost: newActivity.cost || 0,
      notes: newActivity.notes || '',
      icon: newActivity.icon || '📍',
      addedBy: newActivity.addedBy || 'You'
    }

    setDays(prev => prev.map(day => 
      day.id === selectedDay 
        ? { ...day, activities: [...day.activities, activity] }
        : day
    ))

    closeActivityModal()
    setHasChanges(true)
  }

  const removeActivity = (dayId: string, activityId: string) => {
    setDays(prev => prev.map(day =>
      day.id === dayId
        ? { ...day, activities: day.activities.filter(a => a.id !== activityId) }
        : day
    ))
    setHasChanges(true)
  }

  const sortedDays = days.map((day) => ({
    ...day,
    activities: [...day.activities].sort((a, b) => a.time.localeCompare(b.time))
  }))

  const formatTime = (time: string) => time.replace(':', 'h')

  const getTransportIcon = (transport: string) => {
    const lowerTransport = transport.toLowerCase()

    if (lowerTransport.includes('car') || lowerTransport.includes('taxi') || lowerTransport.includes('van')) return '🚗'
    if (lowerTransport.includes('bus')) return '🚌'
    if (lowerTransport.includes('boat') || lowerTransport.includes('ferry')) return '🚤'
    if (lowerTransport.includes('kayak')) return '🚣'
    if (lowerTransport.includes('walk')) return '🚶'
    if (lowerTransport.includes('bike') || lowerTransport.includes('scooter') || lowerTransport.includes('motorbike')) return '🛵'

    return '📍'
  }

  return (
    <div className="itinerary-edit-page">
      <section className="page-header">
        <div className="container">
          <div className="header-content">
            <div>
              <h1 className="page-title">Edit Itinerary</h1>
              <p className="page-subtitle">{trip.name} - {trip.destination}</p>
            </div>
            <div className="header-actions">
              <button className="btn btn-outline" onClick={addDay}>
                Add Day
              </button>
              <button className="btn btn-outline" onClick={() => navigate(`/trip/${id}`)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave}>
                Save Changes
              </button>
            </div>
          </div>
          {status && <div className="mvp-message success">{status}</div>}
        </div>
      </section>

      <section className="edit-content">
        <div className="container">
          <div className="edit-container">
            <div className="edit-main">
              {sortedDays.map((day) => (
                <div key={day.id} className="day-edit-section">
                  <div className="day-header">
                    <div className="day-badge">Day {day.day}</div>
                    <input 
                      type="date" 
                      className="day-date-input"
                      value={day.date}
                      onChange={(e) => updateDay(day.id, { date: e.target.value })}
                    />
                    <input 
                      type="text" 
                      className="day-title-input" 
                      value={day.title}
                      onChange={(e) => updateDay(day.id, { title: e.target.value })}
                    />
                    <div className="day-actions">
                      <button 
                        className="btn btn-sm btn-primary"
                        onClick={() => openAddModal(day.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="5" x2="12" y2="19"/>
                          <line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                        Add
                      </button>
                      <button
                        className="btn-icon"
                        title="Delete day"
                        onClick={() => removeDay(day.id)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"/>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="activities-edit-list">
                    {day.activities.map((activity) => (
                      <div key={activity.id} className="activity-edit-item activity-view-item">
                        <div className="activity-time-chip">
                          <span>{day.date}</span>
                          <strong>{formatTime(activity.time)}</strong>
                        </div>
                        <div className="activity-icon-display">{activity.icon}</div>
                        <div className="activity-summary">
                          <div className="activity-summary-title-row">
                            <h4>{activity.activity}</h4>
                            {activity.cost > 0 && <span className="activity-cost-pill">${activity.cost}</span>}
                          </div>
                          <div className="activity-summary-meta">
                            <span>Location: {activity.location || 'Not set'}</span>
                            {activity.transport && <span>{getTransportIcon(activity.transport)} {activity.transport}</span>}
                            <span>Added by: {activity.addedBy || 'Localit Planner'}</span>
                            <span className={activity.buddyTransport ? 'buddy-status buddy' : 'buddy-status self'}>
                              {activity.buddyTransport ? 'Buddy transport' : 'Self transport'}
                            </span>
                          </div>
                          {activity.notes && <p className="activity-summary-notes">{activity.notes}</p>}
                        </div>
                        <div className="activity-row-actions">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => openEditModal(day.id, activity)}
                          >
                            Edit
                          </button>
                        <button 
                          className="btn-icon remove" 
                          title="Remove"
                          onClick={() => removeActivity(day.id, activity.id)}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                        </div>
                      </div>
                    ))}
                    {day.activities.length === 0 && (
                      <div className="empty-day">
                        <p>No activities planned</p>
                        <button className="btn btn-sm btn-outline" onClick={() => openAddModal(day.id)}>
                          Add first activity
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Add Activity Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={closeActivityModal}>
          <div className="modal-content activity-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingActivity ? 'Edit Activity' : 'Add New Activity'}</h2>
              <button className="modal-close" onClick={closeActivityModal}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            
            <div className="modal-body">
              {/* Icon Selection */}
              <div className="form-group">
                <label>Choose Icon</label>
                <div className="icon-grid">
                  {icons.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      className={`icon-btn ${newActivity.icon === icon ? 'selected' : ''}`}
                      onClick={() => setNewActivity({ ...newActivity, icon })}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date and time */}
              <div className="form-row">
                <div className="form-group">
                  <label>Day / Date *</label>
                  <select
                    className="form-input"
                    value={selectedDay || ''}
                    onChange={(e) => setSelectedDay(e.target.value)}
                  >
                    {days.map((day) => (
                      <option key={day.id} value={day.id}>
                        Day {day.day} - {day.date}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Time *</label>
                  <input 
                    type="time" 
                    className="form-input"
                    value={newActivity.time}
                    onChange={(e) => setNewActivity({ ...newActivity, time: e.target.value })}
                  />
                </div>
              </div>

              {/* Activity Name */}
              <div className="form-group">
                <label>Activity Name *</label>
                <input 
                  type="text" 
                  className="form-input"
                  value={newActivity.activity}
                  onChange={(e) => setNewActivity({ ...newActivity, activity: e.target.value })}
                  placeholder="e.g., Visit Sung Sot Cave"
                />
              </div>

              {/* Location */}
              <div className="form-group">
                <label>Location</label>
                <input 
                  type="text" 
                  className="form-input"
                  value={newActivity.location}
                  onChange={(e) => setNewActivity({ ...newActivity, location: e.target.value })}
                  placeholder="e.g., Bo Hon Island"
                />
              </div>

              {/* Transport & Buddy */}
              <div className="form-row">
                <div className="form-group">
                  <label>Transport</label>
                  <select 
                    className="form-input"
                    value={newActivity.transport}
                    onChange={(e) => setNewActivity({ ...newActivity, transport: e.target.value })}
                  >
                    <option value="">Select transport</option>
                    {transportOptions.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Estimated Cost ($)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={newActivity.cost}
                    onChange={(e) => setNewActivity({ ...newActivity, cost: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Added by *</label>
                <input
                  type="text"
                  className="form-input"
                  value={newActivity.addedBy}
                  onChange={(e) => setNewActivity({ ...newActivity, addedBy: e.target.value })}
                  placeholder="e.g., You, Lan Pham, Minh Nguyen"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Buddy Transport?</label>
                  <div className="buddy-toggle-box">
                    <label className="toggle-label large">
                      <input 
                        type="checkbox"
                        checked={newActivity.buddyTransport}
                        onChange={(e) => setNewActivity({ ...newActivity, buddyTransport: e.target.checked })}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                    <span className="toggle-description">
                      {newActivity.buddyTransport 
                        ? 'Buddy will provide transport' 
                        : 'You arrange your own transport'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div className="form-group">
                <label>Notes</label>
                <textarea 
                  className="form-input form-textarea"
                  value={newActivity.notes}
                  onChange={(e) => setNewActivity({ ...newActivity, notes: e.target.value })}
                  placeholder="Additional details..."
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeActivityModal}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSaveActivity}
                disabled={!selectedDay || !newActivity.activity || !newActivity.addedBy}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                {editingActivity ? 'Save Activity' : 'Add Activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ItineraryEdit
