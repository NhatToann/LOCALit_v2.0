import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import './Header.css'

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const location = useLocation()

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/cities', label: 'Destinations' },
    { path: '/buddies', label: 'Buddies' },
    { path: '/booking', label: 'Booking' },
    { path: '/trips', label: 'My Trips' },
  ]

  const isActive = (path: string) => location.pathname === path || (path === '/booking' && location.pathname === '/interest')

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <span className="logo-icon">🌍</span>
          <span className="logo-text">LOCALit</span>
        </Link>

        <nav className="nav-desktop">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              to={link.path}
              className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <Link to="/profile" className="btn btn-outline">
            My Profile
          </Link>
          
          <Link to="/login" className="btn btn-primary">
            Logout
          </Link>
        </div>

        <button className="mobile-menu-btn" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

        {isMenuOpen && (
        <div className="mobile-menu">
          <nav className="mobile-nav">
            {navLinks.map((link) => (
              <Link
                key={link.label}
                to={link.path}
                className="mobile-nav-link"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mobile-actions">
            <Link to="/profile" className="btn btn-outline" onClick={() => setIsMenuOpen(false)}>
              My Profile
            </Link>
            <Link to="/login" className="btn btn-primary" onClick={() => setIsMenuOpen(false)}>
              Logout
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

export default Header
