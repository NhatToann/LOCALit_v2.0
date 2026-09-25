'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import './profile.css'

const LANGS = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian', 'Spanish']
const SPECIALTIES = ['Beach', 'Food', 'Photography', 'History', 'Culture', 'Nature', 'Adventure', 'Diving', 'Trekking', 'Nightlife', 'Shopping', 'Coffee', 'Cooking', 'Art']

type Tab = 'profile' | 'reviews' | 'interests' | 'account'

const PHONE_REGEX = /^[+]?[\d\s\-()]{8,20}$/

interface BuddyData {
  id: string
  location_city: string
  latitude: number | null
  longitude: number | null
  languages: string[]
  specialties: string[]
  hourly_rate: number
  bio: string | null
  is_available: boolean
  trips_completed: number
  rating_avg: number | null
  profile: {
    full_name: string
    email: string
    avatar_url: string | null
    phone: string | null
    bio: string | null
  }
}

export default function BuddyProfileEditPage() {
  const [activeTab, setActiveTab] = useState<Tab>('profile')
  const [buddy, setBuddy] = useState<BuddyData | null>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    try {
      const supabase = createClient()
      const user = await getCurrentUser()
      if (!user) return

      const [{ data: b }, { data: r }] = await Promise.all([
        supabase
          .from('buddies')
          .select('*, profile:profiles(full_name, email, avatar_url, phone, bio)')
          .eq('id', user.id)
          .maybeSingle<BuddyData>(),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer:profiles!reviewer_id(full_name)')
          .eq('reviewee_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      if (b) {
        setBuddy({
          ...b,
          hourly_rate: b.hourly_rate || 15,
        })
      }
      setReviews((r ?? []).map((row: any) => ({
        id: row.id,
        rating: row.rating,
        comment: row.comment,
        created_at: row.created_at,
        reviewer_name: row.reviewer?.full_name ?? 'Traveler',
      })))
    } catch (err) {
      console.error('Buddy profile load failed:', err)
    } finally {
      setLoading(false)
    }
  }

  function toggleLanguage(l: string) {
    if (!buddy) return
    setBuddy({
      ...buddy,
      languages: buddy.languages.includes(l) ? buddy.languages.filter((x) => x !== l) : [...buddy.languages, l],
    })
  }
  function toggleSpecialty(s: string) {
    if (!buddy) return
    setBuddy({
      ...buddy,
      specialties: buddy.specialties.includes(s) ? buddy.specialties.filter((x) => x !== s) : [...buddy.specialties, s],
    })
  }

  async function handleSave() {
    if (!buddy) return
    setError('')

    if (buddy.profile.full_name.trim().length < 2) {
      setError('Full name must be at least 2 characters.')
      return
    }
    if (buddy.profile.phone && !PHONE_REGEX.test(buddy.profile.phone)) {
      setError('Please enter a valid phone number.')
      return
    }
    if (buddy.languages.length === 0) {
      setError('Please select at least one language.')
      return
    }
    if (buddy.specialties.length === 0) {
      setError('Please select at least one specialty.')
      return
    }
    if (buddy.hourly_rate < 0 || buddy.hourly_rate > 500) {
      setError('Hourly rate must be between 0 and 500.')
      return
    }
    if (buddy.bio && buddy.bio.length > 500) {
      setError('Bio must be 500 characters or fewer.')
      return
    }

    setSaving(true)
    const supabase = createClient()
    const { error: pErr } = await supabase
      .from('profiles')
      .update({
        full_name: buddy.profile.full_name.trim(),
        phone: buddy.profile.phone || null,
      })
      .eq('id', buddy.id)
    if (pErr) {
      setError(pErr.message)
      setSaving(false)
      return
    }
    const { error: bErr } = await supabase
      .from('buddies')
      .update({
        location_city: 'Da Nang',
        hourly_rate: buddy.hourly_rate,
        bio: buddy.bio || null,
        languages: buddy.languages,
        specialties: buddy.specialties,
        is_available: buddy.is_available,
      })
      .eq('id', buddy.id)
    setSaving(false)
    if (bErr) {
      setError(bErr.message)
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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setPwMsg('Account email not found.')
      setPwSaving(false)
      return
    }
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
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
    if (!confirm('Deleting your account will permanently remove your profile, requests and reviews. Continue?')) return
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

  if (loading || !buddy) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>

  const firstName = buddy.profile.full_name.split(' ')[0]

  return (
    <div className="profile-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">Buddy Profile</h1>
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

                {activeTab === 'profile' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Buddy Information</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : '💾 Save changes'}
                      </button>
                    </div>
                    {savedAt && <div className="alert alert-success">✓ Saved successfully</div>}

                    <form className="profile-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Full name *</label>
                          <input
                            className="form-input"
                            value={buddy.profile.full_name}
                            onChange={(e) => setBuddy({ ...buddy, profile: { ...buddy.profile, full_name: e.target.value } })}
                            maxLength={100}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Phone number</label>
                          <input
                            type="tel"
                            className="form-input"
                            value={buddy.profile.phone || ''}
                            onChange={(e) => setBuddy({ ...buddy, profile: { ...buddy.profile, phone: e.target.value } })}
                            maxLength={20}
                            placeholder="+84..."
                          />
                        </div>
                      </div>

                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">City *</label>
                          <input
                            className="form-input"
                            value="Da Nang"
                            readOnly
                          />
                          <p className="form-hint">LOCALit currently only features Da Nang-based buddies.</p>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Hourly rate (USD)</label>
                          <input
                            type="number"
                            className="form-input"
                            value={buddy.hourly_rate}
                            onChange={(e) => setBuddy({ ...buddy, hourly_rate: parseFloat(e.target.value) || 0 })}
                            min={0}
                            max={500}
                            step={0.5}
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">About me</label>
                        <textarea
                          className="form-input form-textarea"
                          value={buddy.bio || ''}
                          onChange={(e) => setBuddy({ ...buddy, bio: e.target.value })}
                          rows={4}
                          maxLength={500}
                          placeholder="Tell travelers about yourself and what you can show them in Da Nang..."
                        />
                        <p className="form-hint">{(buddy.bio ?? '').length}/500</p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Availability</label>
                        <select
                          className="form-input form-select"
                          value={buddy.is_available ? 'true' : 'false'}
                          onChange={(e) => setBuddy({ ...buddy, is_available: e.target.value === 'true' })}
                        >
                          <option value="true">🟢 Accepting new travelers</option>
                          <option value="false">⚪ Hidden</option>
                        </select>
                      </div>
                    </form>
                  </div>
                )}

                {activeTab === 'interests' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Specialties & Languages</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Saving...' : '💾 Save changes'}
                      </button>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Languages you speak *</label>
                      <div className="languages-grid">
                        {LANGS.map((l) => (
                          <button
                            key={l}
                            type="button"
                            className={`language-btn ${buddy.languages.includes(l) ? 'selected' : ''}`}
                            onClick={() => toggleLanguage(l)}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Specialties *</label>
                      <div className="languages-grid">
                        {SPECIALTIES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`language-btn ${buddy.specialties.includes(s) ? 'selected' : ''}`}
                            onClick={() => toggleSpecialty(s)}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Reviews from travelers ({reviews.length})</h2>
                    </div>
                    {reviews.length === 0 ? (
                      <div className="empty-state">
                        <div style={{ fontSize: 48 }}>⭐</div>
                        <h3>No reviews yet</h3>
                        <p>Complete your first trip to start collecting reviews from travelers.</p>
                      </div>
                    ) : (
                      <div className="reviews-list">
                        {reviews.map((r) => (
                          <div key={r.id} className="review-item">
                            <div className="review-header">
                              <div className="reviewer-info-inline">
                                <div className="reviewer-avatar-small">{r.reviewer_name.charAt(0)}</div>
                                <div>
                                  <h3>{r.reviewer_name}</h3>
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
                            {r.comment && <p className="review-comment">{r.comment}</p>}
                          </div>
                        ))}
                      </div>
                    )}
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
                        This will permanently delete your profile, requests and reviews.
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
                <h2 className="profile-name">{buddy.profile.full_name}</h2>
                <span className="profile-role">Local Buddy</span>
                <p className="text-xs text-muted mt-sm">{buddy.location_city}</p>
                <div className="mt-md">
                  <span className={`badge ${buddy.is_available ? 'badge-success' : 'badge-danger'}`}>
                    {buddy.is_available ? '🟢 Accepting travelers' : '⚪ Hidden'}
                  </span>
                </div>

                <Link href="/buddy/dashboard" className="btn btn-outline edit-btn">
                  ← Back to Dashboard
                </Link>

                <nav className="profile-nav">
                  <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Profile
                  </button>
                  <button className={`nav-item ${activeTab === 'interests' ? 'active' : ''}`} onClick={() => setActiveTab('interests')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    Specialties
                  </button>
                  <button className={`nav-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Reviews ({reviews.length})
                  </button>
                  <button className={`nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Account
                  </button>
                </nav>

                <hr style={{ margin: 'var(--space-md) 0' }} />

                <div className="text-sm">
                  <div className="flex-between py-xs">
                    <span className="text-muted">⭐ Average rating</span>
                    <strong>{buddy.rating_avg ? buddy.rating_avg.toFixed(1) : '—'}</strong>
                  </div>
                  <div className="flex-between py-xs">
                    <span className="text-muted">🧳 Trips completed</span>
                    <strong>{buddy.trips_completed}</strong>
                  </div>
                  <div className="flex-between py-xs">
                    <span className="text-muted">💵 Hourly rate</span>
                    <strong>${buddy.hourly_rate}</strong>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </div>
  )
}
