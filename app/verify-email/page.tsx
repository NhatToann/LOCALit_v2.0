'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, MailWarning, AlertTriangle, ArrowLeft } from 'lucide-react'
import { signIn } from '@/utils/supabase/auth'

function VerifyEmailForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const role = (searchParams.get('role') === 'buddy' ? 'buddy' : 'tourist') as
    | 'tourist'
    | 'buddy'

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [devCode, setDevCode] = useState('')
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  const [userId, setUserId] = useState<string>('')
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem('localit.pendingPayload')
      if (raw) {
        const parsed = JSON.parse(raw) as { userId?: string }
        if (parsed.userId) setUserId(parsed.userId)
      }
      const rawCode = sessionStorage.getItem('localit.devCode')
      if (rawCode) setDevCode(rawCode)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  function setDigitAt(idx: number, value: string) {
    setDigits((prev) => {
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
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        reason?: string
        userId?: string
      }
      if (!res.ok) {
        setError(body.error ?? `Verification failed (${res.status}).`)
        setDigits(['', '', '', '', '', ''])
        inputsRef.current[0]?.focus()
        setLoading(false)
        return
      }

      let pendingPayload:
        | { role: 'tourist' | 'buddy'; payload: Record<string, unknown>; userId: string }
        | null = null
      if (typeof window !== 'undefined') {
        try {
          const raw = sessionStorage.getItem('localit.pendingPayload')
          if (raw) pendingPayload = JSON.parse(raw)
        } catch {
          /* ignore */
        }
      }

      if (pendingPayload && body.userId === pendingPayload.userId) {
        const profileRes = await fetch('/api/auth/create-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            userId: pendingPayload.userId,
            role: pendingPayload.role,
            payload: pendingPayload.payload,
            autoConfirm: true,
          }),
        })
        if (!profileRes.ok) {
          const errBody = (await profileRes.json().catch(() => ({}))) as { error?: string }
          console.warn('[verify-email] create-profile failed:', errBody.error)
        }
      }

      const password =
        typeof window !== 'undefined' ? sessionStorage.getItem('localit.pendingPw') : null
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
        sessionStorage.removeItem('localit.devCode')
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
      <main className="container-page py-16 max-w-md text-center">
        <MailWarning size={32} className="text-warning mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-page-title">Missing email</h1>
        <p className="text-sm text-muted mt-2">
          We couldn&apos;t find the email you signed up with.
        </p>
        <Link
          href="/register"
          className="inline-flex items-center gap-1 h-10 px-4 mt-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
        >
          Start over
        </Link>
      </main>
    )
  }

  return (
    <main className="container-page py-8 max-w-md">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm font-semibold text-ink mb-4 hover:text-primary"
      >
        <span
          className="w-7 h-7 rounded-sm bg-primary text-paper flex items-center justify-center font-bold"
          aria-hidden="true"
        >
          L
        </span>
        LOCALit
      </Link>

      <header className="mb-6 text-center">
        <CheckCircle2 size={32} className="text-success mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-page-title">Verify your email</h1>
        <p className="text-sm text-muted mt-2">
          We sent a 6-digit code to <strong>{email}</strong>. Enter it below to finish signing up.
        </p>
      </header>

      {devCode ? (
        <div className="alert alert-info mb-4" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <span>
              Dev mode (no <code>RESEND_API_KEY</code>): your code is{' '}
              <strong className="font-mono text-base tracking-widest">{devCode}</strong>.
            </span>
            <span className="text-xs">
              Copy it into the inputs below. In production this banner is hidden.
            </span>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="border border-border rounded-sm bg-surface p-6"
        noValidate
      >
        <fieldset>
          <legend className="form-label">Verification code</legend>
          <div className="flex justify-center gap-2 my-3" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <input
                key={i}
                id={`otp-${i}`}
                ref={(el) => {
                  inputsRef.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={1}
                value={d}
                onChange={(e) => setDigitAt(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                autoComplete="one-time-code"
                disabled={loading}
                aria-label={`Digit ${i + 1}`}
                className="w-11 h-12 text-center text-lg font-semibold rounded-sm border border-border-strong bg-surface text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            ))}
          </div>
          <p className="form-hint text-center">
            Didn&apos;t get the code? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-primary hover:underline disabled:opacity-50 disabled:cursor-default"
            >
              {resendCooldown > 0 ? `resend in ${resendCooldown}s` : 'resend now'}
            </button>
            .
          </p>
        </fieldset>

        {info ? (
          <div className="alert alert-info mt-3" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <span>{info}</span>
          </div>
        ) : null}

        {error ? (
          <div className="alert alert-error mt-3" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!codeReady || loading}
          className="w-full h-11 mt-4 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Verifying…' : 'Verify & continue'}
        </button>
      </form>

      <p className="text-sm text-muted text-center mt-6">
        Wrong email?{' '}
        <Link href="/register" className="text-primary hover:underline font-medium">
          Sign up again
        </Link>
      </p>
    </main>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <VerifyEmailForm />
    </Suspense>
  )
}
