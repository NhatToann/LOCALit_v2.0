import { useState } from 'react'
import { Link } from 'react-router-dom'
import './BuddyRequests.css'

const BuddyRequests = () => {
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted' | 'declined'>('pending')
  const [status, setStatus] = useState('')

  const requests = [
    { id: 1, tourist: 'John Doe', location: 'Da Nang', date: '2026-08-15', duration: '3 days', status: 'pending', message: 'Hi! I would love to explore Da Nang with you.' },
    { id: 2, tourist: 'Sarah Smith', location: 'Da Nang', date: '2026-08-22', duration: '2 days', status: 'pending', message: 'Looking forward to experiencing local culture!' },
    { id: 3, tourist: 'Mike Johnson', location: 'Hoi An', date: '2026-09-02', duration: '4 days', status: 'pending', message: 'Can you show me the best food spots?' },
  ]

  const acceptedRequests = [
    { id: 4, tourist: 'Emily Davis', location: 'Da Nang', date: '2026-08-05', duration: '3 days' },
    { id: 5, tourist: 'Chris Lee', location: 'Da Nang', date: '2026-08-18', duration: '2 days' },
  ]

  const currentRequests = activeTab === 'pending' ? requests : activeTab === 'accepted' ? acceptedRequests : []

  const handleAccept = (id: number) => {
    setStatus(`Request ${id} accepted. The tourist can now contact you in chat.`)
  }

  const handleDecline = (id: number) => {
    setStatus(`Request ${id} declined for this MVP demo.`)
  }

  return (
    <div className="buddy-requests-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">Booking Requests</h1>
          <p className="page-subtitle">Manage your incoming booking requests</p>
        </div>
      </section>

      <section className="requests-content">
        <div className="container">
          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
                onClick={() => setActiveTab('pending')}
              >
                Pending ({requests.length})
              </button>
              <button 
                className={`tab ${activeTab === 'accepted' ? 'active' : ''}`}
                onClick={() => setActiveTab('accepted')}
              >
                Accepted ({acceptedRequests.length})
              </button>
              <button 
                className={`tab ${activeTab === 'declined' ? 'active' : ''}`}
                onClick={() => setActiveTab('declined')}
              >
                Declined (0)
              </button>
            </div>
          </div>
          {status && <div className="mvp-message success">{status}</div>}

          <div className="requests-list">
            {activeTab === 'pending' && requests.map((request) => (
              <div key={request.id} className="request-card">
                <div className="request-header">
                  <div className="tourist-info">
                    <div className="tourist-avatar">{request.tourist.charAt(0)}</div>
                    <div>
                      <h3>{request.tourist}</h3>
                      <p>Sent you a request</p>
                    </div>
                  </div>
                  <span className="request-status pending">Pending</span>
                </div>
                <div className="request-details">
                  <div className="detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {request.location}
                  </div>
                  <div className="detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                    </svg>
                    {request.date}
                  </div>
                  <div className="detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {request.duration}
                  </div>
                </div>
                <div className="request-message">
                  <p>"{request.message}"</p>
                </div>
                <div className="request-actions">
                  <button className="btn btn-outline" onClick={() => handleDecline(request.id)}>
                    Decline
                  </button>
                  <button className="btn btn-primary" onClick={() => handleAccept(request.id)}>
                    Accept
                  </button>
                </div>
              </div>
            ))}

            {activeTab === 'accepted' && acceptedRequests.map((request) => (
              <div key={request.id} className="request-card accepted">
                <div className="request-header">
                  <div className="tourist-info">
                    <div className="tourist-avatar">{request.tourist.charAt(0)}</div>
                    <div>
                      <h3>{request.tourist}</h3>
                      <p>Accepted on {request.date}</p>
                    </div>
                  </div>
                  <span className="request-status accepted">Accepted</span>
                </div>
                <div className="request-details">
                  <div className="detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {request.location}
                  </div>
                  <div className="detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                    </svg>
                    {request.date}
                  </div>
                  <div className="detail-item">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {request.duration}
                  </div>
                </div>
                <div className="request-actions">
                  <Link to="/chat" className="btn btn-primary">Contact Tourist</Link>
                </div>
              </div>
            ))}

            {activeTab === 'declined' && (
              <div className="empty-state">
                <p>No declined requests</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

export default BuddyRequests
