'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  User,
  Globe,
  MapPin,
  Star,
  Heart,
  Settings,
  Save,
  Trash2,
  Check,
  AlertTriangle,
} from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Profile, Tourist } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

const INTERESTS = [
  'Beach',
  'Photography',
  'Food',
  'History',
  'Nature',
  'Nightlife',
  'Shopping',
  'Culture',
  'Adventure',
  'Wellness',
  'Sunset',
  'Architecture',
  'Local Life',
  'Water Sports',
]
const TRAVEL_STYLES = [
  { id: 'solo', label: 'Solo' },
  { id: 'couple', label: 'Couple' },
  { id: 'friends', label: 'With Friends' },
  { id: 'family', label: 'Family' },
]
const LANGUAGES = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian']
const BUDGETS = [
  { id: 'under-50', label: 'Under $50' },
  { id: '50-100', label: '$50-100' },
  { id: '100-200', label: '$100-200' },
  { id: '200+', label: '$200+' },
]
const NATIONALITIES = [
  'United States',
  'United Kingdom',
  'Australia',
  'Singapore',
  'Japan',
  'South Korea',
  'China',
  'Vietnam',
  'Other',
]

type Tab = 'personal' | 'preferences' | 'trips' | 'reviews' | 'account'

const PHONE_REGEX = /^[+]?[\d\s\-()]{8,20}$/

const TABS: { id: Tab; label: string; icon: typeof User }[] = [
  { id: 'personal', label: 'Personal info', icon: User },
  { id: 'preferences', label: 'Travel preferences', icon: Globe },
  { id: 'trips', label: 'My trips', icon: MapPin },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'account', label: 'Account', icon: Settings },
]

export default function TouristProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('personal')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tourist, setTourist] = useState<Tourist | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [trips, setTrips] = useState<any[]>([])
  const [reviewsWritten, setReviewsWritten] = useState<any[]>([])
  const [reviewsAboutMe, setReviewsAboutMe] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      try {
        const user = await getCurrentUser()
        if (!user) return
        const supabase = createClient()
        const [
          { data: p },
          { data: t },
          { data: bookings },
          { data: reviewsToMe },
          { data: reviewsByMe },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase.from('tourists').select('*').eq('id', user.id).maybeSingle<Tourist>(),
          supabase
            .from('trips')
            .select('id, title, status, start_date, destination')
            .eq('tourist_id', user.id)
            .order('start_date', { ascending: false })
            .limit(20),
          supabase
            .from('reviews')
            .select('id, rating, comment, created_at, reviewer:reviewer_id(full_name)')
            .eq('reviewee_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
          supabase
            .from('reviews')
            .select('id, rating, comment, created_at, reviewee:reviewee_id(full_name)')
            .eq('reviewer_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20),
        ])
        setProfile(p)
        setTourist(t)
        setTrips(bookings ?? [])
        setReviewsAboutMe(reviewsToMe ?? [])
        setReviewsWritten(reviewsByMe ?? [])
      } catch (err) {
        console.error('Profile load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function toggleInterest(i: string) {
    if (!tourist) return
    const exists = tourist.interests.includes(i)
    setTourist({
      ...tourist,
      interests: exists
        ? tourist.interests.filter((x) => x !== i)
        : [...tourist.interests, i],
    })
  }
  function toggleLanguage(l: string) {
    if (!tourist) return
    const exists = tourist.languages.includes(l)
    setTourist({
      ...tourist,
      languages: exists
        ? tourist.languages.filter((x) => x !== l)
        : [...tourist.languages, l],
    })
  }

  async function handleSave() {
    if (!profile || !tourist) return
    setError('')

    if (profile.full_name.trim().length < 2) {
      setError('Full name must be at least 2 characters.')
      return
    }
    if (profile.phone && !PHONE_REGEX.test(profile.phone)) {
      setError('Please enter a valid phone number.')
      return
    }
    if (profile.bio && profile.bio.length > 500) {
      setError('Bio must be 500 characters or fewer.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: pErr } = await supabase
      .from('profiles')
      .update({
        full_name: profile.full_name.trim(),
        phone: profile.phone || null,
        bio: profile.bio || null,
      })
      .eq('id', profile.id)
    if (pErr) {
      setError(pErr.message)
      setSaving(false)
      return
    }
    const { error: tErr } = await supabase
      .from('tourists')
      .update({
        nationality: tourist.nationality || null,
        date_of_birth: tourist.date_of_birth || null,
        travel_style: tourist.travel_style || null,
        interests: tourist.interests,
        languages: tourist.languages,
        budget_range: tourist.budget_range,
        destination: tourist.destination || 'Da Nang',
      })
      .eq('id', tourist.id)
    setSaving(false)
    if (tErr) {
      setError(tErr.message)
      return
    }
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(null), 3000)
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPwMsg(null)
    const form = e.currentTarget
    const oldPw = (form.elements.namedItem('old') as HTMLInputElement).value
    const newPw = (form.elements.namedItem('new') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (!oldPw || !newPw || !confirm) {
      setPwMsg({ type: 'error', text: 'Please fill in all fields.' })
      return
    }
    if (newPw !== confirm) {
      setPwMsg({ type: 'error', text: 'The new password and confirmation do not match.' })
      return
    }
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      setPwMsg({
        type: 'error',
        text: 'New password must be at least 8 characters and include letters and numbers.',
      })
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: profile?.email ?? '',
      password: oldPw,
    })
    if (reauthErr) {
      setPwMsg({ type: 'error', text: 'Current password is incorrect.' })
      setPwSaving(false)
      return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (updateErr) {
      setPwMsg({ type: 'error', text: 'Password update failed: ' + updateErr.message })
      return
    }
    setPwMsg({ type: 'success', text: 'Password updated successfully.' })
    form.reset()
  }

  async function handleDeleteAccount() {
    if (
      !confirm(
        'Deleting your account will permanently remove your profile, trips, messages and reviews. Continue?',
      )
    )
      return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id)
    if (delErr) {
      alert('Could not delete: ' + delErr.message)
      return
    }
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (!profile || !tourist) {
    return (
      <div className="container-page py-16">
        <p className="text-muted">Profile not found.</p>
      </div>
    )
  }

  const firstName = profile.full_name.split(' ')[0]

  return (
    <div className="container-page py-8">
      <header className="mb-6">
        <p className="text-eyebrow text-primary mb-2">Account</p>
        <h1 className="text-page-title">My profile</h1>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="border border-border rounded-sm bg-surface p-5 h-fit">
          <div className="flex flex-col items-center text-center pb-5 border-b border-border">
            <Avatar name={profile.full_name} size="xl" />
            <p className="mt-3 text-base font-semibold text-ink">{profile.full_name}</p>
            <span className="badge badge-primary text-xs mt-1">Tourist</span>
            <p className="text-xs text-muted mt-1">{profile.email}</p>
          </div>
          <Link
            href="/tourist/dashboard"
            className="block mt-4 text-sm text-muted hover:text-ink"
          >
            ← Back to dashboard
          </Link>
          <nav className="mt-4 flex flex-col" role="tablist" aria-label="Profile sections">
            {TABS.map((t) => {
              const Icon = t.icon
              const active = activeTab === t.id
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(t.id)}
                  className={`flex items-center gap-2 h-10 px-3 text-sm font-medium border-l-2 -ml-px transition-colors duration-150 ${
                    active
                      ? 'text-primary border-primary bg-paper'
                      : 'text-muted border-transparent hover:text-ink'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                  {t.label}
                </button>
              )
            })}
          </nav>
        </aside>

        {/* Main column */}
        <main className="border border-border rounded-sm bg-surface p-6">
          {error ? (
            <div className="alert alert-error mb-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {activeTab === 'personal' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Personal information</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Save size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>

              {savedAt ? (
                <div className="alert alert-success mb-4" role="status">
                  <Check size={16} aria-hidden="true" />
                  <span>Saved successfully.</span>
                </div>
              ) : null}

              <div className="form-group">
                <label htmlFor="fullName" className="form-label">Full name</label>
                <input
                  id="fullName"
                  type="text"
                  className="form-input"
                  value={profile.full_name}
                  onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                  maxLength={100}
                  placeholder="Your full name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input bg-paper"
                  value={profile.email}
                  disabled
                />
                <p className="form-hint">Email cannot be changed.</p>
              </div>

              <div className="form-group">
                <label htmlFor="phone" className="form-label">Phone number</label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  value={profile.phone || ''}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  placeholder="+84..."
                  maxLength={20}
                />
              </div>

              <div className="form-group">
                <label htmlFor="nationality" className="form-label">Nationality</label>
                <select
                  id="nationality"
                  className="form-input form-select"
                  value={tourist.nationality ?? ''}
                  onChange={(e) => setTourist({ ...tourist, nationality: e.target.value })}
                >
                  <option value="">-- Select --</option>
                  {NATIONALITIES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="dob" className="form-label">Date of birth</label>
                <input
                  id="dob"
                  type="date"
                  className="form-input"
                  value={tourist.date_of_birth || ''}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setTourist({ ...tourist, date_of_birth: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor="bio" className="form-label">About me</label>
                <textarea
                  id="bio"
                  className="form-input form-textarea"
                  value={profile.bio || ''}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  rows={4}
                  maxLength={500}
                  placeholder="Tell buddies about yourself and the trip you dream of..."
                />
                <p className="form-hint">{(profile.bio ?? '').length}/500 characters</p>
              </div>
            </section>
          ) : null}

          {activeTab === 'preferences' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Travel preferences</h2>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  <Save size={14} aria-hidden="true" />
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </header>

              <div className="form-group">
                <label htmlFor="destination" className="form-label">Main destination</label>
                <input
                  id="destination"
                  type="text"
                  className="form-input bg-paper"
                  value="Da Nang"
                  readOnly
                />
                <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
              </div>

              <fieldset className="form-group">
                <legend className="form-label">Travel style</legend>
                <div className="grid grid-cols-2 gap-2">
                  {TRAVEL_STYLES.map((s) => {
                    const active = tourist.travel_style === s.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setTourist({ ...tourist, travel_style: s.id })}
                        className={`h-10 px-3 text-sm font-medium rounded-sm border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {s.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">Interests</legend>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map((i) => {
                    const active = tourist.interests.includes(i)
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleInterest(i)}
                        className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {i}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">Languages you speak</legend>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((l) => {
                    const active = tourist.languages.includes(l)
                    return (
                      <button
                        key={l}
                        type="button"
                        onClick={() => toggleLanguage(l)}
                        className={`h-8 px-3 text-sm rounded-pill border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {l}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="form-group">
                <legend className="form-label">Daily budget</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {BUDGETS.map((b) => {
                    const active = tourist.budget_range === b.id
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setTourist({ ...tourist, budget_range: b.id })}
                        className={`h-10 px-3 text-sm font-medium rounded-sm border transition-colors duration-150 ${
                          active
                            ? 'bg-primary text-paper border-primary'
                            : 'bg-transparent text-ink border-border hover:border-border-strong'
                        }`}
                      >
                        {b.label}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            </section>
          ) : null}

          {activeTab === 'trips' ? (
            <section>
              <header className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">My trips</h2>
                <Link
                  href="/tourist/trips/create"
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                >
                  Plan a new trip
                </Link>
              </header>

              {trips.length === 0 ? (
                <div className="border border-border rounded-sm p-8 bg-paper text-center">
                  <p className="text-sm text-muted">No trips yet. Plan your first Da Nang trip.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border border border-border rounded-sm">
                  {trips.map((b: any) => {
                    const badge =
                      b.status === 'confirmed'
                        ? 'badge-success'
                        : b.status === 'completed'
                        ? 'badge-info'
                        : 'badge-warning'
                    return (
                      <li key={b.id} className="p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-ink">{b.title ?? 'Trip'}</p>
                          <p className="text-xs text-muted mt-1">
                            {b.start_date ? new Date(b.start_date).toLocaleDateString('en-US') : ''}
                            {b.destination ? ` · ${b.destination}` : ''}
                          </p>
                        </div>
                        <span className={`badge ${badge} text-xs capitalize`}>
                          {b.status ?? 'Upcoming'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          ) : null}

          {activeTab === 'reviews' ? (
            <section>
              <header className="mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Reviews</h2>
              </header>

              <div className="mb-6">
                <h3 className="text-sm font-semibold text-ink mb-3">Reviews you wrote</h3>
                {reviewsWritten.length === 0 ? (
                  <p className="text-sm text-muted">You haven&apos;t written any reviews yet.</p>
                ) : (
                  <ul className="divide-y divide-border border border-border rounded-sm">
                    {reviewsWritten.map((r: any) => (
                      <li key={r.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-ink">
                            Review for {r.reviewee?.full_name ?? 'Buddy'}
                          </p>
                          <p className="text-xs text-muted">
                            {new Date(r.created_at).toLocaleDateString('en-US')}
                          </p>
                        </div>
                        <div className="flex gap-1 mb-2" aria-label={`Rated ${r.rating} out of 5`}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={14}
                              fill={s <= r.rating ? 'currentColor' : 'none'}
                              className={s <= r.rating ? 'text-warning' : 'text-border-strong'}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                        <p className="text-sm text-ink leading-relaxed">{r.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ink mb-3">Reviews about you</h3>
                {reviewsAboutMe.length === 0 ? (
                  <p className="text-sm text-muted">No reviews about you yet.</p>
                ) : (
                  <ul className="divide-y divide-border border border-border rounded-sm">
                    {reviewsAboutMe.map((r: any) => (
                      <li key={r.id} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Avatar
                              name={r.reviewer?.full_name ?? 'Anonymous'}
                              size="sm"
                            />
                            <p className="text-sm font-medium text-ink">
                              {r.reviewer?.full_name ?? 'Anonymous'}
                            </p>
                          </div>
                          <p className="text-xs text-muted">
                            {new Date(r.created_at).toLocaleDateString('en-US')}
                          </p>
                        </div>
                        <div className="flex gap-1 mb-2" aria-label={`Rated ${r.rating} out of 5`}>
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={14}
                              fill={s <= r.rating ? 'currentColor' : 'none'}
                              className={s <= r.rating ? 'text-warning' : 'text-border-strong'}
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                        <p className="text-sm text-ink leading-relaxed">{r.comment}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === 'account' ? (
            <section>
              <header className="mb-4 pb-4 border-b border-border">
                <h2 className="text-section-title">Account</h2>
              </header>

              <section className="mb-6">
                <h3 className="text-sm font-semibold text-ink mb-3">Change password</h3>
                <form onSubmit={handleChangePassword}>
                  <div className="form-group">
                    <label htmlFor="old-pw" className="form-label">Current password</label>
                    <input
                      id="old-pw"
                      type="password"
                      name="old"
                      autoComplete="current-password"
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="new-pw" className="form-label">New password</label>
                    <input
                      id="new-pw"
                      type="password"
                      name="new"
                      autoComplete="new-password"
                      maxLength={128}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="confirm-pw" className="form-label">Confirm new password</label>
                    <input
                      id="confirm-pw"
                      type="password"
                      name="confirm"
                      autoComplete="new-password"
                      maxLength={128}
                      className="form-input"
                    />
                  </div>
                  {pwMsg ? (
                    <div
                      className={`alert ${pwMsg.type === 'success' ? 'alert-success' : 'alert-error'} mb-3`}
                      role="status"
                    >
                      {pwMsg.type === 'success' ? (
                        <Check size={16} aria-hidden="true" />
                      ) : (
                        <AlertTriangle size={16} aria-hidden="true" />
                      )}
                      <span>{pwMsg.text}</span>
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={pwSaving}
                    className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                  >
                    {pwSaving ? 'Updating…' : 'Update password'}
                  </button>
                </form>
              </section>

              <section className="border-t border-border pt-6">
                <h3 className="text-sm font-semibold text-danger mb-2">Delete account</h3>
                <p className="text-sm text-muted mb-4 max-w-prose">
                  This permanently removes your profile, trips, messages, and reviews. There is no
                  undo.
                </p>
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-danger border border-danger hover:bg-danger hover:text-paper"
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Delete account
                </button>
              </section>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  )
}
