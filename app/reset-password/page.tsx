'use client'

/**
 * /reset-password — set a new password after clicking the email link.
 *
 * This page is reached from the password-reset email link. The link contains
 * a Supabase auth session token (single-use, expires in 1 hour). If the
 * session is missing or expired, the form MUST be disabled — otherwise the
 * user can type a password, click "Save", and get a cryptic Supabase error.
 *
 * Improvements (2026-10-07):
 *   - Gate the form on a valid session. While we wait for the session
 *     check, show a spinner. If the session is missing/expired, render a
 *     "request a new link" message and DO NOT render the password form.
 *   - Use the canonical `validatePassword` (10+ chars + letter + non-letter)
 *     so the new password matches the rest of the app's policy.
 *   - `onInput` handler so paste / autofill update React state.
 *   - Show / hide password toggle for both fields.
 *   - Better success path: after updatePassword, route to /dashboard.
 */

import { useState, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, AlertTriangle, ArrowLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { updatePassword, getCurrentUser } from '@/utils/supabase/auth'
import { validatePassword } from '@/utils/password-validator'
import { syncValue } from '@/utils/paste-safe-input'

function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const user = await getCurrentUser()
      if (cancelled) return
      setHasSession(!!user)
      setChecking(false)
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  const passwordsMatch = password === confirmPassword
  const passwordError = password ? validatePassword(password) : null
  const passwordValid = passwordError === null
  const canSubmit = passwordsMatch && passwordValid && !loading && hasSession

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!hasSession) {
      setError('This reset link is invalid or has expired. Please request a new one.')
      return
    }
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (!passwordsMatch) {
      setError('The confirmation password does not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await updatePassword(password)
    setLoading(false)

    if (updateError) {
      setError(updateError.message || 'Could not reset your password. Please try again.')
      return
    }

    setSuccess(true)
    // Give the user a moment to read the success message, then route.
    setTimeout(() => router.push('/dashboard'), 1200)
  }

  if (checking) {
    return (
      <main className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" aria-label="Checking reset link" />
        <p className="text-sm text-muted mt-3">Checking your reset link…</p>
      </main>
    )
  }

  if (!hasSession) {
    return (
      <main className="container-page py-12 max-w-md">
        <Link
          href="/forgot-password"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Request a new reset link
        </Link>
        <div className="border border-border rounded-sm bg-surface p-6 text-center">
          <span
            className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-warning-bg text-warning mb-3"
            aria-hidden="true"
          >
            <AlertTriangle size={24} />
          </span>
          <h1 className="text-section-title mb-2">Reset link expired</h1>
          <p className="text-sm text-muted">
            This password reset link is invalid or has expired. Reset links
            work once and are valid for 1 hour.
          </p>
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center h-11 px-4 mt-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            Request a new link
          </Link>
        </div>
      </main>
    )
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
          <Lock size={24} />
        </span>
        <h1 className="text-page-title">Reset your password</h1>
        <p className="text-sm text-muted mt-2">Choose a new password for your account.</p>
      </header>

      {success ? (
        <div className="alert alert-success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <div>
            <p className="font-semibold">Password updated.</p>
            <p className="text-sm mt-1">Redirecting you to the dashboard…</p>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="border border-border rounded-sm bg-surface p-6"
          noValidate
        >
          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="form-group">
            <label htmlFor="password" className="form-label">New password</label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="form-input pr-10"
                placeholder="At least 10 characters with a letter and a number or symbol"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onInput={syncValue(setPassword)}
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
                style={{ paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 inline-flex items-center justify-center w-10 text-muted hover:text-ink"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
            {password && passwordError ? (
              <p className="form-hint text-danger">{passwordError}</p>
            ) : password ? (
              <p className="form-hint">Looks good.</p>
            ) : null}
          </div>

          <div className="form-group">
            <label htmlFor="confirm" className="form-label">Confirm new password</label>
            <input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              className="form-input"
              placeholder="Re-enter your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onInput={syncValue(setConfirmPassword)}
              autoComplete="new-password"
              maxLength={128}
              required
            />
            {confirmPassword && !passwordsMatch ? (
              <p className="form-hint text-danger">The confirmation password does not match.</p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full h-11 mt-2 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving…' : 'Reset password'}
          </button>
        </form>
      )}
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
