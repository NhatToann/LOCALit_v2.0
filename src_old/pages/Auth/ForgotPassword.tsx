import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Auth.css'

const ForgotPassword = () => {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const isValid = email.includes('@') && email.includes('.')

  return (
    <div className="auth-page">
      <div className="auth-container compact-auth">
        <div className="auth-form-section full-width">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2>Reset Password</h2>
              <p>Enter your email and we will send demo reset instructions.</p>
            </div>

            {sent && (
              <div className="mvp-message success">
                Reset instructions were sent to {email}. For this MVP, you can go back and sign in.
              </div>
            )}

            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setSent(false)
                }}
              />
              {!isValid && email && <p className="form-hint error">Please enter a valid email address.</p>}
            </div>

            <button className="btn btn-primary btn-block" disabled={!isValid} onClick={() => setSent(true)}>
              Send Reset Link
            </button>

            <div className="auth-footer">
              Remember your password? <Link to="/login">Sign in</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
