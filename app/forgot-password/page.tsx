'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { KeyRound, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react'
import { resetPassword } from '@/utils/supabase/auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailValid = EMAIL_REGEX.test(email.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!emailValid) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    const { error: resetError } = await resetPassword(email.trim())
    setLoading(false)

    if (resetError) {
      setError('Could not send the email. Please try again later.')
      return
    }
    setSent(true)
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
          Enter your registered email and we&apos;ll send you a reset link.
        </p>
      </header>

      {sent ? (
        <div className="alert alert-success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <div>
            <p className="font-semibold">Reset email sent.</p>
            <p className="text-sm mt-1">
              Check the inbox for <strong>{email}</strong> and follow the instructions.
            </p>
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
              autoComplete="email"
              maxLength={254}
              required
            />
            {email && !emailValid ? (
              <p className="form-hint text-danger">That email address isn&apos;t valid.</p>
            ) : null}
          </div>

          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading || !emailValid}
            className="w-full h-11 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-sm text-muted text-center mt-6">
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      </p>
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
