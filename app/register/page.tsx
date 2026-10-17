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

import { useState, useMemo, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Link } from '@/components/ui/Link'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Mail, RefreshCw, Info } from 'lucide-react'
import { validatePassword } from '@/utils/password-validator'
import { syncValue } from '@/utils/paste-safe-input'
import { navigate } from '@/lib/navigation'

type Role = 'tourist' | 'buddy'
// 3 steps now (was 2): each step is one decision the user has to make.
//   account     — name + email + password + role + terms → POST /start
//   verify-otp  — 6-digit code from email → POST /verify-otp
//   profile     — role-specific tags/bio → POST /complete
// Previously Step 2 mixed OTP + profile, which made the form feel cramped
// and confused the user about whether they were done. Each step now has
// one job.
type Step = 'account' | 'verify-otp' | 'profile'

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

const STEP_LABELS = ['Account & role', 'Verify email', 'Your profile']

function Stepper({ step }: { step: Step }) {
  const activeIdx = step === 'account' ? 0 : step === 'verify-otp' ? 1 : 2
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
  tone = 'primary',
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'tourist' | 'buddy' | 'primary'
}) {
  // 2-role active states — chips carry the brand palette (jade teal
  // for tourist, amber for buddy, neutral for primary). No blue, no
  // coral — those colors were retired on 2026-10-10.
  const palette: Record<string, { activeBg: string; activeBorder: string; activeText: string; idleBorder: string; idleHoverBorder: string }> = {
    tourist: {
      activeBg: 'bg-tourist',
      activeBorder: 'border-tourist',
      activeText: 'text-white',
      idleBorder: 'border-tourist-border',
      idleHoverBorder: 'hover:border-tourist',
    },
    buddy: {
      activeBg: 'bg-buddy',
      activeBorder: 'border-buddy',
      activeText: 'text-white',
      idleBorder: 'border-buddy-border',
      idleHoverBorder: 'hover:border-buddy',
    },
    primary: {
      activeBg: 'bg-primary',
      activeBorder: 'border-primary',
      activeText: 'text-paper',
      idleBorder: 'border-border',
      idleHoverBorder: 'hover:border-border-strong',
    },
  }
  const t = palette[tone] ?? palette.primary
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
        active
          ? `${t.activeBg} ${t.activeBorder} ${t.activeText}`
          : `bg-transparent text-ink ${t.idleBorder} ${t.idleHoverBorder}`
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
  tone = 'primary',
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
  tone?: 'tourist' | 'buddy' | 'primary'
}) {
  // Each tone maps to its own active+hover colors so the role pickers
  // visibly carry the 4-role palette.
  const palette: Record<string, { activeBg: string; activeBorder: string; activeText: string; idleBorder: string; idleHoverBorder: string; idleHoverBg: string }> = {
    tourist: {
      activeBg: 'bg-tourist',
      activeBorder: 'border-tourist',
      activeText: 'text-white',
      idleBorder: 'border-tourist-border',
      idleHoverBorder: 'hover:border-tourist',
      idleHoverBg: 'hover:bg-tourist-50/40',
    },
    buddy: {
      activeBg: 'bg-buddy',
      activeBorder: 'border-buddy',
      activeText: 'text-buddy-ink',
      idleBorder: 'border-buddy-border',
      idleHoverBorder: 'hover:border-buddy',
      idleHoverBg: 'hover:bg-buddy-50/40',
    },
    primary: {
      activeBg: 'bg-primary',
      activeBorder: 'border-primary',
      activeText: 'text-paper',
      idleBorder: 'border-border',
      idleHoverBorder: 'hover:border-border-strong',
      idleHoverBg: '',
    },
  }
  const t = palette[tone] ?? palette.primary
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left p-4 rounded-sm border transition-colors duration-150 ${
        active
          ? `${t.activeBg} ${t.activeBorder} ${t.activeText}`
          : `bg-transparent text-ink ${t.idleBorder} ${t.idleHoverBorder} ${t.idleHoverBg}`
      }`}
    >
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs mt-1 opacity-80">{desc}</span>
    </button>
  )
}

function RegisterForm() {
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

  // Step 3 (profile) has its own TTL — once verified, the user gets a fresh
  // 15-min window to fill the profile form. We auto-extend (silently) at
  // 60s before expiry so a slow typist never gets bounced. expiresAtMs is
  // captured from /verify-otp + /extend-session responses.
  const [sessionExpiresAtMs, setSessionExpiresAtMs] = useState<number | null>(null)
  const [sessionWarning, setSessionWarning] = useState(false) // <60s left
  const [extending, setExtending] = useState(false)

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

  // 2026-10-17: when on Step 3, compute the first missing requirement so
  // we can show a specific hint above the Create account button instead of
  // leaving the user guessing why the button is greyed out. The previous
  // version just disabled the button — which is exactly the "Create account
  // doesn't work" complaint that came in today.
  const step3Missing = useMemo(() => {
    if (step !== 'profile') return null
    if (form.role === 'tourist') {
      if (!form.nationality) return 'Pick your country.'
      if (!form.travelStyle) return 'Pick a travel style.'
      if (form.interests.length === 0) return 'Pick at least one interest.'
      if (form.languages.length === 0) return 'Pick at least one language.'
      return null
    }
    if (!form.locationCity.trim()) return 'Tell us which city you cover.'
    if (form.languages.length === 0) return 'Pick at least one language.'
    if (form.specialties.length === 0) return 'Pick at least one specialty.'
    if (form.bio.trim().length < 10) {
      return `Add a short bio — at least 10 characters (you have ${form.bio.trim().length}).`
    }
    return null
  }, [step, form])

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
    if (step === 'verify-otp') {
      // Step 2 only requires the OTP to be entered; we don't require it to
      // already be verified (the user clicks "Verify code" explicitly). The
      // "Next" button is enabled once all 6 digits are typed.
      return otp.every((d) => d !== '') && otp.join('').length === 6
    }
    if (step === 'profile') {
      return step3Missing === null
    }
    return false
  }, [step, form, otp, step3Missing])

  // 2026-10-17: Step 3 session countdown + auto-extend.
  //   - Ticks every second while on Step 3 with an active session.
  //   - When <60s remain, fires POST /extend-session once (idempotent — the
  //     endpoint is rate-limited at 5/min so a malicious poll can't keep
  //     the row alive forever).
  //   - When 0s remain, sets sessionWarning=true and stops ticking; the
  //     user must tap the "Refresh session" button.
  const lastExtendRef = useRef<number>(0)
  useEffect(() => {
    if (step !== 'profile' || sessionExpiresAtMs == null) return
    const tick = () => {
      const now = Date.now()
      const msLeft = sessionExpiresAtMs - now
      if (msLeft <= 0) {
        setSessionWarning(true)
        return
      }
      if (msLeft < 60_000 && !extending && now - lastExtendRef.current > 60_000) {
        // Auto-extend silently
        lastExtendRef.current = now
        setExtending(true)
        fetch('/api/auth/signup/extend-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signupId }),
        })
          .then((r) => r.json().catch(() => ({})))
          .then((body) => {
            if (typeof body.expiresAt === 'string') {
              setSessionExpiresAtMs(new Date(body.expiresAt).getTime())
              setSessionWarning(false)
            }
          })
          .catch(() => {
            // Network blip — leave the warning state alone; the user can
            // still retry via the explicit Refresh button.
          })
          .finally(() => setExtending(false))
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [step, sessionExpiresAtMs, signupId, extending])

  async function manualExtendSession() {
    if (!signupId || extending) return
    setError('')
    setExtending(true)
    try {
      const res = await fetch('/api/auth/signup/extend-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Already-completed (410) means the user somehow finished — fine.
        // not_verified (403) means the OTP was never accepted — bounce back
        // to Step 2.
        if (res.status === 403) {
          setStep('verify-otp')
          setError('Please verify your code again.')
        } else {
          setError(body.error ?? 'Could not refresh session.')
        }
        return
      }
      if (typeof body.expiresAt === 'string') {
        setSessionExpiresAtMs(new Date(body.expiresAt).getTime())
        setSessionWarning(false)
        lastExtendRef.current = Date.now()
      }
    } catch (err) {
      console.error('Extend session error:', err)
      setError('Could not refresh session. Please check your connection.')
    } finally {
      setExtending(false)
    }
  }

  async function startSignup() {
    setError('')
    setLoading(true)
    try {
      // 2026-10-16: password is no longer sent to /start. It stays in
      // client state and is forwarded to /complete after the OTP is
      // verified. This way email_verifications never contains credential
      // material even if the user abandons the flow after verifying.
      const res = await fetch('/api/auth/signup/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
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
      setStep('verify-otp')
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
      // 2026-10-17: server gives us a fresh session expiry timestamp so the
      // user has 15 min (from this moment) to fill the profile form. We
      // surface a countdown on Step 3 and silently auto-extend at <60s left.
      if (typeof body.expiresAt === 'string') {
        setSessionExpiresAtMs(new Date(body.expiresAt).getTime())
        setSessionWarning(false)
      }
      setOtpSending(false)
      // OTP verified — advance to the profile step. We don't pre-fill
      // the tags because they're a separate, focused task.
      setStep('profile')
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

      let res = await fetch('/api/auth/signup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signupId,
          password: form.password,
          role: form.role,
          profilePayload,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        // 2026-10-17: server now auto-extends on its end, but as a belt-and-
        // suspenders: if we still get 410 (e.g. fresh deploy before server
        // was updated, or stale CDN edge), call /extend-session explicitly
        // and retry once. Without this, a user mid-typing would see a hard
        // failure and lose confidence.
        if (res.status === 410 && body.error?.toLowerCase().includes('expired')) {
          const extRes = await fetch('/api/auth/signup/extend-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signupId }),
          })
          if (extRes.ok) {
            const ext = await extRes.json().catch(() => ({}))
            if (typeof ext.expiresAt === 'string') {
              setSessionExpiresAtMs(new Date(ext.expiresAt).getTime())
              setSessionWarning(false)
            }
            // Retry once
            res = await fetch('/api/auth/signup/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                signupId,
                password: form.password,
                role: form.role,
                profilePayload,
              }),
            })
            if (!res.ok) {
              const retryBody = await res.json().catch(() => ({ error: 'Unknown error' }))
              setError(retryBody.error ?? 'Could not create account. Please try again.')
              setLoading(false)
              return
            }
          } else {
            setError('Session expired. Tap "Refresh session" below to continue.')
            setLoading(false)
            return
          }
        } else {
          setError(body.error ?? `Could not create account (${res.status}).`)
          setLoading(false)
          return
        }
      }

      // Sign the user in so they land on the dashboard with a live session.
      const { signIn } = await import('@/utils/supabase/auth')
      const { error: signInError } = await signIn(form.email, form.password)
      if (signInError) {
        // Account was created but sign-in failed (rare: cookie race, network).
        // Send the user to /login with a hint that their account is ready.
        navigate(`/login?registered=1&email=${encodeURIComponent(form.email)}`)
        return
      }
      navigate('/dashboard')
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
            className="w-7 h-7 rounded-sm bg-tourist text-paper flex items-center justify-center font-bold"
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
          Already a member? <strong className="text-tourist">Sign in</strong>
        </Link>
      </header>

      {/* 2-color role markers — every page exposes the brand colors */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4" role="list" aria-label="LOCALit brand colors">
        <span role="listitem" className="role-badge-tourist" title="Tourist role accent">Tourist</span>
        <span role="listitem" className="role-badge-buddy" title="Buddy role accent">Buddy</span>
      </div>

      <Stepper step={step} />

      {step === 'account' ? (
        <section className="bg-paper border-2 border-tourist-border rounded-sm p-6">
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
                <label htmlFor="fullName" className="form-label">
                  <span className="inline-block w-2 h-2 rounded-sm bg-tourist mr-2 align-middle" aria-hidden="true" />
                  Full name
                </label>
                <input
                  id="fullName"
                  type="text"
                  className="form-input border-tourist-border focus:border-tourist"
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
                  <span className="inline-block w-2 h-2 rounded-sm bg-tourist mr-2 align-middle" aria-hidden="true" />
                  Phone <span className="text-muted text-xs">(optional)</span>
                </label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input border-tourist-border focus:border-tourist"
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
              <label htmlFor="email" className="form-label">
                <span className="inline-block w-2 h-2 rounded-sm bg-tourist mr-2 align-middle" aria-hidden="true" />
                Email
              </label>
              <input
                id="email"
                type="email"
                className="form-input border-tourist-border focus:border-tourist"
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
                <label htmlFor="password" className="form-label">
                  <span className="inline-block w-2 h-2 rounded-sm bg-buddy mr-2 align-middle" aria-hidden="true" />
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  className="form-input border-buddy-border focus:border-buddy"
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
                    <p className="form-hint text-buddy-ink">{validatePassword(form.password)}</p>
                  ) : (
                    <p className="form-hint text-buddy-ink">At least 10 chars, with a letter and a number or symbol.</p>
                  )
                ) : null}
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">
                  <span className="inline-block w-2 h-2 rounded-sm bg-buddy mr-2 align-middle" aria-hidden="true" />
                  Confirm password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="form-input border-buddy-border focus:border-buddy"
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
                  <p className="form-hint text-buddy-ink">Passwords do not match.</p>
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
                  tone="tourist"
                />
                <ChoiceCard
                  active={form.role === 'buddy'}
                  onClick={() => pickRole('buddy')}
                  title="Local buddy"
                  desc="Show tourists around your city. Set your own hourly rate."
                  tone="buddy"
                />
              </div>
            </fieldset>

            <label className="flex items-start gap-2 mt-4 text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-tourist"
                checked={form.terms}
                onChange={(e) => setForm((p) => ({ ...p, terms: e.target.checked }))}
              />
              <span>
                I agree to LOCALit&apos;s{' '}
                <a href="#" onClick={(e) => e.preventDefault()} className="text-tourist hover:underline font-semibold">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" onClick={(e) => e.preventDefault()} className="text-tourist hover:underline font-semibold">
                  Privacy Policy
                </a>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={!stepReady || loading}
              className="btn-tourist w-full h-11 mt-5 inline-flex items-center justify-center gap-1"
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

      {step === 'verify-otp' ? (
        <section className="bg-paper border-2 border-tourist-border rounded-sm p-6">
          <header className="mb-5 pb-4 border-b border-border">
            <div className="flex items-center gap-2 text-tourist mb-2">
              <Mail size={18} aria-hidden="true" />
              <span className="text-eyebrow font-bold">Step 2 of 3</span>
            </div>
            <h1 className="text-section-title">Check your email</h1>
            <p className="text-sm text-muted mt-1">
              We sent a 6-digit code to{' '}
              <strong className="text-ink">{verifiedEmail ?? form.email}</strong>. Enter it
              below to continue.
            </p>
          </header>

          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <EmailNotice />

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (otpSending || otp.some((d) => d === '')) return
              verifyOtpCode()
            }}
            noValidate
          >
            <div className="form-group">
              <label className="form-label">
                <span className="inline-block w-2 h-2 rounded-sm bg-tourist mr-2 align-middle" aria-hidden="true" />
                Verification code
              </label>
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
                    className="form-input text-center text-lg border-tourist-border focus:border-tourist"
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
                disabled={otpSending || !stepReady}
                className="btn-tourist inline-flex items-center justify-center h-11 px-5 text-sm"
              >
                {otpSending ? 'Verifying…' : (
                  <>
                    Verify and continue
                    <ArrowRight size={14} aria-hidden="true" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={resendOtp}
                disabled={otpSending || resendCooldown > 0}
                className="inline-flex items-center gap-1 h-11 px-3 text-sm text-tourist hover:text-tourist-hover font-semibold disabled:opacity-50"
              >
                <RefreshCw size={12} aria-hidden="true" />
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </button>
            </div>
          </form>

          <button
            type="button"
            onClick={() => {
              setStep('account')
              setOtp(['', '', '', '', '', ''])
            }}
            className="w-full h-9 mt-4 text-xs text-muted hover:text-ink inline-flex items-center justify-center gap-1"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Back to account details
          </button>
        </section>
      ) : null}

      {step === 'profile' ? (
        <section className="bg-paper border-2 border-buddy-border rounded-sm p-6">
          <header className="mb-5 pb-4 border-b border-buddy-border">
            <div className="flex items-center gap-2 text-buddy-ink mb-2">
              <span className="text-eyebrow font-bold">Step 3 of 3</span>
            </div>
            <h1 className="text-section-title">
              {form.role === 'tourist' ? 'Tell us about your trip' : 'Set up your buddy profile'}
            </h1>
            <p className="text-sm text-muted mt-1">
              {form.role === 'tourist'
                ? 'So we can match you with the right buddies.'
                : 'Tourists see this on the buddy browse page.'}
            </p>
          </header>

          {/* 2026-10-17: session countdown so the user is never surprised by
              a "Verification expired" error at the very end. */}
          {sessionExpiresAtMs != null ? (
            <SessionTimer
              expiresAtMs={sessionExpiresAtMs}
              warning={sessionWarning}
              extending={extending}
              onRefresh={manualExtendSession}
            />
          ) : null}

          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {form.role === 'tourist' ? (
            <TouristTags form={form} setForm={setForm} toggleInterest={toggleInterest} toggleLanguage={toggleLanguage} />
          ) : (
            <BuddyTags form={form} setForm={setForm} toggleSpecialty={toggleSpecialty} toggleLanguage={toggleLanguage} />
          )}

          {/* 2026-10-17: surface the first missing requirement so the user
              isn't stuck staring at a greyed-out "Create account" button. */}
          {step3Missing ? (
            <p
              id="step3-missing-hint"
              className="mt-4 text-xs text-warning inline-flex items-start gap-1.5"
              role="status"
              aria-live="polite"
            >
              <AlertTriangle size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{step3Missing}</span>
            </p>
          ) : null}

          <button
            type="button"
            onClick={finalizeSignup}
            disabled={!stepReady || loading}
            className="btn-buddy w-full h-11 mt-4 inline-flex items-center justify-center gap-1"
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
              setStep('verify-otp')
            }}
            className="w-full h-9 mt-2 text-xs text-muted hover:text-ink inline-flex items-center justify-center gap-1"
          >
            <ArrowLeft size={12} aria-hidden="true" />
            Back to email verification
          </button>
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
        <label className="form-label" htmlFor="nationality">Where are you from?</label>
        <select
          id="nationality"
          className="form-input border-tourist-border focus:border-tourist"
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
          className="form-input border-tourist-border focus:border-tourist"
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
          {INTERESTS.map((i, idx) => {
            // Rotate through 2 tones so the chip strip visibly cycles both colors.
            const tones: Array<'tourist' | 'buddy'> = ['tourist', 'buddy']
            const tone = tones[idx % tones.length]
            return (
              <Chip
                key={i.id}
                active={form.interests.includes(i.id)}
                onClick={() => toggleInterest(i.id)}
                tone={tone}
              >
                {i.label}
              </Chip>
            )
          })}
        </div>
      </div>

      <div>
        <label className="form-label">Languages (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {LANGUAGES.map((l, idx) => {
            const tones: Array<'tourist' | 'buddy'> = ['tourist', 'buddy']
            const tone = tones[idx % tones.length]
            return (
              <Chip
                key={l}
                active={form.languages.includes(l)}
                onClick={() => toggleLanguage(l)}
                tone={tone}
              >
                {l}
              </Chip>
            )
          })}
        </div>
      </div>

      <div>
        <label className="form-label" htmlFor="arrivalDate">Arrival date (optional)</label>
        <input
          id="arrivalDate"
          type="date"
          className="form-input border-tourist-border focus:border-tourist"
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
        <label className="form-label" htmlFor="locationCity">City you cover</label>
        <input
          id="locationCity"
          type="text"
          className="form-input border-buddy-border focus:border-buddy"
          placeholder="Da Nang"
          value={form.locationCity}
          onChange={(e) => setForm((p) => ({ ...p, locationCity: e.target.value }))}
        />
      </div>

      <div>
        <label className="form-label">Languages (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {LANGUAGES.map((l, idx) => {
            const tones: Array<'tourist' | 'buddy'> = ['tourist', 'buddy']
            const tone = tones[idx % tones.length]
            return (
              <Chip
                key={l}
                active={form.languages.includes(l)}
                onClick={() => toggleLanguage(l)}
                tone={tone}
              >
                {l}
              </Chip>
            )
          })}
        </div>
      </div>

      <div>
        <label className="form-label">Specialties (pick 1 or more)</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {INTERESTS.map((i, idx) => {
            const tones: Array<'tourist' | 'buddy'> = ['buddy', 'tourist']
            const tone = tones[idx % tones.length]
            return (
              <Chip
                key={i.id}
                active={form.specialties.includes(i.id)}
                onClick={() => toggleSpecialty(i.id)}
                tone={tone}
              >
                {i.label}
              </Chip>
            )
          })}
        </div>
      </div>

      <div>
        <label className="form-label" htmlFor="hourlyRate">Hourly rate (USD)</label>
        <select
          id="hourlyRate"
          className="form-input border-tourist-border focus:border-tourist"
          value={String(form.hourlyRate)}
          onChange={(e) => setForm((p) => ({ ...p, hourlyRate: Number(e.target.value) }))}
        >
          {HOURLY_RATES.map((r) => (
            <option key={r.id} value={r.id}>{r.label} — {r.desc}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="form-label" htmlFor="bio">Short bio (≥ 10 characters)</label>
        <textarea
          id="bio"
          className="form-input"
          rows={4}
          placeholder="Tell tourists about you, your city, and what makes a great day with you."
          value={form.bio}
          onChange={(e) => setForm((p) => ({ ...p, bio: e.target.value }))}
        />
        <p className={`form-hint ${form.bio.trim().length >= 10 ? 'text-muted' : 'text-danger'}`}>
          {form.bio.trim().length} / 10 minimum
        </p>
      </div>
    </div>
  )
}

function SessionTimer({
  expiresAtMs,
  warning,
  extending,
  onRefresh,
}: {
  expiresAtMs: number
  warning: boolean
  extending: boolean
  onRefresh: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const msLeft = Math.max(0, expiresAtMs - now)
  const totalSec = Math.floor(msLeft / 1000)
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0')
  const ss = String(totalSec % 60).padStart(2, '0')
  // warning=true when the session has actually expired (server can't keep it
  // alive anymore — user must hit Refresh). sub-60s ticks the colour to amber
  // so the user knows the auto-extend is about to fire.
  const sub60s = !warning && msLeft > 0 && msLeft < 60_000
  const cls = warning
    ? 'border-danger bg-danger-bg text-danger'
    : sub60s
      ? 'border-warning bg-warning-bg text-warning'
      : 'border-buddy-border bg-surface text-muted'
  return (
    <div
      className={`mb-4 p-3 rounded-sm border ${cls} flex flex-wrap items-center justify-between gap-2`}
      role={warning ? 'alert' : 'status'}
    >
      <div className="flex items-center gap-2 text-xs font-semibold">
        <Info size={14} aria-hidden="true" />
        {warning
          ? 'Your session expired. Refresh to keep your form data.'
          : sub60s
            ? `Refreshing session in ${ss}s — keep typing…`
            : `Time to finish: ${mm}:${ss}`}
      </div>
      {warning ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={extending}
          className="inline-flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded-sm bg-danger text-paper border border-danger hover:opacity-90 disabled:opacity-50"
        >
          <RefreshCw size={12} aria-hidden="true" />
          {extending ? 'Refreshing…' : 'Refresh session'}
        </button>
      ) : null}
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
