'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Mail, RefreshCw } from 'lucide-react'
import { validatePassword } from '@/utils/password-validator'

type Role = 'tourist' | 'buddy'
type Step = 'personal' | 'verify-email' | 'role' | 'tags'

const INTERESTS = [
  { id: 'food', label: 'Food' },
  { id: 'photography', label: 'Photography' },
  { id: 'history', label: 'History' },
  { id: 'beach', label: 'Beach' },
  { id: 'nature', label: 'Nature' },
  { id: 'nightlife', label: 'Nightlife' },
  { id: 'shopping', label: 'Shopping' },
  { id: 'culture', label: 'Local Culture' },
  { id: 'adventure', label: 'Adventure' },
  { id: 'wellness', label: 'Wellness' },
]

const TRAVEL_STYLES = [
  { id: 'solo', label: 'Solo', desc: 'Exploring on your own' },
  { id: 'couple', label: 'Couple', desc: 'Traveling with a partner' },
  { id: 'friends', label: 'With Friends', desc: 'Traveling with friends' },
  { id: 'family', label: 'Family', desc: 'Traveling with family' },
]

const LANGUAGES = [
  'English',
  'Vietnamese',
  'Japanese',
  'Korean',
  'French',
  'Mandarin',
  'Russian',
  'Spanish',
]

const NATIONALITIES = [
  'United States',
  'United Kingdom',
  'Australia',
  'Canada',
  'Singapore',
  'Japan',
  'South Korea',
  'China',
  'Vietnam',
  'Thailand',
  'Malaysia',
  'Germany',
  'France',
  'Netherlands',
  'Other',
]

const BUDGETS = [
  { id: 'under-50', label: 'Under $50', desc: 'per day' },
  { id: '50-100', label: '$50–$100', desc: 'per day' },
  { id: '100-200', label: '$100–$200', desc: 'per day' },
  { id: '200+', label: '$200+', desc: 'per day' },
]

const HOURLY_RATES = [
  { id: 10, label: '$10/hr', desc: 'Newbie' },
  { id: 15, label: '$15/hr', desc: 'Standard' },
  { id: 20, label: '$20/hr', desc: 'Experienced' },
  { id: 30, label: '$30/hr', desc: 'Premium' },
  { id: 0, label: 'Free', desc: 'Just chatting' },
]

interface FormState {
  role: Role
  email: string
  password: string
  confirmPassword: string
  fullName: string
  phone: string
  /* Tourist-only */
  nationality: string
  dateOfBirth: string
  travelStyle: string
  interests: string[]
  languages: string[]
  budgetRange: string
  destination: string
  arrivalDate: string
  /* Buddy-only */
  locationCity: string
  specialties: string[]
  hourlyRate: number
  bio: string
  terms: boolean
}

const INITIAL_FORM: FormState = {
  role: 'tourist',
  email: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  phone: '',
  nationality: '',
  dateOfBirth: '',
  travelStyle: '',
  interests: [],
  languages: [],
  budgetRange: '50-100',
  destination: 'Da Nang',
  arrivalDate: '',
  locationCity: 'Da Nang',
  specialties: [],
  hourlyRate: 15,
  bio: '',
  terms: false,
}

const STEP_LABELS = ['Personal info', 'Verify email', 'Choose role', 'Tags & bio']

function Stepper({ step }: { step: Step }) {
  const idx =
    step === 'personal'
      ? 0
      : step === 'verify-email'
      ? 1
      : step === 'role'
      ? 2
      : 3
  return (
    <ol
      className="flex items-center justify-center gap-2 mb-6"
      aria-label="Sign-up progress"
    >
      {STEP_LABELS.map((label, i) => {
        const state = idx >= i ? (idx === i ? 'current' : 'done') : 'todo'
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                state === 'current'
                  ? 'bg-primary text-paper'
                  : state === 'done'
                  ? 'bg-primary text-paper'
                  : 'bg-transparent text-muted border border-border'
              }`}
            >
              {state === 'done' ? <Check size={12} aria-hidden="true" /> : i + 1}
            </span>
            <span
              className={`text-xs font-medium ${
                state === 'current' ? 'text-ink' : 'text-muted'
              }`}
            >
              {label}
            </span>
            {i < STEP_LABELS.length - 1 ? (
              <span
                className={`w-8 h-px ${state === 'done' ? 'bg-primary' : 'bg-border'}`}
                aria-hidden="true"
              />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
        active
          ? 'bg-primary text-paper border-primary'
          : 'bg-transparent text-ink border-border hover:border-border-strong'
      }`}
    >
      {children}
    </button>
  )
}

function ChoiceCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left p-4 rounded-sm border transition-colors duration-150 ${
        active
          ? 'bg-primary text-paper border-primary'
          : 'bg-transparent text-ink border-border hover:border-border-strong'
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs mt-1 opacity-80">{desc}</span>
    </button>
  )
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleParam = searchParams.get('role')
  const initialRole: Role | null =
    roleParam === 'buddy' || roleParam === 'tourist' ? roleParam : null

  const [step, setStep] = useState<Step>('personal')
  const [form, setForm] = useState<FormState>(() => ({
    ...INITIAL_FORM,
    role: initialRole ?? 'tourist',
  }))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // OTP flow state (Step 0.5 — between personal info and role)
  const [signupId, setSignupId] = useState<string | null>(null)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpSending, setOtpSending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  function pickRole(role: Role) {
    setForm((p) => ({ ...p, role }))
    setStep('tags')
  }

  function toggleInterest(id: string) {
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter((i) => i !== id)
        : [...prev.interests, id],
    }))
  }

  function toggleSpecialty(id: string) {
    setForm((prev) => ({
      ...prev,
      specialties: prev.specialties.includes(id)
        ? prev.specialties.filter((i) => i !== id)
        : [...prev.specialties, id],
    }))
  }

  function toggleLanguage(lang: string) {
    setForm((prev) => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter((l) => l !== lang)
        : [...prev.languages, lang],
    }))
  }

  const stepReady = useMemo(() => {
    if (step === 'personal') {
      const pwOk = validatePassword(form.password) === null
      return (
        form.fullName.trim().length >= 2 &&
        validateEmail(form.email) &&
        pwOk &&
        form.password === form.confirmPassword &&
        form.terms
      )
    }
    if (step === 'verify-email') {
      return otp.every((d) => d !== '') && otp.join('').length === 6
    }
    if (step === 'tags') {
      if (form.role === 'tourist') {
        return (
          form.nationality !== '' &&
          form.travelStyle !== '' &&
          form.interests.length > 0 &&
          form.languages.length > 0
        )
      }
      return (
        form.locationCity.trim().length > 0 &&
        form.languages.length > 0 &&
        form.specialties.length > 0 &&
        form.bio.trim().length >= 30
      )
    }
    return false
  }, [step, form, otp])

  async function startSignup() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          phone: form.phone,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not start signup. Please try again.')
        setLoading(false)
        return
      }
      setSignupId(body.signupId)
      setVerifiedEmail(body.email)
      setOtp(['', '', '', '', '', ''])
      setLoading(false)
      setStep('verify-email')
      // Start 60-second resend cooldown
      setResendCooldown(60)
      const interval = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            clearInterval(interval)
            return 0
          }
          return s - 1
        })
      }, 1000)
    } catch (err) {
      console.error('Start signup error:', err)
      setError('Could not reach the server. Please try again.')
      setLoading(false)
    }
  }

  async function verifyOtpCode() {
    if (!signupId) return
    setError('')
    setOtpSending(true)
    try {
      const code = otp.join('')
      const res = await fetch('/api/auth/signup/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId, code }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Verification failed.')
        setOtp(['', '', '', '', '', ''])
        setOtpSending(false)
        return
      }
      setOtpSending(false)
      // Advance to role step (or skip it if ?role= was provided)
      const initialRole = searchParams.get('role')
      if (initialRole === 'tourist' || initialRole === 'buddy') {
        setForm((p) => ({ ...p, role: initialRole }))
        setStep('tags')
      } else {
        setStep('role')
      }
    } catch (err) {
      console.error('Verify OTP error:', err)
      setError('Could not verify code. Please try again.')
      setOtpSending(false)
    }
  }

  async function resendOtp() {
    if (!signupId || resendCooldown > 0) return
    setError('')
    setOtpSending(true)
    try {
      const res = await fetch('/api/auth/signup/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Could not resend code.')
        setOtpSending(false)
        return
      }
      // New signupId was returned (the prior row was invalidated). Use it.
      if (body.signupId) setSignupId(body.signupId)
      setOtp(['', '', '', '', '', ''])
      setOtpSending(false)
      setResendCooldown(60)
      const interval = setInterval(() => {
        setResendCooldown((s) => {
          if (s <= 1) {
            clearInterval(interval)
            return 0
          }
          return s - 1
        })
      }, 1000)
    } catch (err) {
      console.error('Resend OTP error:', err)
      setError('Could not resend code. Please try again.')
      setOtpSending(false)
    }
  }

  async function finalizeSignup() {
    setError('')
    setLoading(true)

    try {
      // Build the role-specific profile payload. /api/auth/signup/complete
      // uses the pending_payload (saved at /signup/start) plus the role +
      // profilePayload here to create auth.users + profiles + tourist/buddy.
      const profilePayload =
        form.role === 'tourist'
          ? {
              nationality: form.nationality || null,
              date_of_birth: form.dateOfBirth || null,
              travel_style: form.travelStyle || null,
              interests: form.interests,
              languages: form.languages,
              budget_range: form.budgetRange,
              arrival_date: form.arrivalDate || null,
              destination: form.destination,
              is_visible: true,
            }
          : {
              location_city: form.locationCity,
              languages: form.languages,
              specialties: form.specialties,
              hourly_rate: Number(form.hourlyRate),
              bio: form.bio,
              is_available: true,
            }

      const res = await fetch('/api/auth/signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signupId,
          role: form.role,
          profilePayload,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        setError(body.error ?? `Could not create account (${res.status}).`)
        setLoading(false)
        return
      }

      // Sign the user in so they land on the dashboard with a live session.
      const { signIn } = await import('@/utils/supabase/auth')
      const { error: signInError } = await signIn(form.email, form.password)
      if (signInError) {
        router.push(`/login?registered=1&email=${encodeURIComponent(form.email)}`)
        return
      }
      router.push(form.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard')
    } catch (err) {
      console.error('Finalize sign-up error:', err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="container-page py-8 max-w-2xl">
      <header className="flex items-center justify-between mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-ink hover:text-primary"
        >
          <span
            className="w-7 h-7 rounded-sm bg-primary text-paper flex items-center justify-center font-bold"
            aria-hidden="true"
          >
            L
          </span>
          LOCALit
        </Link>
        <Link
          href="/login"
          className="text-xs text-muted hover:text-ink"
        >
          Already a member? <strong>Sign in</strong>
        </Link>
      </header>

      <Stepper step={step} />

      {step === 'personal' ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <header className="mb-5">
            <h1 className="text-section-title">Create your account</h1>
            <p className="text-sm text-muted mt-1">
              Tell us who you are. You&apos;ll pick your role and interests on the next steps.
            </p>
          </header>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!stepReady || loading) return
              // Step 0 → call /api/auth/signup/start → OTP → Step 0.5.
              // The auth.users row is NOT created here — it will be created
              // at /api/auth/signup/complete AFTER the OTP is verified.
              startSignup()
            }}
            noValidate
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label htmlFor="fullName" className="form-label">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  className="form-input"
                  placeholder="Alex Johnson"
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  required
                  minLength={2}
                  maxLength={100}
                  autoComplete="name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone" className="form-label">
                  Phone <span className="text-muted text-xs">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  placeholder="+84 123 456 789"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  maxLength={20}
                  autoComplete="tel"
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">Email</label>
              <input
                id="email"
                type="email"
                className="form-input"
                placeholder="you@example.com"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
                autoComplete="email"
              />
              {form.email && !validateEmail(form.email) ? (
                <p className="form-hint text-danger">Please enter a valid email address.</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  placeholder="At least 10 characters"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                />
                {form.password ? (
                  validatePassword(form.password) ? (
                    <p className="form-hint text-danger">{validatePassword(form.password)}</p>
                  ) : (
                    <p className="form-hint">Looks good. At least 10 chars, with a letter and a number or symbol.</p>
                  )
                ) : null}
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">Confirm password</label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="form-input"
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, confirmPassword: e.target.value }))
                  }
                  required
                  autoComplete="new-password"
                  maxLength={128}
                />
                {form.confirmPassword && form.password !== form.confirmPassword ? (
                  <p className="form-hint text-danger">Passwords do not match.</p>
                ) : null}
              </div>
            </div>

            <label className="flex items-start gap-2 mt-4 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.terms}
                onChange={(e) => setForm((p) => ({ ...p, terms: e.target.checked }))}
              />
              <span>
                I agree to LOCALit&apos;s{' '}
                <a href="#" onClick={(e) => e.preventDefault()} className="text-primary hover:underline">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" onClick={(e) => e.preventDefault()} className="text-primary hover:underline">
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!stepReady || loading}
              className="w-full h-11 mt-5 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
            >
              {loading ? 'Sending code…' : null}
              {!loading ? (
                <>
                  Send verification code
                  <ArrowRight size={14} aria-hidden="true" />
                </>
              ) : null}
            </button>
          </form>
        </section>
      ) : null}

      {step === 'verify-email' ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <header className="mb-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Mail size={18} aria-hidden="true" />
              <span className="text-eyebrow">Step 2 of 4</span>
            </div>
            <h1 className="text-section-title">Check your inbox</h1>
            <p className="text-sm text-muted mt-1">
              We sent a 6-digit code to{' '}
              <strong className="text-ink">{verifiedEmail ?? form.email}</strong>. Enter it below to
              verify your email and continue.
            </p>
          </header>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!stepReady || otpSending) return
              verifyOtpCode()
            }}
            noValidate
          >
            <div className="form-group">
              <label className="form-label">Verification code</label>
              <div className="flex gap-2 justify-between" role="group" aria-label="6-digit code">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      if (el) (el as unknown as { _idx?: number })._idx = i
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    autoComplete="one-time-code"
                    className="w-12 h-14 text-center text-2xl font-semibold tabular-nums border border-border rounded-sm bg-paper focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                    value={digit}
                    aria-label={`Digit ${i + 1} of 6`}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 1)
                      setOtp((prev) => {
                        const next = [...prev]
                        next[i] = v
                        return next
                      })
                      // Auto-advance focus to next input
                      if (v && i < 5) {
                        const inputs = document.querySelectorAll<HTMLInputElement>(
                          'input[autocomplete="one-time-code"]',
                        )
                        const next = inputs[i + 1]
                        if (next) next.focus()
                      }
                    }}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                      if (pasted.length === 6) {
                        e.preventDefault()
                        setOtp(pasted.split(''))
                        // Focus the last input
                        const inputs = document.querySelectorAll<HTMLInputElement>(
                          'input[autocomplete="one-time-code"]',
                        )
                        const last = inputs[5]
                        if (last) last.focus()
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !digit && i > 0) {
                        const inputs = document.querySelectorAll<HTMLInputElement>(
                          'input[autocomplete="one-time-code"]',
                        )
                        const prev = inputs[i - 1]
                        if (prev) {
                          prev.focus()
                          setOtp((p) => {
                            const next = [...p]
                            next[i - 1] = ''
                            return next
                          })
                        }
                      }
                    }}
                  />
                ))}
              </div>
              <p className="form-hint mt-2">
                Code expires in 15 minutes. Paste from your email or type each digit.
              </p>
            </div>

            {error ? (
              <div className="alert alert-error mb-4" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setStep('personal')
                  setError('')
                  setOtp(['', '', '', '', '', ''])
                }}
                disabled={otpSending}
                className="inline-flex items-center gap-1 h-11 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back
              </button>
              <button
                type="submit"
                disabled={!stepReady || otpSending}
                className="inline-flex items-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {otpSending ? 'Verifying…' : 'Verify and continue'}
                {!otpSending ? <ArrowRight size={14} aria-hidden="true" /> : null}
              </button>
              <button
                type="button"
                onClick={resendOtp}
                disabled={resendCooldown > 0 || otpSending}
                className="inline-flex items-center gap-2 h-11 px-4 text-sm font-medium rounded-sm bg-transparent text-muted border border-border hover:border-border-strong hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw size={14} aria-hidden="true" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step === 'role' ? (
        <section>
          <header className="text-center mb-6">
            <p className="text-eyebrow text-primary mb-2">Almost there</p>
            <h1 className="text-page-title">How will you use LOCALit?</h1>
            <p className="text-sm text-muted mt-2 max-w-md mx-auto">
              Pick the experience that fits you. You can switch later from your profile settings.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => pickRole('tourist')}
              className="text-left p-6 rounded-sm border border-border bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-paper text-primary mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h18M5 12V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M9 22v-4h6v4" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-ink mb-1">I&apos;m a tourist</h2>
              <p className="text-sm text-muted mb-3">
                Discover Da Nang alongside trusted local buddies who share your interests and language.
              </p>
              <ul className="space-y-1 text-xs text-ink">
                <li className="flex gap-2"><Check size={12} className="text-success mt-0.5" aria-hidden="true" /> Browse verified local buddies</li>
                <li className="flex gap-2"><Check size={12} className="text-success mt-0.5" aria-hidden="true" /> Plan trips together in chat</li>
                <li className="flex gap-2"><Check size={12} className="text-success mt-0.5" aria-hidden="true" /> Get hand-picked recommendations</li>
              </ul>
              <p className="mt-4 text-sm font-medium text-primary inline-flex items-center gap-1">
                Continue as tourist <ArrowRight size={12} aria-hidden="true" />
              </p>
            </button>

            <button
              type="button"
              onClick={() => pickRole('buddy')}
              className="text-left p-6 rounded-sm border border-border bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-paper text-primary mb-3">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </span>
              <h2 className="text-lg font-semibold text-ink mb-1">I&apos;m a local buddy</h2>
              <p className="text-sm text-muted mb-3">
                Share the best of your city, meet travelers from around the world, and earn on your schedule.
              </p>
              <ul className="space-y-1 text-xs text-ink">
                <li className="flex gap-2"><Check size={12} className="text-success mt-0.5" aria-hidden="true" /> Receive trip requests from travelers</li>
                <li className="flex gap-2"><Check size={12} className="text-success mt-0.5" aria-hidden="true" /> Set your own hourly rate</li>
                <li className="flex gap-2"><Check size={12} className="text-success mt-0.5" aria-hidden="true" /> Build reviews and a trusted profile</li>
              </ul>
              <p className="mt-4 text-sm font-medium text-primary inline-flex items-center gap-1">
                Continue as buddy <ArrowRight size={12} aria-hidden="true" />
              </p>
            </button>
          </div>

          <p className="text-xs text-muted text-center mt-6">
            We never share your contact details without your permission.
          </p>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setStep('verify-email')}
              className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft size={12} aria-hidden="true" />
              Back to email verification
            </button>
          </div>
        </section>
      ) : null}

      {step === 'tags' ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <header className="mb-5 pb-4 border-b border-border flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="text-section-title">
                {form.role === 'buddy' ? 'Tell travelers about you' : 'Tell us about your trip'}
              </h1>
              <p className="text-sm text-muted mt-1">
                Signing up as{' '}
                <strong>{form.role === 'buddy' ? 'a local buddy' : 'a tourist'}</strong>.{' '}
                <button
                  type="button"
                  onClick={() => {
                    // If a role was provided via ?role=, we skipped the role
                    // step, so going back means going back to OTP. Otherwise
                    // the role picker was shown.
                    const hadRoleParam = searchParams.get('role') === 'tourist' || searchParams.get('role') === 'buddy'
                    setStep(hadRoleParam ? 'verify-email' : 'role')
                  }}
                  className="text-primary hover:underline"
                >
                  Change
                </button>
              </p>
            </div>
          </header>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!stepReady || loading) return
              finalizeSignup()
            }}
            noValidate
          >
            {form.role === 'tourist' ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label htmlFor="nationality" className="form-label">Nationality</label>
                    <select
                      id="nationality"
                      className="form-input form-select"
                      value={form.nationality}
                      onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
                      required
                    >
                      <option value="">Select your country</option>
                      {NATIONALITIES.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="dateOfBirth" className="form-label">
                      Date of birth <span className="text-muted text-xs">(optional)</span>
                    </label>
                    <input
                      id="dateOfBirth"
                      type="date"
                      className="form-input"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>

                <fieldset className="form-group">
                  <legend className="form-label">Travel style</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {TRAVEL_STYLES.map((style) => (
                      <ChoiceCard
                        key={style.id}
                        active={form.travelStyle === style.id}
                        onClick={() => setForm((p) => ({ ...p, travelStyle: style.id }))}
                        title={style.label}
                        desc={style.desc}
                      />
                    ))}
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend className="form-label">
                    Interests <span className="text-muted text-xs">(pick at least one)</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((i) => (
                      <Chip
                        key={i.id}
                        active={form.interests.includes(i.id)}
                        onClick={() => toggleInterest(i.id)}
                      >
                        {i.label}
                      </Chip>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend className="form-label">Languages you speak</legend>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => (
                      <Chip
                        key={lang}
                        active={form.languages.includes(lang)}
                        onClick={() => toggleLanguage(lang)}
                      >
                        {lang}
                      </Chip>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend className="form-label">Daily budget</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {BUDGETS.map((b) => (
                      <ChoiceCard
                        key={b.id}
                        active={form.budgetRange === b.id}
                        onClick={() => setForm((p) => ({ ...p, budgetRange: b.id }))}
                        title={b.label}
                        desc={b.desc}
                      />
                    ))}
                  </div>
                </fieldset>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label htmlFor="destination" className="form-label">Destination</label>
                    <input
                      id="destination"
                      type="text"
                      className="form-input"
                      value={form.destination}
                      onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
                      maxLength={100}
                    />
                    <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="arrivalDate" className="form-label">
                      Arrival date <span className="text-muted text-xs">(optional)</span>
                    </label>
                    <input
                      id="arrivalDate"
                      type="date"
                      className="form-input"
                      value={form.arrivalDate}
                      onChange={(e) => setForm((p) => ({ ...p, arrivalDate: e.target.value }))}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="form-group">
                    <label htmlFor="locationCity" className="form-label">Your city</label>
                    <input
                      id="locationCity"
                      type="text"
                      className="form-input"
                      value={form.locationCity}
                      onChange={(e) => setForm((p) => ({ ...p, locationCity: e.target.value }))}
                      maxLength={100}
                      required
                    />
                    <p className="form-hint">
                      LOCALit currently only features Da Nang-based buddies.
                    </p>
                  </div>
                  <fieldset className="form-group">
                    <legend className="form-label">Hourly rate</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {HOURLY_RATES.map((r) => (
                        <ChoiceCard
                          key={r.id}
                          active={form.hourlyRate === r.id}
                          onClick={() => setForm((p) => ({ ...p, hourlyRate: r.id }))}
                          title={r.label}
                          desc={r.desc}
                        />
                      ))}
                    </div>
                  </fieldset>
                </div>

                <fieldset className="form-group">
                  <legend className="form-label">
                    Specialties <span className="text-muted text-xs">(pick at least one)</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((i) => (
                      <Chip
                        key={i.id}
                        active={form.specialties.includes(i.id)}
                        onClick={() => toggleSpecialty(i.id)}
                      >
                        {i.label}
                      </Chip>
                    ))}
                  </div>
                </fieldset>

                <fieldset className="form-group">
                  <legend className="form-label">Languages you speak</legend>
                  <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((lang) => (
                      <Chip
                        key={lang}
                        active={form.languages.includes(lang)}
                        onClick={() => toggleLanguage(lang)}
                      >
                        {lang}
                      </Chip>
                    ))}
                  </div>
                </fieldset>

                <div className="form-group">
                  <label htmlFor="bio" className="form-label">
                    About you <span className="text-muted text-xs">(at least 30 characters)</span>
                  </label>
                  <textarea
                    id="bio"
                    className="form-input form-textarea"
                    value={form.bio}
                    onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
                    maxLength={500}
                    rows={5}
                    placeholder="Tell travelers about yourself and what you can show them in Da Nang..."
                  />
                  <p className="form-hint">{form.bio.trim().length}/500 characters</p>
                </div>
              </>
            )}

            {error ? (
              <div className="alert alert-error mb-4" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const hadRoleParam = searchParams.get('role') === 'tourist' || searchParams.get('role') === 'buddy'
                  setStep(hadRoleParam ? 'verify-email' : 'role')
                }}
                disabled={loading}
                className="inline-flex items-center gap-1 h-11 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Back
              </button>
              <button
                type="submit"
                disabled={!stepReady || loading}
                className="inline-flex items-center gap-2 h-11 px-5 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Creating account…'
                  : `Create ${form.role === 'buddy' ? 'Buddy' : 'Tourist'} account`}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {step !== 'personal' ? (
        <p className="text-sm text-muted text-center mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      ) : null}
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  )
}
