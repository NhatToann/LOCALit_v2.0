'use client'

/**
 * /reset-password — choose a new password with a 6-digit emailed code.
 *
 * WHY THIS IS A CODE AND NOT A LINK (2026-10-11)
 * ----------------------------------------------
 * The Supabase recovery-link flow cannot work on this project:
 * `/auth/v1/recover` answers 429 `over_email_send_rate_limit` for every
 * already-registered address, for hours at a time. The user clicks "send",
 * sees a success message, and no mail ever arrives. Confirmed end-to-end
 * against the live project — two unrelated accounts were throttled while a
 * never-seen address returned 200.
 *
 * So the code is issued and mailed by OUR OWN server via `sendEmail()`
 * (SMTP / Resend), which does not go through GoTrue and is unaffected.
 *
 * Flow: /forgot-password → start → this page → verify → complete.
 * Endpoints: /api/auth/reset-otp/{start,verify,complete}
 *
 * The old page drove Supabase's PKCE/implicit recovery session. That code
 * is deliberately gone: it could never be reached on this project, and the
 * OTP flow does not depend on a browser session at all — which also means
 * it works even if the user is signed in as somebody else.
 *
 * Security notes:
 *   - A code is weaker than a link: it proves mailbox access at a point in
 *     time rather than binding to one URL. Accepted deliberately (see
 *     utils/reset-otp.ts) and mitigated by bcrypt-at-rest, a 15-minute TTL,
 *     a 5-attempt cap, and per-IP rate limits on every endpoint.
 *   - The API never confirms whether an address is registered, so this page
 *     cannot be used to enumerate users.
 */

import { useState, Suspense, useCallback } from 'react'
import { Link } from '@/components/ui/Link'
import {
  Lock,
  AlertTriangle,
  ArrowLeft,
  Eye,
  EyeOff,
  CheckCircle2,
  Mail,
  KeyRound,
} from 'lucide-react'
import { validatePassword } from '@/utils/password-validator'
import { syncValue } from '@/utils/paste-safe-input'
import { navigate } from '@/lib/navigation'

/** Read the resetId handed over from /forgot-password. */
function useResetId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return new URLSearchParams(window.location.search).get('resetId')
  } catch {
    return null
  }
}

function ResetPasswordFlow() {
  const initialResetId = useResetId()

  const [resetId, setResetId] = useState<string | null>(initialResetId)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [verified, setVerified] = useState(false)

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState(false)
  const [success, setSuccess] = useState(false)

  const code = otp.join('')
  const codeComplete = otp.every((d) => d !== '')

  const passwordsMatch = password === confirmPassword
  const passwordError = password ? validatePassword(password) : null
  const canSave =
    passwordsMatch && passwordError === null && !saving && verified && !!resetId

  /** 1. Ask the API to mail a fresh code. */
  const requestCode = useCallback(async (targetEmail: string) => {
    setError('')
    setVerifying(true)
    try {
      const res = await fetch('/api/auth/reset-otp/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Could not send the reset email. Try again.')
        return false
      }

      setResetId(data.resetId ?? null)
      setEmail(data.email ?? targetEmail)
      setOtp(['', '', '', '', '', ''])
      setVerified(false)
      setPassword('')
      setConfirmPassword('')

      // Dev convenience: OTP_PREVIEW echoes the code so this is testable
      // without an inbox. Unset in production.
      if (data.__devCode) {
        setOtp(String(data.__devCode).split('').slice(0, 6))
      }
      return true
    } catch {
      setError('Could not reach the server. Check your connection.')
      return false
    } finally {
      setVerifying(false)
    }
  }, [])

  /** 2. Check the code. */
  const verifyCode = useCallback(async () => {
    setError('')
    if (!resetId) {
      setError('This reset session is missing. Request a new code.')
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.')
      return
    }

    setVerifying(true)
    try {
      const res = await fetch('/api/auth/reset-otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resetId, code }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'That code is not correct.')
        // A burned request cannot be recovered — force a fresh code.
        if (res.status === 410) {
          setVerified(false)
          setResetId(null)
        }
        return
      }

      setEmail(data.email ?? email)
      setVerified(true)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setVerifying(false)
    }
  }, [code, email, resetId])

  /** 3. Write the new password. */
  const savePassword = useCallback(async () => {
    setError('')
    if (!resetId) {
      setError('This reset session is missing. Request a new code.')
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

    setSaving(true)
    try {
      const res = await fetch('/api/auth/reset-otp/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resetId, password }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error ?? 'Could not set your new password.')
        if (res.status === 410) setVerified(false)
        return
      }

      setSuccess(true)
      setTimeout(() => navigate('/login'), 1600)
    } catch {
      setError('Could not reach the server. Check your connection.')
    } finally {
      setSaving(false)
    }
  }, [passwordError, passwordsMatch, password, resetId])

  /** Enter is the fastest path through a 6-box code. */
  const onOtpKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) {
      const inputs = document.querySelectorAll<HTMLInputElement>(
        'input[aria-label^="Digit"]',
      )
      inputs[i - 1]?.focus()
    }
    if (e.key === 'Enter' && codeComplete && !verifying) {
      e.preventDefault()
      verifyCode()
    }
  }

  const onOtpPaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (pasted.length === 0) return
    e.preventDefault()
    const next = ['', '', '', '', '', '']
    for (let k = 0; k < 6 && k < pasted.length; k++) next[k] = pasted[k]
    setOtp(next)
    document.querySelectorAll<HTMLInputElement>('input[aria-label^="Digit"]')[
      Math.min(pasted.length, 5)
    ]?.focus()
  }

  // ---- Screen 1: ask for the email -------------------------------------
  if (!resetId) {
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
          <h1 className="text-page-title">Reset your password</h1>
          <p className="text-sm text-muted mt-2">
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

        <form
          className="border border-border rounded-sm bg-surface p-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            const value = (e.currentTarget.elements.namedItem('email') as HTMLInputElement)
              ?.value
              .trim()
              .toLowerCase()
            if (!value) {
              setError('Enter your email address.')
              return
            }
            requestCode(value)
          }}
        >
          <div className="form-group">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              autoComplete="email"
              maxLength={254}
              required
              disabled={verifying}
            />
          </div>

          <button
            type="submit"
            disabled={verifying}
            className="w-full h-11 mt-2 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? 'Sending…' : 'Send reset code'}
          </button>
        </form>
      </main>
    )
  }

  // ---- Screen 2: enter the code, then the new password -------------------
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
          {verified ? <Lock size={24} /> : <Mail size={24} />}
        </span>
        <h1 className="text-page-title">
          {verified ? 'Choose a new password' : 'Enter your reset code'}
        </h1>
        <p className="text-sm text-muted mt-2">
          {verified ? (
            <>Your new password must be at least 10 characters.</>
          ) : (
            <>
              We sent a 6-digit code to{' '}
              <strong className="text-ink">{email}</strong>.
            </>
          )}
        </p>
      </header>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {success ? (
        <div className="alert alert-success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <div>
            <p className="font-semibold">Password updated.</p>
            <p className="text-sm mt-1">Taking you to sign in…</p>
          </div>
        </div>
      ) : !verified ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              verifyCode()
            }}
            noValidate
          >
            <div className="form-group">
              <label htmlFor="digit-0" className="form-label">
                Reset code
              </label>
              <div className="flex gap-2" role="group" aria-label="6-digit code">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`digit-${i}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    className="form-input text-center text-lg"
                    style={{ width: 44, height: 48, padding: 0 }}
                    value={digit}
                    aria-label={`Digit ${i + 1}`}
                    disabled={verifying}
                    onChange={(e) => {
                      // Functional setState so the closure always reads
                      // the latest `otp`, never a stale snapshot (the
                      // paste handler may have just committed 6 digits
                      // before this onChange fires).
                      setOtp((prev) => {
                        const next = [...prev]
                        next[i] = e.target.value.replace(/\D/g, '').slice(0, 1)
                        return next
                      })
                      if (e.target.value && i < 5) {
                        // Defer focus so it runs after React commits
                        // the new state, otherwise the focus call can
                        // race the next render.
                        queueMicrotask(() => {
                          document
                            .querySelectorAll<HTMLInputElement>(
                              'input[aria-label^="Digit"]',
                            )[i + 1]?.focus()
                        })
                      }
                    }}
                    onPaste={onOtpPaste}
                    onKeyDown={(e) => onOtpKeyDown(e, i)}
                  />
                ))}
              </div>
              <p className="form-hint mt-2">
                The code expires in 15 minutes and works once.
              </p>
            </div>

            <button
              type="submit"
              disabled={!codeComplete || verifying}
              className="w-full h-11 mt-2 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? 'Checking…' : 'Verify code'}
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              type="button"
              disabled={resending}
              onClick={() => requestCode(email)}
              className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
            >
              <Mail size={14} aria-hidden="true" />
              {resending ? 'Sending…' : 'Send a new code'}
            </button>
            <button
              type="button"
              onClick={() => {
                setResetId(null)
                setError('')
                setOtp(['', '', '', '', '', ''])
              }}
              className="inline-flex items-center h-10 px-3 text-sm text-muted hover:text-ink"
            >
              Use a different email
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            savePassword()
          }}
          className="border border-border rounded-sm bg-surface p-6"
          noValidate
        >
          <div className="form-group">
            <label htmlFor="password" className="form-label">
              New password
            </label>
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
                {showPassword ? (
                  <EyeOff size={16} aria-hidden="true" />
                ) : (
                  <Eye size={16} aria-hidden="true" />
                )}
              </button>
            </div>
            {password && passwordError ? (
              <p className="form-hint text-danger">{passwordError}</p>
            ) : null}
          </div>

          <div className="form-group">
            <label htmlFor="confirm" className="form-label">
              Confirm new password
            </label>
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
              <p className="form-hint text-danger">
                The confirmation password does not match.
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canSave}
            className="w-full h-11 mt-2 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Set new password'}
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
      <ResetPasswordFlow />
    </Suspense>
  )
}