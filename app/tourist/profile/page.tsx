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
  { id: 'under-50', label: 'Dưới $50' },
  { id: '50-100', label: '$50-100' },
  { id: '100-200', label: '$100-200' },
  { id: '200+', label: '$200+' },
]
const DESTINATIONS = ['Da Nang', 'Hoi An', 'Hanoi', 'Ho Chi Minh City', 'Nha Trang', 'Sapa', 'Phu Quoc']
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
      setError('Họ tên phải có ít nhất 2 ký tự.')
      return
    }
    if (profile.phone && !PHONE_REGEX.test(profile.phone)) {
      setError('Số điện thoại không hợp lệ.')
      return
    }
    if (profile.bio && profile.bio.length > 500) {
      setError('Giới thiệu tối đa 500 ký tự.')
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
        destination: tourist.destination || null,
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
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: profile?.email ?? '',
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

  if (loading) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  if (!profile || !tourist) return <div className="container py-xl"><p>Không tìm thấy hồ sơ.</p></div>

  const firstName = profile.full_name.split(' ')[0]

  return (
    <div className="profile-page">
      <section className="page-header">
        <div className="container">
          <h1 className="page-title">Hồ sơ của tôi</h1>
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
                      <h2>Thông tin cá nhân</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                      </button>
                    </div>
                    {savedAt && <div className="alert alert-success">✓ Đã lưu thành công</div>}

                    <form className="profile-form">
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Họ</label>
                          <input className="form-input" value={profile.full_name.split(' ')[0] ?? ''} disabled />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Tên</label>
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
                        <p className="form-hint">Email không thể thay đổi.</p>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Số điện thoại</label>
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
                        <label className="form-label">Quốc tịch</label>
                        <select
                          className="form-input form-select"
                          value={tourist.nationality ?? ''}
                          onChange={(e) => setTourist({ ...tourist, nationality: e.target.value })}
                        >
                          <option value="">-- Chọn --</option>
                          {NATIONALITIES.map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Ngày sinh</label>
                        <input
                          type="date"
                          className="form-input"
                          value={tourist.date_of_birth || ''}
                          max={new Date().toISOString().split('T')[0]}
                          onChange={(e) => setTourist({ ...tourist, date_of_birth: e.target.value })}
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Giới thiệu</label>
                        <textarea
                          className="form-input form-textarea"
                          value={profile.bio || ''}
                          onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                          rows={4}
                          maxLength={500}
                          placeholder="Kể về bạn và chuyến đi bạn mơ ước..."
                        />
                        <p className="form-hint">{(profile.bio ?? '').length}/500 ký tự</p>
                      </div>
                    </form>
                  </div>
                )}

                {activeTab === 'preferences' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Sở thích du lịch</h2>
                      <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                      </button>
                    </div>
                    {savedAt && <div className="alert alert-success">✓ Đã lưu thành công</div>}

                    <div className="form-group">
                      <label className="form-label">Điểm đến chính của bạn</label>
                      <select
                        className="form-input form-select"
                        value={tourist.destination || ''}
                        onChange={(e) => setTourist({ ...tourist, destination: e.target.value })}
                      >
                        {DESTINATIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Phong cách du lịch</label>
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
                      <label className="form-label">Sở thích (chọn nhiều)</label>
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
                      <label className="form-label">Ngôn ngữ bạn nói</label>
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
                      <label className="form-label">Ngân sách hằng ngày</label>
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
                      <h2>Chuyến đi của tôi</h2>
                      <Link href="/tourist/trips" className="btn btn-primary">+ Tạo chuyến mới</Link>
                    </div>
                    {trips.length === 0 ? (
                      <div className="empty-state">
                        <div style={{ fontSize: 48 }}>✈️</div>
                        <h3>Chưa có chuyến đi nào</h3>
                        <p>Tạo chuyến đi đầu tiên để kết nối với local buddy.</p>
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
                      <h2>Buddy đã lưu</h2>
                      <Link href="/tourist/browse" className="btn btn-primary">Tìm thêm buddy</Link>
                    </div>
                    <div className="empty-state">
                      <div style={{ fontSize: 48 }}>🔍</div>
                      <h3>Tính năng đang phát triển</h3>
                      <p>Tính năng lưu buddy sẽ sớm có mặt.</p>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="tab-panel">
                    <div className="panel-header">
                      <h2>Đánh giá của tôi</h2>
                    </div>

                    <div className="reviews-section">
                      <h3 className="reviews-subtitle">Đánh giá tôi đã viết</h3>
                      {reviewsWritten.length === 0 ? (
                        <p className="text-muted text-sm">Bạn chưa viết đánh giá nào.</p>
                      ) : (
                        <div className="reviews-list">
                          {reviewsWritten.map((r: any) => (
                            <div key={r.id} className="review-item">
                              <div className="review-header">
                                <h3>Đánh giá cho {r.reviewee?.full_name ?? 'Buddy'}</h3>
                                <span className="review-date">{new Date(r.created_at).toLocaleDateString('vi-VN')}</span>
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
                      <h3 className="reviews-subtitle">Đánh giá về tôi</h3>
                      {reviewsAboutMe.length === 0 ? (
                        <p className="text-muted text-sm">Chưa có đánh giá nào về bạn.</p>
                      ) : (
                        <div className="reviews-list">
                          {reviewsAboutMe.map((r: any) => (
                            <div key={r.id} className="review-item about-me">
                              <div className="review-header">
                                <div className="reviewer-info-inline">
                                  <div className="reviewer-avatar-small">{r.reviewer?.full_name?.charAt(0) ?? '?'}</div>
                                  <div>
                                    <h3>{r.reviewer?.full_name ?? 'Anonymous'}</h3>
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
                      <h2>Sở thích của tôi</h2>
                      <p className="panel-desc">Giúp chúng tôi match bạn với buddy phù hợp</p>
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
                        <h3>Sở thích đã chọn ({tourist.interests.length})</h3>
                        <p className="interests-hint">
                          Những sở thích này sẽ được dùng để gợi ý buddy phù hợp nhất với bạn.
                        </p>
                        <div className="selected-tags">
                          {tourist.interests.length === 0 ? (
                            <span className="text-muted text-sm">Chưa chọn sở thích nào.</span>
                          ) : (
                            tourist.interests.map((i) => (
                              <span key={i} className="selected-tag">{i}</span>
                            ))
                          )}
                        </div>
                        <div className="mt-md">
                          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? 'Đang lưu...' : 'Lưu sở thích'}
                          </button>
                          {savedAt && <span className="text-success ml-md">✓ Đã lưu</span>}
                        </div>
                      </div>
                    </div>
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
                        Hành động này sẽ xóa vĩnh viễn hồ sơ, chuyến đi, tin nhắn và đánh giá của bạn.
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
                <h2 className="profile-name">{profile.full_name}</h2>
                <span className="profile-role">Du khách</span>
                <p className="text-xs text-muted mt-sm">{profile.email}</p>

                <Link href="/tourist/dashboard" className="btn btn-outline edit-btn">
                  ← Về Dashboard
                </Link>

                <nav className="profile-nav">
                  <button className={`nav-item ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    Thông tin cá nhân
                  </button>
                  <button className={`nav-item ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    Sở thích du lịch
                  </button>
                  <button className={`nav-item ${activeTab === 'trips' ? 'active' : ''}`} onClick={() => setActiveTab('trips')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Chuyến đi của tôi
                  </button>
                  <button className={`nav-item ${activeTab === 'buddies' ? 'active' : ''}`} onClick={() => setActiveTab('buddies')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    Buddy đã lưu
                  </button>
                  <button className={`nav-item ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    Đánh giá
                  </button>
                  <button className={`nav-item ${activeTab === 'interests' ? 'active' : ''}`} onClick={() => setActiveTab('interests')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    Sở thích
                  </button>
                  <button className={`nav-item ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    Tài khoản
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
