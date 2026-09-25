import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import './Auth.css'

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const wasJustRegistered = location.state?.registered
  const [notice, setNotice] = useState('')

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Demo login - in real app would authenticate
    navigate('/matching')
  }

  const emailLooksValid = formData.email.includes('@') && formData.email.includes('.')
  const canSignIn = emailLooksValid && formData.password.length >= 6

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Left Side - Branding */}
        <div className="auth-branding">
          <div className="branding-content">
            <Link to="/" className="auth-logo">
              <span className="logo-icon">L</span>
              <span>LOCALit</span>
            </Link>
            
            <div className="branding-text">
              <h1>Welcome Back</h1>
              <p>Continue your journey and connect with amazing local buddies</p>
            </div>

            <div className="branding-features">
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Smart matching based on your preferences</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Real-time location of nearby buddies</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Plan and collaborate on itineraries</span>
              </div>
            </div>
          </div>

          <div className="branding-image">
            <img src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&h=600&fit=crop" alt="Travel" />
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="auth-form-section">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2>Sign In</h2>
              <p>Welcome back! Please enter your details.</p>
            </div>

            {wasJustRegistered && (
              <div className="login-info">
                <div className="success-checkmark">✓</div>
                <h3 style={{ textAlign: 'center', color: 'var(--text-primary)' }}>Registration Successful!</h3>
                <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '8px' }}>
                  Please sign in with your new account
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  required
                />
                {formData.email && !emailLooksValid && (
                  <p className="form-hint error">Please enter a valid email address.</p>
                )}
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  required
                />
                {formData.password && formData.password.length < 6 && (
                  <p className="form-hint error">Password should be at least 6 characters for this demo.</p>
                )}
              </div>

              <div className="form-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData.rememberMe}
                    onChange={(e) => setFormData({...formData, rememberMe: e.target.checked})}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--primary)' }}
                  />
                  <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Remember me</span>
                </label>
                <Link to="/forgot-password" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                  Forgot password?
                </Link>
              </div>

              {!canSignIn && (
                <p className="form-hint">Enter a valid email and password to continue to matching.</p>
              )}

              <button type="submit" className="btn btn-primary btn-block" style={{ marginTop: '24px' }} disabled={!canSignIn}>
                Sign In
              </button>
            </form>

            <div className="auth-divider">
              <span>or continue with</span>
            </div>

            {notice && <div className="mvp-message info">{notice}</div>}

            <div className="social-buttons">
              <button type="button" className="social-btn" onClick={() => setNotice('Google sign-in is a demo placeholder. Please use email sign-in for the MVP.')}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button type="button" className="social-btn" onClick={() => setNotice('GitHub sign-in is a demo placeholder. Please use email sign-in for the MVP.')}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </button>
            </div>

            <div className="auth-footer">
              Don't have an account? <Link to="/register">Sign up</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
