'use client'

/**
 * /forgot-password — password reset request (2026-10-07 — UI tightening).
 *
 * Improvements over the previous version:
 *   - Explicit "didn't get it?" recovery path: Resend button + a hint to
 *     check spam / wait 30s. (Resend test mode only sends to the account
 *     owner; production needs a verified domain — see AGENTS.md.)
 *   - Trim email before submitting (leading whitespace from autocomplete
 *     used to slip through and trip the API).
 *   - `onInput` handler so paste / autofill still update React state.
 *   - Better empty / error copy that mirrors the security tone of the
 *     rest of the auth flow ("If an account exists for this email, ...")
 *     without leaking whether the email is registered.
 */

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { KeyRound, AlertTriangle, CheckCircle2, ArrowLeft, Info, Mail } from 'lucide-react'
import { resetPassword } from '@/utils/supabase/auth'
import { syncValue } from '@/utils/paste-safe-input'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  const emailValid = EMAIL_REGEX.test(email.trim())

  async function sendReset() {
    setError('')
    if (!emailValid) {
      setError('Please enter a valid email address.')
      return
    }
    setLoading(true)
    const { error: resetError } = await resetPassword(email.trim().toLowerCase())
    setLoading(false)
    if (resetError) {
      // 429 = rate limit, otherwise generic.
      setError(
        'Could not send the reset email. Please wait a minute and try again.',
      )
      return
    }
    setSent(true)
  }

  async function resend() {
    if (resending) return
    setError('')
    setResending(true)
    const { error: resetError } = await resetPassword(email.trim().toLowerCase())
    setResending(false)
    if (resetError) {
      setError('Could not resend. Please wait a minute and try again.')
      return
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (sent) return
    sendReset()
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
        <h1 className="text-page-title">Forgot password?</h1>
        <p className="text-sm text-muted mt-2 max-w-sm mx-auto">
          Enter your email and we&apos;ll send you a link to set a new password.
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
              <p className="font-semibold">Reset link sent.</p>
              <p className="text-sm mt-1">
                Check the inbox for <strong>{email}</strong>. The link works once
                and expires in 1 hour.
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
              onClick={resend}
              disabled={resending}
              className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
            >
              <Mail size={14} aria-hidden="true" />
              {resending ? 'Sending…' : 'Resend email'}
            </button>
            <button
              type="button"
              onClick={() => {
                setSent(false)
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
          className="border border-border rounded-sm bg-surface p-6"
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
            {loading ? 'Sending…' : 'Send reset link'}
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
