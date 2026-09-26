'use client'

import { useState, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
// utils/supabase/auth exports createClient (re-export of the browser client).
// Currently unused in this file; kept for potential future client-side updates.
import '@/utils/supabase/auth'
import './register.css'

type Role = 'tourist' | 'buddy'

const INTERESTS = [
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'photography', label: 'Photography', emoji: '📷' },
  { id: 'history', label: 'History', emoji: '🏛️' },
  { id: 'beach', label: 'Beach', emoji: '🏖️' },
  { id: 'nature', label: 'Nature', emoji: '🏔️' },
  { id: 'nightlife', label: 'Nightlife', emoji: '🌃' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'culture', label: 'Local Culture', emoji: '🎎' },
  { id: 'adventure', label: 'Adventure', emoji: '🧗' },
  { id: 'wellness', label: 'Wellness', emoji: '🧘' },
]

const TRAVEL_STYLES = [
  { id: 'solo', label: 'Solo', desc: 'Exploring on your own' },
  { id: 'couple', label: 'Couple', desc: 'Traveling with a partner' },
  { id: 'friends', label: 'With Friends', desc: 'Traveling with friends' },
  { id: 'family', label: 'Family', desc: 'Traveling with family' },
]

const LANGUAGES = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian', 'Spanish']

const NATIONALITIES = [
  'United States', 'United Kingdom', 'Australia', 'Canada', 'Singapore',
  'Japan', 'South Korea', 'China', 'Vietnam', 'Thailand', 'Malaysia',
  'Germany', 'France', 'Netherlands', 'Other',
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

function passwordScore(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0
  if (pw.length >= 8) s++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
  return { score: s as 0 | 1 | 2 | 3 | 4, label: labels[s] }
}

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

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleParam = searchParams.get('role')
  const initialRole: Role | null = roleParam === 'buddy' || roleParam === 'tourist' ? roleParam : null
  const skipRoleStep = initialRole !== null

  // Step order: 0=Personal info, 1=Role, 2=Tags & bio.
  // When ?role= is passed (e.g. from /register?role=buddy on the landing
  // page), the role is pre-selected so we skip Step 1 — but we ALWAYS land
  // on Step 0 first so the user enters name/email/password/terms before
  // choosing interests/specialties. (Previously this jumped straight to
  // Step 2, which meant landing-page CTAs skipped the personal-info step.)
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<FormState>(() => ({
    ...INITIAL_FORM,
    role: initialRole ?? 'tourist',
  }))
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const pw = useMemo(() => passwordScore(form.password), [form.password])

  function pickRole(role: Role) {
    setForm(p => ({ ...p, role }))
    setStep(2)
  }

  function toggleInterest(id: string) {
    setForm(prev => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter(i => i !== id)
        : [...prev.interests, id],
    }))
  }

  function toggleSpecialty(id: string) {
    setForm(prev => ({
      ...prev,
      specialties: prev.specialties.includes(id)
        ? prev.specialties.filter(i => i !== id)
        : [...prev.specialties, id],
    }))
  }

  function toggleLanguage(lang: string) {
    setForm(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang],
    }))
  }

  const stepReady = useMemo(() => {
    if (step === 0) {
      // Personal info step
      return (
        form.fullName.trim().length >= 2 &&
        validateEmail(form.email) &&
        form.password.length >= 6 &&
        form.password === form.confirmPassword &&
        form.terms
      )
    }
    if (step === 2) {
      // Tags & bio step (role-specific)
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
  }, [step, form])

  async function handleSubmit() {
    setError('')
    setLoading(true)

    try {
      // Build the profile payload (same as before, but simpler — no more OTP).
      const payload =
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

      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          profilePayload: payload,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }))
        setError(body.error ?? `Sign up failed (${res.status}).`)
        setLoading(false)
        return
      }

      const data = (await res.json()) as {
        userId: string
        session: { access_token: string; refresh_token: string; expires_in: number; expires_at: number } | null
      }

      // If the server could not mint a session (edge case), fall back to /login.
      if (!data.session) {
        router.push(`/login?registered=1&email=${encodeURIComponent(form.email)}`)
        return
      }

      // Inject the session into the browser Supabase client so the user lands
      // on their dashboard without a second round-trip to sign in.
      if (typeof window !== 'undefined') {
        const { createClient } = await import('@/utils/supabase/auth')
        const supabase = createClient()
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })
      }

      router.push(form.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard')
      return
    } catch (err) {
      console.error('Sign-up error:', err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const stepLabels = ['Personal info', 'Choose role', 'Tags & bio']
  const totalSteps = 3

  return (
    <div className="register-page">
      <div className="register-container">
        {/* Top header (always shown) */}
        <div className="register-topbar">
          <Link href="/" className="register-logo">
            <span className="register-logo-mark">L</span>
            <span className="register-logo-text">LOCALit</span>
          </Link>
          <div className="register-topbar-meta">
            {step > 0 && (
              <button
                type="button"
                className="link-back"
                onClick={() => setStep(s => Math.max(0, s - 1))}
                disabled={loading}
              >
                ← Back
              </button>
            )}
            <Link href="/login" className="register-topbar-signin">
              Already a member? <strong>Sign in</strong>
            </Link>
          </div>
        </div>

        {/* Stepper (shown on all steps so users see progress) */}
        {step >= 0 && (
          <div className="register-stepper" aria-label="Sign-up progress">
            {stepLabels.map((label, i) => (
              <div key={label} className={`stepper-item ${step >= i ? 'active' : ''} ${step === i ? 'current' : ''}`}>
                <span className="stepper-dot">{i + 1}</span>
                <span className="stepper-label">{label}</span>
                {i < stepLabels.length - 1 && <span className="stepper-bar" />}
              </div>
            ))}
          </div>
        )}

        {/* STEP 0 — Personal info (name, phone, email, password, terms) */}
        {step === 0 && (
          <div className="register-pane">
            <div className="register-pane-head">
              <h2>Create your account</h2>
              <p className="register-pane-sub">
                Tell us who you are. You&apos;ll pick your role and interests on the next steps.
              </p>
            </div>

            <form
              className="register-form"
              onSubmit={(e) => {
                e.preventDefault()
                // If the landing page passed ?role=..., skip the role step
                // and go straight to the role-specific profile step.
                if (stepReady) setStep(skipRoleStep ? 2 : 1)
              }}
            >
              <div className="reg-row reg-row-2">
                <div className="form-group">
                  <label htmlFor="fullName">Full name</label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-input"
                    placeholder="Alex Johnson"
                    value={form.fullName}
                    onChange={(e) => setForm(p => ({ ...p, fullName: e.target.value }))}
                    required
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">
                    Phone <span className="optional">optional</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    className="form-input"
                    placeholder="+84 123 456 789"
                    value={form.phone}
                    onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                    maxLength={20}
                    autoComplete="tel"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className={`form-input ${form.email && !validateEmail(form.email) ? 'error' : ''}`}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                  required
                  autoComplete="email"
                />
                {form.email && !validateEmail(form.email) && (
                  <p className="form-hint error">Please enter a valid email address.</p>
                )}
              </div>

              <div className="reg-row reg-row-2">
                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    className="form-input"
                    placeholder="At least 6 characters"
                    value={form.password}
                    onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                  {form.password && (
                    <div className={`pw-meter pw-meter-${pw.score}`} aria-label={`Password strength: ${pw.label}`}>
                      <span /><span /><span /><span />
                    </div>
                  )}
                  {form.password && (
                    <p className="form-hint">Strength: {pw.label}</p>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirm password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className={`form-input ${form.confirmPassword && form.password !== form.confirmPassword ? 'error' : ''}`}
                    placeholder="Re-enter your password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm(p => ({ ...p, confirmPassword: e.target.value }))}
                    required
                    autoComplete="new-password"
                  />
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p className="form-hint error">Passwords do not match.</p>
                  )}
                </div>
              </div>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={form.terms}
                  onChange={(e) => setForm(p => ({ ...p, terms: e.target.checked }))}
                />
                <span>
                  I agree to LOCALit&apos;s{' '}
                  <a href="#" onClick={(e) => e.preventDefault()}>Terms of Service</a> and{' '}
                  <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>.
                </span>
              </label>

              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={!stepReady}>
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* STEP 1 — Role selection hero */}
        {step === 1 && (
          <div className="role-hero">
            <div className="role-hero-intro">
              <span className="role-hero-eyebrow">Almost there</span>
              <h1 className="role-hero-title">How will you use LOCALit?</h1>
              <p className="role-hero-subtitle">
                Pick the experience that fits you — you can always switch later from your profile settings.
              </p>
            </div>

            <div className="role-grid">
              <button
                type="button"
                className="role-card role-card-tourist"
                onClick={() => pickRole('tourist')}
              >
                <div className="role-card-icon" aria-hidden="true">🧳</div>
                <h2 className="role-card-title">I&apos;m a Tourist</h2>
                <p className="role-card-desc">
                  Discover Da Nang alongside trusted local buddies who share your interests and language.
                </p>
                <ul className="role-card-features">
                  <li>Browse verified local buddies</li>
                  <li>Plan trips together in chat</li>
                  <li>Get hand-picked recommendations</li>
                </ul>
                <span className="role-card-cta">Continue as Tourist →</span>
              </button>

              <button
                type="button"
                className="role-card role-card-buddy"
                onClick={() => pickRole('buddy')}
              >
                <div className="role-card-icon" aria-hidden="true">🌍</div>
                <h2 className="role-card-title">I&apos;m a Local Buddy</h2>
                <p className="role-card-desc">
                  Share the best of your city, meet travelers from around the world, and earn on your schedule.
                </p>
                <ul className="role-card-features">
                  <li>Receive trip requests from travelers</li>
                  <li>Set your own hourly rate</li>
                  <li>Build reviews and a trusted profile</li>
                </ul>
                <span className="role-card-cta">Continue as Buddy →</span>
              </button>
            </div>

            <p className="role-hero-foot">
              🔒 We never share your contact details without your permission.
            </p>
          </div>
        )}

        {/* STEP 2 — Role-specific profile */}
        {step === 2 && (
          <div className="register-pane">
            <div className="register-pane-head">
              <h2>
                {form.role === 'buddy' ? 'Tell travelers about you' : 'Tell us about your trip'}
              </h2>
              <p className="register-pane-sub">
                Signing up as <strong>{form.role === 'buddy' ? 'a Local Buddy' : 'a Tourist'}</strong>.{' '}
                <button type="button" className="link-inline" onClick={() => setStep(1)}>Change</button>
              </p>
              <p className="register-pane-sub">
                We&apos;ll use this to match you with the right {form.role === 'buddy' ? 'travelers' : 'buddies'}. You can edit everything later.
              </p>
            </div>

            <form
              className="register-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (stepReady && !loading) handleSubmit()
              }}
            >
              {form.role === 'tourist' ? (
                <>
                  <div className="reg-row reg-row-2">
                    <div className="form-group">
                      <label htmlFor="nationality">Nationality</label>
                      <select
                        id="nationality"
                        className="form-input"
                        value={form.nationality}
                        onChange={(e) => setForm(p => ({ ...p, nationality: e.target.value }))}
                        required
                      >
                        <option value="">Select your country</option>
                        {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="dateOfBirth">
                        Date of birth <span className="optional">optional</span>
                      </label>
                      <input
                        id="dateOfBirth"
                        type="date"
                        className="form-input"
                        value={form.dateOfBirth}
                        onChange={(e) => setForm(p => ({ ...p, dateOfBirth: e.target.value }))}
                        max={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Travel style</label>
                    <div className="reg-choice-grid">
                      {TRAVEL_STYLES.map(style => (
                        <button
                          key={style.id}
                          type="button"
                          className={`reg-choice ${form.travelStyle === style.id ? 'selected' : ''}`}
                          onClick={() => setForm(p => ({ ...p, travelStyle: style.id }))}
                        >
                          <strong>{style.label}</strong>
                          <span>{style.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Interests <span className="form-hint inline">(pick at least one)</span></label>
                    <div className="reg-chip-grid">
                      {INTERESTS.map(i => (
                        <button
                          key={i.id}
                          type="button"
                          className={`reg-chip ${form.interests.includes(i.id) ? 'selected' : ''}`}
                          onClick={() => toggleInterest(i.id)}
                        >
                          <span className="chip-emoji">{i.emoji}</span>
                          <span>{i.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Languages you speak</label>
                    <div className="reg-chip-grid">
                      {LANGUAGES.map(lang => (
                        <button
                          key={lang}
                          type="button"
                          className={`reg-chip ${form.languages.includes(lang) ? 'selected' : ''}`}
                          onClick={() => toggleLanguage(lang)}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Daily budget</label>
                    <div className="reg-choice-grid">
                      {BUDGETS.map(b => (
                        <button
                          key={b.id}
                          type="button"
                          className={`reg-choice ${form.budgetRange === b.id ? 'selected' : ''}`}
                          onClick={() => setForm(p => ({ ...p, budgetRange: b.id }))}
                        >
                          <strong>{b.label}</strong>
                          <span>{b.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="reg-row reg-row-2">
                    <div className="form-group">
                      <label htmlFor="destination">Destination</label>
                      <input
                        id="destination"
                        type="text"
                        className="form-input"
                        value={form.destination}
                        onChange={(e) => setForm(p => ({ ...p, destination: e.target.value }))}
                        maxLength={100}
                      />
                      <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
                    </div>
                    <div className="form-group">
                      <label htmlFor="arrivalDate">
                        Arrival date <span className="optional">optional</span>
                      </label>
                      <input
                        id="arrivalDate"
                        type="date"
                        className="form-input"
                        value={form.arrivalDate}
                        onChange={(e) => setForm(p => ({ ...p, arrivalDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="reg-row reg-row-2">
                    <div className="form-group">
                      <label htmlFor="locationCity">Your city</label>
                      <input
                        id="locationCity"
                        type="text"
                        className="form-input"
                        value={form.locationCity}
                        onChange={(e) => setForm(p => ({ ...p, locationCity: e.target.value }))}
                        maxLength={100}
                        required
                      />
                      <p className="form-hint">LOCALit currently only features Da Nang-based buddies.</p>
                    </div>
                    <div className="form-group">
                      <label>Hourly rate</label>
                      <div className="reg-rate-grid">
                        {HOURLY_RATES.map(r => (
                          <button
                            key={r.id}
                            type="button"
                            className={`reg-rate ${form.hourlyRate === r.id ? 'selected' : ''}`}
                            onClick={() => setForm(p => ({ ...p, hourlyRate: r.id }))}
                          >
                            <strong>{r.label}</strong>
                            <span>{r.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Specialties <span className="form-hint inline">(pick at least one)</span></label>
                    <div className="reg-chip-grid">
                      {INTERESTS.map(i => (
                        <button
                          key={i.id}
                          type="button"
                          className={`reg-chip ${form.specialties.includes(i.id) ? 'selected' : ''}`}
                          onClick={() => toggleSpecialty(i.id)}
                        >
                          <span className="chip-emoji">{i.emoji}</span>
                          <span>{i.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Languages you speak</label>
                    <div className="reg-chip-grid">
                      {LANGUAGES.map(lang => (
                        <button
                          key={lang}
                          type="button"
                          className={`reg-chip ${form.languages.includes(lang) ? 'selected' : ''}`}
                          onClick={() => toggleLanguage(lang)}
                        >
                          {lang}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor="bio">
                      About you <span className="form-hint inline">(at least 30 characters)</span>
                    </label>
                    <textarea
                      id="bio"
                      className="form-input form-textarea"
                      value={form.bio}
                      onChange={(e) => setForm(p => ({ ...p, bio: e.target.value }))}
                      maxLength={500}
                      rows={5}
                      placeholder="Tell travelers about yourself and what you can show them in Da Nang..."
                    />
                    <p className="form-hint">{form.bio.trim().length}/500</p>
                  </div>
                </>
              )}

              {error && (
                <div className="alert alert-error">
                  <span aria-hidden="true">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setStep(1)}
                  disabled={loading}
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!stepReady || loading}
                >
                  {loading ? 'Creating your account…' : `Create ${form.role === 'buddy' ? 'Buddy' : 'Tourist'} Account`}
                </button>
              </div>
            </form>
          </div>
        )}

        {step > 0 && (
          <p className="register-foot">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        )}

        {/* progress announced for screen readers */}
        <span className="visually-hidden" aria-live="polite">
          {step > 0 ? `Step ${step} of ${totalSteps - 1}: ${stepLabels[step]}` : ''}
        </span>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    }>
      <RegisterForm />
    </Suspense>
  )
}
