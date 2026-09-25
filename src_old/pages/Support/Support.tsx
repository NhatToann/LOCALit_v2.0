import { Link, useParams } from 'react-router-dom'
import './Support.css'

const content = {
  help: {
    title: 'Help Center',
    subtitle: 'Quick answers for planning with LOCALit.',
    items: [
      'Choose a destination, compare local buddies, then send a request or confirm a booking.',
      'Use chat to align pickup time, meeting point, food preferences, and accessibility needs.',
      'Your itinerary can be edited any time before the trip starts.',
    ],
  },
  safety: {
    title: 'Safety',
    subtitle: 'Simple safety rules for travelers and local buddies.',
    items: [
      'Meet in public places for first contact and keep your booking details inside LOCALit.',
      'Check buddy rating, languages, availability, and cancellation note before booking.',
      'Use the trip chat to share schedule changes so both sides have a clear record.',
    ],
  },
  terms: {
    title: 'Terms',
    subtitle: 'Demo terms for this MVP experience.',
    items: [
      'Listings, prices, ratings, and payments are demo data for product validation.',
      'A confirmed booking creates a local demo record in your browser storage.',
      'Real payments, identity checks, and dispute handling would be added in production.',
    ],
  },
  privacy: {
    title: 'Privacy',
    subtitle: 'How this MVP handles your demo data.',
    items: [
      'Profile interests and booking confirmations are saved locally in your browser.',
      'No real payment details are sent to a server in this frontend-only MVP.',
      'Clear browser storage if you want to reset demo data.',
    ],
  },
}

const Support = () => {
  const { topic = 'help' } = useParams()
  const page = content[topic as keyof typeof content] || content.help

  return (
    <div className="support-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">{page.title}</h1>
          <p className="page-subtitle">{page.subtitle}</p>
        </div>
      </section>

      <section className="support-content">
        <div className="container">
          <div className="support-panel">
            {page.items.map((item) => (
              <div key={item} className="support-row">
                <span className="support-check">✓</span>
                <p>{item}</p>
              </div>
            ))}
            <div className="support-actions">
              <Link to="/booking" className="btn btn-primary">Start Booking</Link>
              <Link to="/chat" className="btn btn-outline">Open Chat</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Support
