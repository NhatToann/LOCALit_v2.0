'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Profile, Tourist } from '@/lib/types'
import './profile.css'

const INTERESTS = ['Beach', 'Photography', 'Food', 'History', 'Nature', 'Nightlife', 'Shopping', 'Culture', 'Adventure', 'Wellness', 'Sunset', 'Architecture', 'Local Life', 'Water Sports']
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
const NATIONALITIES = ['United States', 'United Kingdom', 'Australia', 'Singapore', 'Japan', 'South Korea', 'China', 'Vietnam', 'Other']

type Tab = 'personal' | 'preferences' | 'trips' | 'buddies' | 'reviews' | 'interests' | 'account'

const PHONE_REGEX = /^[+]?[\d\s\-()]{8,20}$/

export default function TouristProfilePage() {
  const [activeTab, setActiveTab] = useState<Tab>('personal')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tourist, setTourist] = useState<Tourist | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState('')
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
          supabase.from('bookings').select('id, status, trip:trips(id, name, start_date, destination)').eq('tourist_id', user.id).order('created_at', { ascending: false }).limit(20),
          supabase.from('reviews').select('id, rating, comment, created_at, reviewer:reviewer_id(full_name)').eq('reviewee_id', user.id).order('created_at', { ascending: false }).limit(20),
          supabase.from('reviews').select('id, rating, comment, created_at, reviewee:reviewee_id(full_name)').eq('reviewer_id', user.id).order('created_at', { ascending: false }).limit(20),
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
      interests: exists ? tourist.interests.filter((x) => x !== i) : [...tourist.interests, i],
    })
  }
  function toggleLanguage(l: string) {
    if (!tourist) return
    const exists = tourist.languages.includes(l)
    setTourist({
      ...tourist,
      languages: exists ? tourist.languages.filter((x) => x !== l) : [...tourist.languages, l],
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
      .update({ full_name: profile.full_name.trim(), phone: profile.phone || null, bio: profile.bio || null })
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
    setPwMsg('')
    const form = e.currentTarget
    const oldPw = (form.elements.namedItem('old') as HTMLInputElement).value
    const newPw = (form.elements.namedItem('new') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value

    if (!oldPw || !newPw || !confirm) {
      setPwMsg('Please fill in all fields.')
      return
    }
    if (newPw !== confirm) {
      setPwMsg('The new password and confirmation do not match.')
      return
    }
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      setPwMsg('New password must be at least 8 characters and include letters and numbers.')
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: profile?.email ?? '',
      password: oldPw,
    })
    if (reauthErr) {
      setPwMsg('Current password is incorrect.')
      setPwSaving(false)
      return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (updateErr) {
      setPwMsg('Password update failed: ' + updateErr.message)
      return
    }
    setPwMsg('✓ Password updated successfully.')
    form.reset()
  }

  async function handleDeleteAccount() {
    if (!confirm('Deleting your account will permanently remove your profile, trips, messages and reviews. Continue?')) return
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

  if (loading) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  if (!profile || !tourist) return <div className="container py-xl"><p>Profile not found.</p></div>

  const firstName = profile.full_name.split(' ')[0]

  return (
    <div className="profile-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">My Profile</h1>
        </div>
      </section>

      <section className="profile-content">
        <div className="container">
          <div className="profile-layout">
            {/* Main column */}
            <div className="profile-main">
              <div className="content-card">
                {error && (
                  <div className="alert alert-error m-md">
                    <span>⚠️</span><span>{error}</span>
                  </div>
                )}

                {activeTab === 'personal' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Personal Information</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : '💾 Save changes'}
                      </button>
                    </div>
                    {savedAt && <div className="alert alert-success">✓ Saved successfully</div>}

                    <form className="profile-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">First name</label>
                          <input className="form-input" value={profile.full_name.split(' ')[0] ?? ''} disabled />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Last name</label>
                          <input
                            className="form-input"
                            value={profile.full_name.split(' ').slice(1).join(' ') || ''}
                            onChange={(e) => setProfile({ ...profile, full_name: `${profile.full_name.split(' ')[0] ?? ''} ${e.target.value}`.trim() })}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-input" value={profile.email} disabled style={{ background: 'var(--bg-gray)' }} />
                        <p className="form-hint">Email cannot be changed.</p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Phone number</label>
                        <input
                          type="tel"
                          className="form-input"
                          value={profile.phone || ''}
                          onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                          placeholder="+84..."
                          maxLength={20}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Nationality</label>
                        <select
                          className="form-input form-select"
                          value={tourist.nationality ?? ''}
                          onChange={(e) => setTourist({ ...tourist, nationality: e.target.value })}
                        >
                          <option value="">-- Select --</option>
                          {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Date of birth</label>
                        <input
                          type="date"
                          className="form-input"
                          value={tourist.date_of_birth || ''}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setTourist({ ...tourist, date_of_birth: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">About me</label>
                        <textarea
                          className="form-input form-textarea"
                          value={profile.bio || ''}
                          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                          rows={4}
                          maxLength={500}
                          placeholder="Tell buddies about yourself and the trip you dream of..."
                        />
                        <p className="form-hint">{(profile.bio ?? '').length}/500 characters</p>
                      </div>
                    </form>
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Travel Preferences</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : '💾 Save changes'}
                      </button>
                    </div>
                    {savedAt && <div className="alert alert-success">✓ Saved successfully</div>}

                    <div className="form-group">
                      <label className="form-label">Your main destination</label>
                      <input
                        className="form-input"
                        value="Da Nang"
                        readOnly
                      />
                      <p className="form-hint">LOCALit currently focuses on Da Nang.</p>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Travel style</label>
                      <div className="interests-grid">
                        {TRAVEL_STYLES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`interest-card ${tourist.travel_style === s.id ? 'selected' : ''}`}
                            onClick={() => setTourist({ ...tourist, travel_style: s.id })}
                          >
                            <span className="interest-icon">
                              {s.id === 'solo' ? '🎒' : s.id === 'couple' ? '💑' : s.id === 'friends' ? '👥' : '👨‍👩‍👧'}
                            </span>
                            <span className="interest-label">{s.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Interests (select multiple)</label>
                      <div className="languages-grid">
                        {INTERESTS.map((i) => (
                          <button
                            key={i}
                            type="button"
                            className={`language-btn ${tourist.interests.includes(i) ? 'selected' : ''}`}
                            onClick={() => toggleInterest(i)}
                          >
                            {i}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Languages you speak</label>
                      <div className="languages-grid">
                        {LANGUAGES.map((l) => (
                          <button
                            key={l}
                            type="button"
                            className={`language-btn ${tourist.languages.includes(l) ? 'selected' : ''}`}
                            onClick={() => toggleLanguage(l)}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Daily budget</label>
                      <div className="interests-grid">
                        {BUDGETS.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className={`interest-card ${tourist.budget_range === b.id ? 'selected' : ''}`}
                            onClick={() => setTourist({ ...tourist, budget_range: b.id })}
                          >
                            <span className="interest-label">{b.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'trips' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>My Trips</h2>
                      <Link href="/tourist/trips" className="btn btn-primary">+ Plan a new trip</Link>
                    </div>
                    {trips.length === 0 ? (
                      <div className="empty-state">
                        <div style={{ fontSize: 48 }}>✈️</div>
                        <h3>No trips yet</h3>
                        <p>Plan your first Da Nang trip and connect with a local buddy.</p>
                      </div>
                    ) : (
                      <div className="trips-list">
                        {trips.map((b: any) => (
                          <div key={b.id} className="trip-item">
                            <div className="trip-info">
                              <h3>{b.trip?.name ?? 'Trip'}</h3>
                              <span className="trip-date">
                                {b.trip?.start_date ?? ''} · {b.trip?.destination ?? ''}
                              </span>
                            </div>
                            <div className="trip-actions">
                              <span className={`trip-status ${b.status?.toLowerCase() ?? 'upcoming'}`}>{b.status ?? 'Upcoming'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'buddies' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Saved Buddies</h2>
                      <Link href="/tourist/browse" className="btn btn-primary">Find more buddies</Link>
                    </div>
                    <div className="empty-state">
                      <div style={{ fontSize: 48 }}>🔍</div>
                      <h3>Coming soon</h3>
                      <p>Saving buddies will be available in a future update.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>My Reviews</h2>
                    </div>

                    <div className="reviews-section">
                      <h3 className="reviews-subtitle">Reviews you wrote</h3>
                      {reviewsWritten.length === 0 ? (
                        <p className="text-muted text-sm">You haven&apos;t written any reviews yet.</p>
                      ) : (
                        <div className="reviews-list">
                          {reviewsWritten.map((r: any) => (
                            <div key={r.id} className="review-item">
                              <div className="review-header">
                                <h3>Review for {r.reviewee?.full_name ?? 'Buddy'}</h3>
                                <span className="review-date">{new Date(r.created_at).toLocaleDateString('en-US')}</span>
                              </div>
                              <div className="review-rating">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <span key={s} style={{ color: s <= r.rating ? 'var(--accent)' : 'var(--border-color)' }}>★</span>
                                ))}
                              </div>
                              <p className="review-comment">{r.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="reviews-section">
                      <h3 className="reviews-subtitle">Reviews about you</h3>
                      {reviewsAboutMe.length === 0 ? (
                        <p className="text-muted text-sm">No reviews about you yet.</p>
                      ) : (
                        <div className="reviews-list">
                          {reviewsAboutMe.map((r: any) => (
                            <div key={r.id} className="review-item about-me">
                              <div className="review-header">
                                <div className="reviewer-info-inline">
                                  <div className="reviewer-avatar-small">{r.reviewer?.full_name?.charAt(0) ?? '?'}</div>
                                  <div>
                                    <h3>{r.reviewer?.full_name ?? 'Anonymous'}</h3>
                                    <span className="review-trip">Reviewed you</span>
                                  </div>
                                </div>
                                <span className="review-date">{new Date(r.created_at).toLocaleDateString('en-US')}</span>
                              </div>
                              <div className="review-rating">
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <span key={s} style={{ color: s <= r.rating ? 'var(--accent)' : 'var(--border-color)' }}>★</span>
                                ))}
                              </div>
                              <p className="review-comment">{r.comment}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'interests' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>My Interests</h2>
                      <p className="panel-desc">Help us match you with the right buddies</p>
                    </div>

                    <div className="interests-section">
                      <div className="interests-grid">
                        {[...new Set([...INTERESTS, ...tourist.interests])].map((i) => (
                          <button
                            key={i}
                            type="button"
                            className={`interest-tag ${tourist.interests.includes(i) ? 'selected' : ''}`}
                            onClick={() => toggleInterest(i)}
                          >
                            {i}
                          </button>
                        ))}
                      </div>

                      <div className="selected-interests-info">
                        <h3>Selected interests ({tourist.interests.length})</h3>
                        <p className="interests-hint">
                          These interests help us recommend the most relevant Da Nang buddies for you.
                        </p>
                        <div className="selected-tags">
                          {tourist.interests.length === 0 ? (
                            <span className="text-muted text-sm">No interests selected yet.</span>
                          ) : (
                            tourist.interests.map((i) => (
                              <span key={i} className="selected-tag">{i}</span>
                            ))
                          )}
                        </div>
                        <div className="mt-md">
                          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : 'Save interests'}
                          </button>
                          {savedAt && <span className="text-success ml-md">✓ Saved</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'account' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Account</h2>
                    </div>

                    <div className="settings-section">
                      <h3>🔒 Change password</h3>
                      <form onSubmit={handleChangePassword}>
                        <div className="form-group">
                          <label className="form-label">Current password</label>
                          <input type="password" name="old" className="form-input" autoComplete="current-password" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">New password</label>
                          <input type="password" name="new" className="form-input" autoComplete="new-password" maxLength={128} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Confirm new password</label>
                          <input type="password" name="confirm" className="form-input" autoComplete="new-password" maxLength={128} />
                        </div>
                        {pwMsg && (
                          <div className={`alert ${pwMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
                            <span>{pwMsg.startsWith('✓') ? '✓' : '⚠️'}</span>
                            <span>{pwMsg}</span>
                          </div>
                        )}
                        <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                          {pwSaving ? 'Updating...' : 'Update password'}
                        </button>
                      </form>
                    </div>

                    <div className="settings-section danger">
                      <h3>⚠️ Delete account</h3>
                      <p className="setting-desc">
                        This will permanently delete your profile, trips, messages and reviews.
                      </p>
                      <button type="button" onClick={handleDeleteAccount} className="btn btn-danger mt-md">
                        Delete account
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sidebar */}
            <aside className="profile-sidebar">
              <div className="profile-card">
                <div className="profile-avatar">
                  <span className="avatar-placeholder">{firstName.charAt(0)}</span>
                </div>
                <h2 className="profile-name">{profile.full_name}</h2>
                <span className="profile-role">Tourist</span>
                <p className="text-xs text-muted mt-sm">{profile.email}</p>

                <Link href="/tourist/dashboard" className="btn btn-outline edit-btn">
                  ← Back to Dashboard
                </Link>

                <nav className="profile-nav">
                  <button className={`nav-item ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Personal Info
                  </button>
                  <button className={`nav-item ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    Travel Preferences
                  </button>
                  <button className={`nav-item ${activeTab === 'trips' ? 'active' : ''}`} onClick={() => setActiveTab('trips')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    My Trips
                  </button>
                  <button className={`nav-item ${activeTab === 'buddies' ? 'active' : ''}`} onClick={() => setActiveTab('buddies')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    Saved Buddies
                  </button>
                  <button className={`nav-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Reviews
                  </button>
                  <button className={`nav-item ${activeTab === 'interests' ? 'active' : ''}`} onClick={() => setActiveTab('interests')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    Interests
                  </button>
                  <button className={`nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Account
                  </button>
                </nav>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
