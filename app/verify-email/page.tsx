'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/utils/supabase/auth'
import '../auth.css'

function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const role = (searchParams.get('role') === 'buddy' ? 'buddy' : 'tourist') as 'tourist' | 'buddy'

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  // userId is stashed in sessionStorage by /register; required by the OTP routes.
  const [userId, setUserId] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem('localit.pendingPayload')
      if (raw) {
        const parsed = JSON.parse(raw) as { userId?: string }
        if (parsed.userId) setUserId(parsed.userId)
      }
    } catch {}
  }, [])

  // Cooldown ticker for the "Resend code" button.
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown(c => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  // Auto-focus the first input on mount.
  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  function setDigitAt(idx: number, value: string) {
    setDigits(prev => {
      const next = [...prev]
      next[idx] = value.replace(/\D/g, '').slice(0, 1)
      return next
    })
    if (value && idx < 5) inputsRef.current[idx + 1]?.focus()
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputsRef.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < 5) {
      inputsRef.current[idx + 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    const next: string[] = ['', '', '', '', '', '']
    for (let i = 0; i < 6; i++) next[i] = pasted[i] ?? ''
    setDigits(next)
    const lastFilled = Math.min(5, pasted.length - 1)
    inputsRef.current[Math.min(5, lastFilled + 1)]?.focus()
  }

  const code = digits.join('')
  const codeReady = /^\d{6}$/.test(code)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!codeReady || loading) return
    setError('')
    setInfo('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, email, code }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string; userId?: string }
      if (!res.ok) {
        setError(body.error ?? `Verification failed (${res.status}).`)
        // Clear the code so the user can re-enter easily.
        setDigits(['', '', '', '', '', ''])
        inputsRef.current[0]?.focus()
        setLoading(false)
        return
      }

      // Read the role-specific payload that /register stashed in sessionStorage.
      let pendingPayload: { role: 'tourist' | 'buddy'; payload: Record<string, unknown>; userId: string } | null = null
      if (typeof window !== 'undefined') {
        try {
          const raw = sessionStorage.getItem('localit.pendingPayload')
          if (raw) pendingPayload = JSON.parse(raw)
        } catch {}
      }

      // Write the role-specific row (tourists/buddies) now that the email is
      // confirmed. Falls back gracefully if sessionStorage was cleared (e.g.
      // user opened a new tab) — they can still sign in and finish in the
      // profile editor.
      if (pendingPayload && body.userId === pendingPayload.userId) {
        const profileRes = await fetch('/api/auth/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId: pendingPayload.userId,
            role: pendingPayload.role,
            payload: pendingPayload.payload,
            autoConfirm: true, // safe: verify-otp already flipped the flag
          }),
        })
        if (!profileRes.ok) {
          const errBody = (await profileRes.json().catch(() => ({}))) as { error?: string }
          console.warn('[verify-email] create-profile failed:', errBody.error)
          // Non-fatal: continue to sign-in. The user can fix profile data later.
        }
      }

      // Sign the user in. We need their password — try sessionStorage first,
      // otherwise fall through to /login.
      const password = typeof window !== 'undefined' ? sessionStorage.getItem('localit.pendingPw') : null
      if (password) {
        const { error: signInError } = await signIn(email, password)
        if (signInError) {
          router.push(`/login?registered=1&email=${encodeURIComponent(email)}`)
          return
        }
      } else {
        router.push(`/login?registered=1&email=${encodeURIComponent(email)}`)
        return
      }
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('localit.pendingPw')
        sessionStorage.removeItem('localit.pendingRole')
        sessionStorage.removeItem('localit.pendingPayload')
      }

      router.push(role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard')
    } catch (err) {
      console.error(err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0 || !userId) return
    setError('')
    setInfo('')
    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(body.error ?? 'Could not resend code.')
        return
      }
      setInfo('A new verification code was sent to your email.')
      setResendCooldown(60)
    } catch (err) {
      console.error(err)
      setError('Could not resend code. Please try again.')
    }
  }

  if (!email) {
    return (
      <div className="auth-page">
        <div className="auth-form-section">
          <div className="auth-form-container">
            <h2>Missing email</h2>
            <p>We couldn&apos;t find the email you signed up with.</p>
            <Link href="/register" className="btn btn-primary btn-block">Start over</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-form-section">
        <div className="auth-form-container">
          <Link href="/" className="auth-logo" style={{ marginBottom: 24 }}>
            <span className="auth-logo-icon">L</span>
            <span>LOCALit</span>
          </Link>

          <div className="auth-header">
            <h2>Verify your email</h2>
            <p>
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish signing up.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="otp-0">Verification code</label>
              <div
                className="otp-input-grid"
                onPaste={handlePaste}
              >
                {digits.map((d, i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    ref={el => { inputsRef.current[i] = el }}
                    type="text"
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={1}
                    className="otp-cell"
                    value={d}
                    onChange={e => setDigitAt(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    autoComplete="one-time-code"
                    disabled={loading}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>
              <p className="form-hint" style={{ marginTop: 8 }}>
                Didn&apos;t get the code? Check your spam folder, or
                {' '}
                <button
                  type="button"
                  className="link-primary"
                  onClick={handleResend}
                  disabled={resendCooldown > 0}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: resendCooldown > 0 ? 'default' : 'pointer' }}
                >
                  {resendCooldown > 0 ? `resend in ${resendCooldown}s` : 'resend now'}
                </button>.
              </p>
            </div>

            {info && (
              <div className="alert alert-info">
                <span>✉️</span>
                <span>{info}</span>
              </div>
            )}

            {error && (
              <div className="alert alert-error">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={!codeReady || loading}
            >
              {loading ? 'Verifying…' : 'Verify & continue'}
            </button>
          </form>

          <div className="auth-footer">
            Wrong email? <Link href="/register">Sign up again</Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    }>
      <VerifyEmailForm />
    </Suspense>
  )
}