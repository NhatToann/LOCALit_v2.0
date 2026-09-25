'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import './profile.css'

const CITIES = ['Da Nang', 'Hoi An', 'Hanoi', 'Ho Chi Minh City', 'Nha Trang', 'Sapa', 'Phu Quoc', 'Da Lat', 'Hue']
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
        reviewer_name: row.reviewer?.full_name ?? 'Người dùng',
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
      setError('Họ tên phải có ít nhất 2 ký tự.')
      return
    }
    if (buddy.profile.phone && !PHONE_REGEX.test(buddy.profile.phone)) {
      setError('Số điện thoại không hợp lệ.')
      return
    }
    if (buddy.languages.length === 0) {
      setError('Chọn ít nhất một ngôn ngữ.')
      return
    }
    if (buddy.specialties.length === 0) {
      setError('Chọn ít nhất một chuyên môn.')
      return
    }
    if (buddy.hourly_rate < 0 || buddy.hourly_rate > 500) {
      setError('Giá theo giờ phải nằm trong khoảng 0 - 500.')
      return
    }
    if (buddy.bio && buddy.bio.length > 500) {
      setError('Giới thiệu tối đa 500 ký tự.')
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
        location_city: buddy.location_city,
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
      setPwMsg('Vui lòng nhập đầy đủ các trường.')
      return
    }
    if (newPw !== confirm) {
      setPwMsg('Mật khẩu xác nhận không khớp.')
      return
    }
    if (newPw.length < 8 || !/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) {
      setPwMsg('Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ và số.')
      return
    }
    setPwSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setPwMsg('Không tìm thấy email tài khoản.')
      setPwSaving(false)
      return
    }
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPw,
    })
    if (reauthErr) {
      setPwMsg('Mật khẩu hiện tại không đúng.')
      setPwSaving(false)
      return
    }
    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setPwSaving(false)
    if (updateErr) {
      setPwMsg('Đổi mật khẩu thất bại: ' + updateErr.message)
      return
    }
    setPwMsg('✓ Đã đổi mật khẩu.')
    form.reset()
  }

  async function handleDeleteAccount() {
    if (!confirm('Xóa tài khoản sẽ xóa toàn bộ dữ liệu. Hành động này không thể hoàn tác. Tiếp tục?')) return
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error: delErr } = await supabase.from('profiles').delete().eq('id', user.id)
    if (delErr) {
      alert('Không thể xóa: ' + delErr.message)
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
          <h1 className="page-title">Hồ sơ Buddy</h1>
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
                      <h2>Thông tin Buddy</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                      </button>
                    </div>
                    {savedAt && <div className="alert alert-success">✓ Đã lưu thành công</div>}

                    <form className="profile-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Họ tên *</label>
                          <input
                            className="form-input"
                            value={buddy.profile.full_name}
                            onChange={(e) => setBuddy({ ...buddy, profile: { ...buddy.profile, full_name: e.target.value } })}
                            maxLength={100}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Số điện thoại</label>
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
                          <label className="form-label">Thành phố *</label>
                          <select
                            className="form-input form-select"
                            value={buddy.location_city}
                            onChange={(e) => setBuddy({ ...buddy, location_city: e.target.value })}
                          >
                            {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Phí theo giờ (USD)</label>
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
                        <label className="form-label">Giới thiệu về bạn</label>
                        <textarea
                          className="form-input form-textarea"
                          value={buddy.bio || ''}
                          onChange={(e) => setBuddy({ ...buddy, bio: e.target.value })}
                          rows={4}
                          maxLength={500}
                          placeholder="Kể về bản thân và điều bạn có thể chia sẻ với du khách..."
                        />
                        <p className="form-hint">{(buddy.bio ?? '').length}/500</p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Trạng thái nhận khách</label>
                        <select
                          className="form-input form-select"
                          value={buddy.is_available ? 'true' : 'false'}
                          onChange={(e) => setBuddy({ ...buddy, is_available: e.target.value === 'true' })}
                        >
                          <option value="true">🟢 Sẵn sàng nhận khách</option>
                          <option value="false">⚪ Tạm ẩn</option>
                        </select>
                      </div>
                    </form>
                  </div>
                )}

                {activeTab === 'interests' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Chuyên môn và ngôn ngữ</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                      </button>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ngôn ngữ bạn nói *</label>
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
                      <label className="form-label">Chuyên môn *</label>
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
                      <h2>Đánh giá từ khách ({reviews.length})</h2>
                    </div>
                    {reviews.length === 0 ? (
                      <div className="empty-state">
                        <div style={{ fontSize: 48 }}>⭐</div>
                        <h3>Chưa có đánh giá nào</h3>
                        <p>Hoàn thành chuyến đi đầu tiên để nhận đánh giá từ du khách.</p>
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
                                  <span className="review-trip">Đánh giá bạn</span>
                                </div>
                              </div>
                              <span className="review-date">{new Date(r.created_at).toLocaleDateString('vi-VN')}</span>
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
                      <h2>Tài khoản</h2>
                    </div>

                    <div className="settings-section">
                      <h3>🔒 Đổi mật khẩu</h3>
                      <form onSubmit={handleChangePassword}>
                        <div className="form-group">
                          <label className="form-label">Mật khẩu hiện tại</label>
                          <input type="password" name="old" className="form-input" autoComplete="current-password" />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Mật khẩu mới</label>
                          <input type="password" name="new" className="form-input" autoComplete="new-password" maxLength={128} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Xác nhận mật khẩu mới</label>
                          <input type="password" name="confirm" className="form-input" autoComplete="new-password" maxLength={128} />
                        </div>
                        {pwMsg && (
                          <div className={`alert ${pwMsg.startsWith('✓') ? 'alert-success' : 'alert-error'}`}>
                            <span>{pwMsg.startsWith('✓') ? '✓' : '⚠️'}</span>
                            <span>{pwMsg}</span>
                          </div>
                        )}
                        <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                          {pwSaving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                        </button>
                      </form>
                    </div>

                    <div className="settings-section danger">
                      <h3>⚠️ Xóa tài khoản</h3>
                      <p className="setting-desc">
                        Hành động này sẽ xóa vĩnh viễn hồ sơ, yêu cầu và đánh giá của bạn.
                      </p>
                      <button type="button" onClick={handleDeleteAccount} className="btn btn-danger mt-md">
                        Xóa tài khoản
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
                    {buddy.is_available ? '🟢 Đang nhận khách' : '⚪ Tạm ẩn'}
                  </span>
                </div>

                <Link href="/buddy/dashboard" className="btn btn-outline edit-btn">
                  ← Về Dashboard
                </Link>

                <nav className="profile-nav">
                  <button className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Hồ sơ
                  </button>
                  <button className={`nav-item ${activeTab === 'interests' ? 'active' : ''}`} onClick={() => setActiveTab('interests')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    Chuyên môn
                  </button>
                  <button className={`nav-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Đánh giá ({reviews.length})
                  </button>
                  <button className={`nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Tài khoản
                  </button>
                </nav>

                <hr style={{ margin: 'var(--space-md) 0' }} />

                <div className="text-sm">
                  <div className="flex-between py-xs">
                    <span className="text-muted">⭐ Đánh giá TB</span>
                    <strong>{buddy.rating_avg ? buddy.rating_avg.toFixed(1) : '—'}</strong>
                  </div>
                  <div className="flex-between py-xs">
                    <span className="text-muted">🧳 Chuyến hoàn thành</span>
                    <strong>{buddy.trips_completed}</strong>
                  </div>
                  <div className="flex-between py-xs">
                    <span className="text-muted">💵 Phí/giờ</span>
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
