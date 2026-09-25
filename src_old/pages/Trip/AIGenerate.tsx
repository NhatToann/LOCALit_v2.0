import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './Trip.css'

const AIGenerate = () => {
  const navigate = useNavigate()
  const [isGenerating, setIsGenerating] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [showResult, setShowResult] = useState(false)

  const handleGenerate = () => {
    if (!prompt.trim()) return
    setIsGenerating(true)
    setTimeout(() => {
      setIsGenerating(false)
      setShowResult(true)
    }, 3000)
  }

  const suggestedPrompts = [
    "Plan a 3-day trip to Da Nang with beaches, food, and culture",
    "Create a food tour itinerary in Da Nang for 2 days",
    "Design a romantic getaway in Hoi An for couples",
    "Build a budget-friendly 5-day Vietnam tour"
  ]

  return (
    <div className="ai-generate-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">AI Trip Generator</h1>
          <p className="page-subtitle">Let AI create your perfect itinerary</p>
        </div>
      </section>

      <section className="ai-content">
        <div className="container">
          <div className="ai-container">
            {!showResult ? (
              <>
                {/* AI Input Section */}
                <div className="ai-input-section">
                  <div className="ai-header">
                    <div className="ai-icon">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2"/>
                        <path d="M12 16v-4"/>
                        <path d="M12 8h.01"/>
                      </svg>
                    </div>
                    <div>
                      <h2>Describe Your Dream Trip</h2>
                      <p>Tell us what you want to experience, and our AI will create a personalized itinerary</p>
                    </div>
                  </div>

                  <div className="ai-textarea-wrapper">
                    <textarea
                      className="ai-textarea"
                      placeholder="e.g., I want a 3-day trip to Da Nang focusing on beaches, local food, Marble Mountains, and easy transport, with a budget of $200 per person..."
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={5}
                    />
                  </div>

                  <div className="suggested-prompts">
                    <h4>Try these prompts:</h4>
                    <div className="prompts-list">
                      {suggestedPrompts.map((suggestion, index) => (
                        <button
                          key={index}
                          className="prompt-chip"
                          onClick={() => setPrompt(suggestion)}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button 
                    className="btn btn-primary btn-lg generate-btn"
                    onClick={handleGenerate}
                    disabled={!prompt.trim() || isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <span className="spinner"></span>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2"/>
                          <path d="M12 16v-4"/>
                          <path d="M12 8h.01"/>
                        </svg>
                        Generate Itinerary
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Generated Itinerary Result */}
                <div className="ai-result">
                  <div className="result-header">
                    <h2>Your AI-Generated Itinerary</h2>
                      <p>Da Nang Beach Adventure - 3 Days 2 Nights</p>
                  </div>

                  <div className="itinerary-preview">
                    {[
                      { day: 1, title: 'Arrival & My Khe Beach', activities: 6, estimatedCost: '$65' },
                      { day: 2, title: 'Marble Mountains & Food', activities: 5, estimatedCost: '$75' },
                      { day: 3, title: 'Hoi An Option & Departure', activities: 4, estimatedCost: '$55' },
                    ].map((day) => (
                      <div key={day.day} className="day-preview">
                        <div className="day-number">Day {day.day}</div>
                        <div className="day-details">
                          <h4>{day.title}</h4>
                          <span>{day.activities} activities</span>
                          <span>Est. cost: {day.estimatedCost}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="buddy-suggestions">
                    <h3>Suggested Local Buddies</h3>
                    <div className="suggested-buddies">
                      <div className="buddy-suggestion">
                        <div className="buddy-avatar">M</div>
                        <div className="buddy-info">
                          <h4>Lan Pham</h4>
                          <p>Da Nang Expert • 4.8 ★</p>
                        </div>
                        <Link to="/buddies/1" className="btn btn-outline btn-sm">View</Link>
                      </div>
                      <div className="buddy-suggestion">
                        <div className="buddy-avatar">L</div>
                        <div className="buddy-info">
                          <h4>Huy Nguyen</h4>
                          <p>Hoi An Culture Guide • 4.7 ★</p>
                        </div>
                        <Link to="/buddies/2" className="btn btn-outline btn-sm">View</Link>
                      </div>
                    </div>
                  </div>

                  <div className="result-actions">
                    <button className="btn btn-outline" onClick={() => { setShowResult(false); setPrompt('') }}>
                      Start Over
                    </button>
                    <button className="btn btn-secondary" onClick={handleGenerate}>
                      Regenerate
                    </button>
                    <Link to="/trip/1" className="btn btn-primary">
                      Save & View Details
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default AIGenerate
