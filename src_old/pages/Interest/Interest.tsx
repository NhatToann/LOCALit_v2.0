import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Interest.css'

const PROFILE_INTERESTS_KEY = 'localit.profile.interests'
const defaultInterests = ['Beach', 'Food', 'Beautiful View']

const Interest = () => {
  const navigate = useNavigate()
  const [selectedInterests, setSelectedInterests] = useState<string[]>(() => {
    const saved = localStorage.getItem(PROFILE_INTERESTS_KEY)
    return saved ? JSON.parse(saved) : defaultInterests
  })
  const [isAnimating, setIsAnimating] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

  const interestCategories = [
    {
      id: 'activities',
      title: 'Activities',
      emoji: '⚡',
      items: ['Adventure', 'Beach', 'Hiking', 'Water Sports', 'Cycling', 'Wildlife', 'Climbing', 'Skiing'],
      icon: '🏃'
    },
    {
      id: 'culture',
      title: 'Culture',
      emoji: '✨',
      items: ['History', 'Art', 'Music', 'Dance', 'Festival', 'Photography', 'Architecture', 'Literature'],
      icon: '🎭'
    },
    {
      id: 'food',
      title: 'Food & Drinks',
      emoji: '🍕',
      items: ['Street Food', 'Cooking Class', 'Wine & Dine', 'Food Tour', 'Local Cuisine', 'Coffee', 'Brunch', 'Night Market'],
      icon: '🍜'
    },
    {
      id: 'nature',
      title: 'Nature',
      emoji: '🌿',
      items: ['Mountains', 'Islands', 'National Parks', 'Waterfalls', 'Gardens', 'Beaches', 'Jungle', 'Desert'],
      icon: '🏔️'
    },
    {
      id: 'wellness',
      title: 'Wellness',
      emoji: '💆',
      items: ['Spa', 'Yoga', 'Meditation', 'Hot Springs', 'Detox', 'Massage', 'Fitness', 'Mindfulness'],
      icon: '🧘'
    },
    {
      id: 'social',
      title: 'Social',
      emoji: '🎉',
      items: ['Nightlife', 'Bar Hopping', 'Local Events', 'Meetups', 'Party', 'Games', 'Live Music', 'Networking'],
      icon: '🥂'
    },
    {
      id: 'travel',
      title: 'Travel Style',
      emoji: '🧳',
      items: ['Solo Backpacking', 'Luxury', 'Budget', 'Road Trip', 'Cruise', 'Group Tour', 'Digital Nomad', 'Slow Travel'],
      icon: '✈️'
    },
    {
      id: 'photo',
      title: 'Photo Spots',
      emoji: '📸',
      items: ['Sunset', 'Sunrise', 'Street Art', 'Landmarks', 'Hidden Gems', 'Aerial', 'Underwater', 'Night City'],
      icon: '📷'
    }
  ]

  const allItems = interestCategories.flatMap(cat => cat.items)

  useEffect(() => {
    localStorage.setItem(PROFILE_INTERESTS_KEY, JSON.stringify(selectedInterests))
  }, [selectedInterests])

  const toggleInterest = (interest: string) => {
    setIsSaved(false)
    if (selectedInterests.includes(interest)) {
      setSelectedInterests(selectedInterests.filter(i => i !== interest))
    } else {
      setSelectedInterests([...selectedInterests, interest])
      setIsAnimating(true)
      setTimeout(() => setIsAnimating(false), 400)
    }
  }

  const isSelected = (interest: string) => selectedInterests.includes(interest)

  const percentage = Math.round((selectedInterests.length / allItems.length) * 100)

  const handleSaveInterests = () => {
    localStorage.setItem(PROFILE_INTERESTS_KEY, JSON.stringify(selectedInterests))
    setIsSaved(true)
    navigate('/profile')
  }

  return (
    <div className="interest-page">
      {/* Header */}
      <div className="interest-header">
        <div className="header-left">
          <h1>Your Interests</h1>
          <p>Choose the travel experiences you want your buddy to understand</p>
        </div>
        <div className="header-stats">
          <div className="stat-pill">
            <span className="stat-icon">♥</span>
            <span>{selectedInterests.length} selected</span>
          </div>
        </div>
      </div>

      <main className="interest-content">
        <aside className="interest-summary-panel">
          <span className="summary-label">Selected interests</span>
          <strong>{selectedInterests.length}</strong>
          <div className="summary-progress">
            <span style={{ width: `${Math.min(percentage, 100)}%` }}></span>
          </div>
          <p>Pick at least 5 interests so LOCALit can suggest better buddies.</p>
          <button
            type="button"
            className={`btn-match ${selectedInterests.length >= 5 ? 'ready' : ''}`}
            onClick={handleSaveInterests}
          >
            Save Interests to Profile
          </button>
          {isSaved && <span className="save-status">Saved to your profile</span>}
        </aside>

        <section className="interest-picker">
          <div className="interest-intro">
            <h2>Travel Preference Checklist</h2>
            <p>Select everything that sounds like your kind of trip.</p>
          </div>

          <div className="interest-category-list">
            {interestCategories.map((category) => (
              <section key={category.id} className="interest-category-section">
                <div className="category-row-header">
                  <span className="category-icon">{category.icon}</span>
                  <div>
                    <h3>{category.title}</h3>
                    <p>{category.items.filter(i => selectedInterests.includes(i)).length} of {category.items.length} selected</p>
                  </div>
                </div>

                <div className="interest-options">
                  {category.items.map((item) => (
                    <label key={item} className={`interest-option ${isSelected(item) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={isSelected(item)}
                        onChange={() => toggleInterest(item)}
                      />
                      <span className="option-check">✓</span>
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </main>

      {/* Selected Interests Display */}
      {selectedInterests.length > 0 && (
        <div className={`selected-interests-bar ${isAnimating ? 'bounce' : ''}`}>
          <div className="selected-scroll">
            {selectedInterests.map((interest) => (
              <span key={interest} className="selected-chip">
                {interest}
                <button 
                  className="remove-chip"
                  onClick={() => toggleInterest(interest)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default Interest
