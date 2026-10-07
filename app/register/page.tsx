'use client'

/**
 * /register — Sign-up flow (2026-10-07 — simplified to 2 steps).
 *
 * History:
 *   - Original: single form, /api/auth/signup, no OTP
 *   - 2026-09-26: 4-step flow (personal → verify-otp → role → tags) introduced
 *     to add email verification via the Resend OTP API
 *   - 2026-10-07: refactored back to 2 steps (account + verify+profile) because
 *     the 4-step flow had high drop-off with real users.
 *
 * Steps:
 *   1. Account + role — name, email, phone, password, role radio, terms.
 *      (Tags/bio are collected on Step 2 alongside OTP verification.)
 *   2. Verify + profile — OTP code entry, plus the role-specific tag picker
 *      (interests/languages/nationality for tourists; specialties/languages/
 *      bio for buddies). The "Create account" button is only enabled when
 *      BOTH the OTP is valid AND the required tags are picked.
 *
 * Defenses (UI-only, the API is unchanged):
 *   - `onInput` alongside `onChange` so paste / 1Password autofill / programmatic
 *     `value=` sets still update React state (see utils/paste-safe-input.ts).
 *   - Clear error messages: "Email not received?" hint points to the Resend
 *     domain-verification caveat (see EmailNotice).
 *   - Generic 400 from the API is mapped to a friendly message; specific
 *     errors (rate limit, expired code) are surfaced.
 */

import { useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Mail, RefreshCw, Info } from 'lucide-react'
import { validatePassword } from '@/utils/password-validator'
import { syncValue } from '@/utils/paste-safe-input'

type Role = 'tourist' | 'buddy'
type Step = 'account' | 'verify-profile'

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

const STEP_LABELS = ['Account & role', 'Verify email & profile']

function Stepper({ step }: { step: Step }) {
  const activeIdx = step === 'account' ? 0 : 1
  return (
    <ol className="flex items-center gap-2 mb-6 text-xs" aria-label="Sign-up progress">
      {STEP_LABELS.map((label, i) => {
        const isActive = i === activeIdx
        const isDone = i < activeIdx
        return (
          <li key={label} className="flex items-center gap-2" aria-current={isActive ? 'step' : undefined}>
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-pill text-[11px] font-semibold border ${
                isDone
                  ? 'bg-primary text-paper border-primary'
                  : isActive
                    ? 'bg-paper text-primary border-primary'
                    : 'bg-paper text-muted border-border'
              }`}
              aria-hidden="true"
            >
              {isDone ? <Check size={12} /> : i + 1}
            </span>
            <span className={isActive ? 'text-ink font-medium' : 'text-muted'}>{label}</span>
            {i < STEP_LABELS.length - 1 ? (
              <span className="w-6 h-px bg-border mx-1" aria-hidden="true" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function EmailNotice() {
  return (
    <div className="alert mb-4" role="status" style={{ borderColor: 'var(--info)', background: 'var(--info-bg)' }}>
      <Info size={16} aria-hidden="true" style={{ color: 'var(--info)' }} />
      <div>
        <p className="text-sm font-semibold text-ink">Code can take 30 seconds.</p>
        <p className="text-xs text-muted mt-0.5">
          If it doesn&apos;t arrive, check your spam folder, then tap Resend. Code expires after 15 minutes.
        </p>
      </div>
    </div>
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

  const [step, setStep] = useState<Step>('account')
  const [form, setForm] = useState<FormState>(() => ({
    ...INITIAL_FORM,
    role: initialRole ?? 'tourist',
  }))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // OTP flow state (Step 2 — between account and profile)
  const [signupId, setSignupId] = useState<string | null>(null)
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [otpSending, setOtpSending] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null)

  const validateEmail = (email: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  function pickRole(role: Role) {
    setForm((p) => ({ ...p, role }))
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
    if (step === 'account') {
      const pwOk = validatePassword(form.password) === null
      return (
        form.fullName.trim().length >= 2 &&
        validateEmail(form.email) &&
        pwOk &&
        form.password === form.confirmPassword &&
        form.terms
      )
    }
    if (step === 'verify-profile') {
      const otpReady = otp.every((d) => d !== '') && otp.join('').length === 6
      if (form.role === 'tourist') {
        return (
          otpReady &&
          form.nationality !== '' &&
          form.travelStyle !== '' &&
          form.interests.length > 0 &&
          form.languages.length > 0
        )
      }
      return (
        otpReady &&
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
        // 429 = rate limit, 400 = generic signup failure
        if (res.status === 429) {
          setError('Too many attempts. Please wait a minute and try again.')
        } else {
          setError(
            body.error ??
              'Could not start signup. Check your email or try again in a moment.',
          )
        }
        setLoading(false)
        return
      }
      setSignupId(body.signupId)
      setVerifiedEmail(body.email)
      setOtp(['', '', '', '', '', ''])
      setLoading(false)
      setStep('verify-profile')
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
        if (res.status === 410) {
          setError('Code expired or too many attempts. Please tap Resend.')
        } else {
          setError(body.error ?? 'Incorrect code.')
        }
        setOtp(['', '', '', '', '', ''])
        setOtpSending(false)
        return
      }
      setOtpSending(false)
      // OTP verified — stay on the same step so the user can fill in their
      // tags and then click "Create account" to call /complete.
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
        if (res.status === 410) {
          setError('Verification expired. Please tap Back to start over.')
        } else {
          setError(body.error ?? `Could not create account (${res.status}).`)
        }
        setLoading(false)
        return
      }

      // Sign the user in so they land on the dashboard with a live session.
      const { signIn } = await import('@/utils/supabase/auth')
      const { error: signInError } = await signIn(form.email, form.password)
      if (signInError) {
        // Account was created but sign-in failed (rare: cookie race, network).
        // Send the user to /login with a hint that their account is ready.
        router.push(`/login?registered=1&email=${encodeURIComponent(form.email)}`)
        return
      }
      router.push('/dashboard')
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

      {step === 'account' ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <header className="mb-5">
            <h1 className="text-section-title">Create your account</h1>
            <p className="text-sm text-muted mt-1">
              Start with your details and role. You&apos;ll pick interests on the next step.
            </p>
          </header>

          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!stepReady || loading) return
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
                  onInput={syncValue((v: string) => setForm((p) => ({ ...p, fullName: v })))}
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
                  onInput={syncValue((v: string) => setForm((p) => ({ ...p, phone: v })))}
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
                onInput={syncValue((v: string) => setForm((p) => ({ ...p, email: v })))}
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
                  onInput={syncValue((v: string) => setForm((p) => ({ ...p, password: v })))}
                  required
                  autoComplete="new-password"
                  minLength={10}
                  maxLength={128}
                />
                {form.password ? (
                  validatePassword(form.password) ? (
                    <p className="form-hint text-danger">{validatePassword(form.password)}</p>
                  ) : (
                    <p className="form-hint">At least 10 chars, with a letter and a number or symbol.</p>
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
                  onInput={syncValue((v: string) =>
                    setForm((p) => ({ ...p, confirmPassword: v })),
                  )}
                  required
                  autoComplete="new-password"
                  maxLength={128}
                />
                {form.confirmPassword && form.password !== form.confirmPassword ? (
                  <p className="form-hint text-danger">Passwords do not match.</p>
                ) : null}
              </div>
            </div>

            <fieldset className="mt-4">
              <legend className="form-label mb-2">I am a</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <ChoiceCard
                  active={form.role === 'tourist'}
                  onClick={() => pickRole('tourist')}
                  title="Tourist"
                  desc="Find a local buddy to show you around Da Nang."
                />
                <ChoiceCard
                  active={form.role === 'buddy'}
                  onClick={() => pickRole('buddy')}
                  title="Local buddy"
                  desc="Show travelers around your city. Set your own hourly rate."
                />
              </div>
            </fieldset>

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

      {step === 'verify-profile' ? (
        <section className="border border-border rounded-sm bg-surface p-6">
          <header className="mb-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2 text-primary mb-2">
              <Mail size={18} aria-hidden="true" />
              <span className="text-eyebrow">Step 2 of 2</span>
            </div>
            <h1 className="text-section-title">Verify and finish your profile</h1>
            <p className="text-sm text-muted mt-1">
              We sent a 6-digit code to{' '}
              <strong className="text-ink">{verifiedEmail ?? form.email}</strong>. Enter it
              below — and pick a few interests so the right buddies can find you.
            </p>
          </header>

          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <EmailNotice />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* LEFT: OTP + finish button */}
            <div>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  // OTP submit: just verify, don't finalize
                  if (otpSending || otp.some((d) => d === '')) return
                  verifyOtpCode()
                }}
                noValidate
              >
                <div className="form-group">
                  <label className="form-label">Verification code</label>
                  <div className="flex gap-2" role="group" aria-label="6-digit code">
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
                        className="form-input text-center text-lg"
                        style={{ width: 44, height: 48, padding: 0 }}
                        value={digit}
                        aria-label={`Digit ${i + 1}`}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 1)
                          const next = [...otp]
                          next[i] = v
                          setOtp(next)
                          if (v && i < 5) {
                            const inputs = document.querySelectorAll<HTMLInputElement>(
                              'input[aria-label^="Digit"]',
                            )
                            inputs[i + 1]?.focus()
                          }
                        }}
                        onInput={syncValue((v: string) => {
                          const clean = v.replace(/\D/g, '').slice(0, 1)
                          const next = [...otp]
                          next[i] = clean
                          setOtp(next)
                        })}
                        onPaste={(e) => {
                          const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
                          if (pasted.length === 0) return
                          e.preventDefault()
                          const next = ['', '', '', '', '', '']
                          for (let k = 0; k < 6 && k < pasted.length; k++) {
                            next[k] = pasted[k]
                          }
                          setOtp(next)
                          const inputs = document.querySelectorAll<HTMLInputElement>(
                            'input[aria-label^="Digit"]',
                          )
                          inputs[Math.min(pasted.length, 5)]?.focus()
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !otp[i] && i > 0) {
                            const inputs = document.querySelectorAll<HTMLInputElement>(
                              'input[aria-label^="Digit"]',
                            )
                            inputs[i - 1]?.focus()
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <button
                    type="submit"
                    disabled={otpSending || otp.some((d) => d === '')}
                    className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-50"
                  >
                    {otpSending ? 'Verifying…' : 'Verify code'}
                  </button>
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={otpSending || resendCooldown > 0}
                    className="inline-flex items-center gap-1 h-9 px-3 text-sm text-muted hover:text-ink disabled:opacity-50"
                  >
                    <RefreshCw size={12} aria-hidden="true" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                  </button>
                </div>
              </form>

              <button
                type="button"
                onClick={finalizeSignup}
                disabled={!stepReady || loading}
                className="w-full h-11 mt-6 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1"
              >
                {loading ? 'Creating account…' : null}
                {!loading ? (
                  <>
                    Create account
                    <ArrowRight size={14} aria-hidden="true" />
                  </>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('account')
                  setOtp(['', '', '', '', '', ''])
                }}
                className="w-full h-9 mt-2 text-xs text-muted hover:text-ink inline-flex items-center justify-center gap-1"
              >
                <ArrowLeft size={12} aria-hidden="true" />
                Back to account details
              </button>
            </div>

            {/* RIGHT: role-specific tags */}
            <div>
              {form.role === 'tourist' ? (
                <TouristTags form={form} setForm={setForm} toggleInterest={toggleInterest} toggleLanguage={toggleLanguage} />
              ) : (
                <BuddyTags form={form} setForm={setForm} toggleSpecialty={toggleSpecialty} toggleLanguage={toggleLanguage} />
              )}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  )
}

function TouristTags({
  form,
  setForm,
  toggleInterest,
  toggleLanguage,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  toggleInterest: (id: string) => void
  toggleLanguage: (lang: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-section-title mb-1">Tell us about your trip</h2>
        <p className="text-xs text-muted">So we can match you with the right buddies.</p>
      </div>

      <div>
        <label className="form-label" htmlFor="nationality">Where are you from?</label>
        <select
          id="nationality"
          className="form-input"
          value={form.nationality}
          onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value }))}
        >
          <option value="">Select your country</option>
          {NATIONALITIES.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label" htmlFor="travelStyle">Travel style</label>
        <select
          id="travelStyle"
          className="form-input"
          value={form.travelStyle}
          onChange={(e) => setForm((p) => ({ ...p, travelStyle: e.target.value }))}
        >
          <option value="">Select your style</option>
          {TRAVEL_STYLES.map((s) => (
            <option key={s.id} value={s.id}>{s.label} — {s.desc}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label">Interests (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
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
      </div>

      <div>
        <label className="form-label">Languages (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              active={form.languages.includes(l)}
              onClick={() => toggleLanguage(l)}
            >
              {l}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <label className="form-label" htmlFor="arrivalDate">Arrival date (optional)</label>
        <input
          id="arrivalDate"
          type="date"
          className="form-input"
          value={form.arrivalDate}
          onChange={(e) => setForm((p) => ({ ...p, arrivalDate: e.target.value }))}
        />
      </div>
    </div>
  )
}

function BuddyTags({
  form,
  setForm,
  toggleSpecialty,
  toggleLanguage,
}: {
  form: FormState
  setForm: React.Dispatch<React.SetStateAction<FormState>>
  toggleSpecialty: (id: string) => void
  toggleLanguage: (lang: string) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-section-title mb-1">Set up your buddy profile</h2>
        <p className="text-xs text-muted">Travelers see this on the buddy browse page.</p>
      </div>

      <div>
        <label className="form-label" htmlFor="locationCity">City you cover</label>
        <input
          id="locationCity"
          type="text"
          className="form-input"
          placeholder="Da Nang"
          value={form.locationCity}
          onChange={(e) => setForm((p) => ({ ...p, locationCity: e.target.value }))}
        />
      </div>

      <div>
        <label className="form-label">Languages (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {LANGUAGES.map((l) => (
            <Chip
              key={l}
              active={form.languages.includes(l)}
              onClick={() => toggleLanguage(l)}
            >
              {l}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <label className="form-label">Specialties (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
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
      </div>

      <div>
        <label className="form-label" htmlFor="hourlyRate">Hourly rate (USD)</label>
        <select
          id="hourlyRate"
          className="form-input"
          value={String(form.hourlyRate)}
          onChange={(e) => setForm((p) => ({ ...p, hourlyRate: Number(e.target.value) }))}
        >
          {HOURLY_RATES.map((r) => (
            <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label" htmlFor="bio">Short bio (≥ 30 characters)</label>
        <textarea
          id="bio"
          className="form-input"
          rows={4}
          placeholder="Tell travelers about you, your city, and what makes a great day with you."
          value={form.bio}
          onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
        />
        <p className="form-hint text-muted">
          {form.bio.trim().length} / 30
        </p>
      </div>
    </div>
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
