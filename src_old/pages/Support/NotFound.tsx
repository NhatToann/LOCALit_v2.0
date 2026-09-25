import { Link } from 'react-router-dom'
import './Support.css'

const NotFound = () => (
  <div className="not-found-page">
    <section className="not-found-content">
      <div className="container">
        <div className="not-found-panel">
          <h2>Page not found</h2>
          <p>This page is not available in the LOCALit MVP. Choose one of the main actions below.</p>
          <div className="not-found-actions">
            <Link to="/" className="btn btn-outline">Go Home</Link>
            <Link to="/buddies" className="btn btn-primary">Find Buddies</Link>
            <Link to="/booking" className="btn btn-secondary">Open Booking</Link>
          </div>
        </div>
      </div>
    </section>
  </div>
)

export default NotFound
