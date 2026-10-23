'use client'

/**
 * /forgot-password — start a password reset (2026-10-11: emailed OTP).
 *
 * CHANGED FROM THE SUPABASE LINK FLOW
 * ----------------------------------
 * This page used to call `resetPasswordForEmail()` and promise a reset
 * link. That could not work: `/auth/v1/recover` returns 429
 * `over_email_send_rate_limit` for every already-registered address, for
 * hours at a time. The page reported success and no email ever arrived —
 * confirmed against the live project, where two unrelated accounts were
 * throttled while a never-seen address returned 200.
 *
 * It now requests a 6-digit code from our own mailer
 * (/api/auth/reset-otp/start) and hands the user to /reset-password,
 * carrying the `resetId` that step needs.
 *
 * Security: the response is identical for registered and unknown
 * addresses, so this page cannot be used to discover which emails exist.
 */

import { useState, Suspense } from 'react'
import { Link } from '@/components/ui/Link'
import {
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  ArrowLeft,
  Info,
  Mail,
} from 'lucide-react'
import { syncValue } from '@/utils/paste-safe-input'
import { navigate } from '@/lib/navigation'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  /** Set by /api/auth/reset-otp/start; required by the code step. */
  const [resetId, setResetId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  /** Set when this connection is rate-limited. Retrying only keeps the
   *  limit raised, so we disable the button and tell the user to wait. */
  const [throttled, setThrottled] = useState(false)

  const emailValid = EMAIL_REGEX.test(email.trim())

  async function sendReset(): Promise<boolean> {
    const res = await fetch('/api/auth/reset-otp/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (res.status === 429) {
        setThrottled(true)
        setError(
          'Too many reset emails were requested from this connection. ' +
            'Please wait a few minutes before trying again.',
        )
      } else {
        setError(data.error ?? 'Could not send the reset email. Try again.')
      }
      return false
    }

    setResetId(typeof data.resetId === 'string' ? data.resetId : null)
    setSent(true)
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sent) return
    setError('')
    if (!emailValid) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    try {
      await sendReset()
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  async function resend() {
    if (resending || throttled) return
    setError('')
    setResending(true)
    try {
      await sendReset()
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setResending(false)
    }
  }

  return (
    <main className="container-page py-12 max-w-md">
      <Link
        href="/login"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to sign in
      </Link>

      <header className="text-center mb-6">
        <span
          className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-paper text-primary mb-3"
          aria-hidden="true"
        >
          <KeyRound size={24} />
        </span>
        <h1 className="text-page-title text-ink">Forgot password?</h1>
        <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
          Enter your email and we&apos;ll send you a 6-digit code to set a new
          password.
        </p>
      </header>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {sent ? (
        <div className="space-y-3">
          <div className="alert alert-success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <div>
              <p className="font-semibold">Reset code sent.</p>
              <p className="text-sm mt-1">
                Check the inbox for <strong>{email}</strong>. The code works once
                and expires in 15 minutes.
              </p>
            </div>
          </div>

          <div
            className="alert"
            role="status"
            style={{ borderColor: 'var(--info)', background: 'var(--info-bg)' }}
          >
            <Info size={16} aria-hidden="true" style={{ color: 'var(--info)' }} />
            <div>
              <p className="text-sm font-semibold text-ink">Didn&apos;t get the email?</p>
              <ul className="text-xs text-muted mt-1 list-disc pl-4 space-y-0.5">
                <li>Wait 30 seconds — it can take a moment to arrive.</li>
                <li>Check your spam or junk folder.</li>
                <li>Make sure <strong>{email}</strong> is the address you registered with.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                resetId
                  ? navigate(`/reset-password?resetId=${encodeURIComponent(resetId)}`)
                  : setError('This reset session expired. Send the code again.')
              }
              className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              Enter the code
            </button>
            <button
              type="button"
              onClick={resend}
              disabled={resending || throttled}
              className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
            >
              <Mail size={14} aria-hidden="true" />
              {resending ? 'Sending…' : 'Resend code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSent(false)
                setResetId(null)
                setError('')
              }}
              className="inline-flex items-center h-10 px-3 text-sm text-muted hover:text-ink"
            >
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="border border-border rounded-sm bg-surface-glass p-6"
          noValidate
        >
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email</label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onInput={syncValue(setEmail)}
              autoComplete="email"
              maxLength={254}
              required
            />
            {email && !emailValid ? (
              <p className="form-hint text-danger">Please enter a valid email address.</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!emailValid || loading}
            className="w-full h-11 mt-2 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending…' : 'Send reset code'}
          </button>

          <p className="text-xs text-muted text-center mt-4">
            Remembered your password?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </main>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  )
}