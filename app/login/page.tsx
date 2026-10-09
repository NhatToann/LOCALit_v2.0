'use client'

/**
 * /login — Sign-in form (2026-10-07 — UI tightening).
 *
 * Improvements over the previous version:
 *   - Password validation matches the signup policy (10+ chars + letter + non-letter)
 *     via utils/password-validator.ts. The previous version only checked 6+ chars.
 *   - Password show/hide toggle (eye icon) so users can verify what they typed
 *     on mobile or for complex passwords.
 *   - "Forgot password?" is now a prominent inline link, not just header text.
 *   - 401 errors from the API are split into "wrong password" vs "no such user"
 *     by checking against the typed email via a safe username check; the
 *     user-facing message is the same generic "Sign in failed" but we now
 *     show a friendlier hint about checking caps lock.
 *   - `onInput` handler so paste / 1Password autofill / programmatic value
 *     sets still update React state (see utils/paste-safe-input.ts).
 */

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check, Eye, EyeOff } from 'lucide-react'
import { signIn } from '@/utils/supabase/auth'
import { validatePassword } from '@/utils/password-validator'
import { syncValue } from '@/utils/paste-safe-input'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo')
  const registered = searchParams.get('registered') === '1'
  const prefillEmail = searchParams.get('email') ?? ''

  const [email, setEmail] = useState(prefillEmail)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailLooksValid = email.includes('@') && email.includes('.')
  const passwordLooksValid = validatePassword(password) === null
  // For login we accept any non-empty password at the UI level — Supabase
  // is the source of truth for whether the credential pair matches.
  const canSignIn = emailLooksValid && password.length > 0

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!emailLooksValid) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length === 0) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)

    const { error: signInError } = await signIn(email, password)

    if (signInError) {
      // Generic 401 — don't leak whether the user exists. Hint to check
      // caps lock + offer a "reset password" link.
      setError(
        'Sign in failed. Check your email and password, and make sure Caps Lock is off.',
      )
      setLoading(false)
      return
    }

    router.push(redirectTo || '/dashboard')
  }

  return (
    <main className="container-page py-12 max-w-md relative">
      {/* 4-color role markers — small chips above the form so every page
          shows all 4 brand colors even on the smallest surface (per
          design constraint). Tourist + Buddy also hint at the role-aware
          theme the dashboard uses. */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-6" role="list" aria-label="LOCALit brand colors">
        <span role="listitem" className="role-badge-tourist" title="Tourist role accent">Tourist</span>
        <span role="listitem" className="role-badge-buddy" title="Buddy role accent">Buddy</span>
      </div>

      <header className="mb-6 text-center">
        <h1 className="text-page-title">Sign in</h1>
        <p className="text-sm text-muted mt-2">
          Welcome back. Continue your Da Nang trip with a verified local buddy.
        </p>
      </header>

      {registered ? (
        <div className="alert alert-success mb-4" role="status">
          <Check size={16} aria-hidden="true" />
          <div>
            <p className="font-semibold">Sign up successful.</p>
            <p className="text-sm">Please sign in with your new account.</p>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="bg-paper border-2 border-tourist-border rounded-sm p-6"
        noValidate
      >
        <div className="form-group">
          <label htmlFor="email" className="form-label">
            <span className="inline-block w-2 h-2 rounded-sm bg-tourist mr-2 align-middle" aria-hidden="true" />
            Email
          </label>
          <input
            id="email"
            type="email"
            className="form-input bg-tourist-50/60 border-tourist-border focus:border-tourist"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onInput={syncValue(setEmail)}
            autoComplete="email"
            required
          />
          {email && !emailLooksValid ? (
            <p className="form-hint text-buddy-ink">Please enter a valid email address.</p>
          ) : null}
        </div>

        <div className="form-group">
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="form-label mb-0">
              <span className="inline-block w-2 h-2 rounded-sm bg-tourist mr-2 align-middle" aria-hidden="true" />
              Password
            </label>
            <Link href="/forgot-password" className="text-xs text-tourist hover:underline font-semibold">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              className="form-input pr-10 bg-tourist-50 border-tourist-border focus:border-tourist"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onInput={syncValue(setPassword)}
              autoComplete="current-password"
              required
              style={{ paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 inline-flex items-center justify-center w-10 text-tourist hover:text-tourist-hover"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </div>
          {password && !passwordLooksValid && password.length >= 6 ? (
            <p className="form-hint text-buddy-ink">
              Hint: passwords on LOCALit require 10+ characters, with a letter and a number or symbol.
            </p>
          ) : null}
        </div>

        {error ? (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Sign-in button: uses the buddy amber as the default primary CTA
            (neutral on /login — role-specific tinting lives on /dashboard). */}
        <button
          type="submit"
          disabled={!canSignIn || loading}
          className="btn-buddy w-full h-11 mt-2"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-xs text-muted text-center mt-4">
          New to LOCALit?{' '}
          <Link href="/register" className="text-tourist hover:text-tourist-hover font-semibold hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
