'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'

const CITIES = ['Da Nang', 'Hoi An', 'Hanoi', 'Ho Chi Minh City', 'Nha Trang', 'Sapa', 'Phu Quoc', 'Da Lat', 'Hue']
const LANGS = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian', 'Spanish']
const SPECIALTIES = ['Beach', 'Food', 'Photography', 'History', 'Culture', 'Nature', 'Adventure', 'Diving', 'Trekking', 'Nightlife', 'Shopping', 'Coffee', 'Cooking', 'Art']

type Tab = 'profile' | 'account'

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
    const supabase = createClient()
    const user = await getCurrentUser()
    if (!user) return

    const [{ data: b }, { data: r }] = await Promise.all([
      supabase
        .from('buddies')
        .select('*, profile:profiles(full_name, avatar_url, phone, bio)')
        .eq('id', user.id)
        .single<BuddyData>(),
      supabase
        .from('reviews')
        .select('id, rating, comment, created_at, reviewer:profiles!reviewer_id(full_name)')
        .eq('reviewee_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    if (b) {
      // Default hourly_rate to 15 if 0 (avoid showing $0 in UI)
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
    setLoading(false)
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
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: buddy?.profile.full_name ? '' : '',
      password: oldPw,
    })
    // We need the actual email - get it fresh
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.email) {
      setPwMsg('Không tìm thấy email tài khoản.')
      setPwSaving(false)
      return
    }
    const { error: r2 } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: oldPw,
    })
    if (r2 || reauthErr) {
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

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-3xl font-bold">Hồ sơ Buddy</h1>
          <p className="text-muted mt-sm">Cập nhật thông tin để thu hút du khách</p>
        </div>
        <Link href="/buddy/dashboard" className="text-primary">← Dashboard</Link>
      </div>

      <div className="buddy-profile-grid">
        <main>
          <div className="tab-bar">
            <button className={`tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
              ✏️ Thông tin Buddy
            </button>
            <button className={`tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
              ⚙️ Tài khoản
            </button>
          </div>

          <div className="card mt-md">
            <div className="card-body">
              {error && <div className="alert alert-error mb-md"><span>⚠️</span><span>{error}</span></div>}

              {activeTab === 'profile' && (
                <>
                  <div className="grid grid-2">
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

                  <div className="grid grid-2">
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
                    <label className="form-label">Giới thiệu</label>
                    <textarea
                      className="form-input form-textarea"
                      value={buddy.bio || ''}
                      onChange={(e) => setBuddy({ ...buddy, bio: e.target.value })}
                      rows={4}
                      maxLength={500}
                      placeholder="Kể về bản thân và điều bạn có thể chia sẻ..."
                    />
                    <p className="text-xs text-muted mt-xs">{(buddy.bio ?? '').length}/500</p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ngôn ngữ *</label>
                    <div className="flex flex-wrap gap-sm">
                      {LANGS.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => toggleLanguage(l)}
                          className={`btn btn-sm ${buddy.languages.includes(l) ? 'btn-primary' : 'btn-outline'}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Chuyên môn *</label>
                    <div className="flex flex-wrap gap-sm">
                      {SPECIALTIES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => toggleSpecialty(s)}
                          className={`btn btn-sm ${buddy.specialties.includes(s) ? 'btn-primary' : 'btn-outline'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
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

                  <div className="flex gap-md">
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                      {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                    </button>
                    {savedAt && <span className="text-success flex items-center">✓ Đã lưu</span>}
                  </div>
                </>
              )}

              {activeTab === 'account' && (
                <>
                  <div className="account-section">
                    <h4>🔒 Đổi mật khẩu</h4>
                    <form onSubmit={handleChangePassword} className="mt-md">
                      <div className="form-group">
                        <label className="form-label">Mật khẩu hiện tại</label>
                        <input type="password" name="old" className="form-input" autoComplete="current-password" />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Mật khẩu mới (≥8 ký tự, có chữ và số)</label>
                        <input type="password" name="new" className="form-input" autoComplete="new-password" maxLength={128} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Xác nhận mật khẩu mới</label>
                        <input type="password" name="confirm" className="form-input" autoComplete="new-password" maxLength={128} />
                      </div>
                      {pwMsg && (
                        <p className="text-sm mb-md" style={{ color: pwMsg.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>
                          {pwMsg}
                        </p>
                      )}
                      <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                        {pwSaving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                      </button>
                    </form>
                  </div>

                  <hr style={{ margin: 'var(--space-xl) 0' }} />

                  <div className="danger-zone">
                    <h4 className="text-danger">⚠️ Xóa tài khoản</h4>
                    <p className="text-sm text-muted mt-sm">
                      Hành động này sẽ xóa vĩnh viễn hồ sơ, yêu cầu và đánh giá của bạn.
                    </p>
                    <button type="button" onClick={handleDeleteAccount} className="btn btn-danger mt-md">
                      Xóa tài khoản
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Reviews section */}
          <div className="card mt-lg">
            <div className="card-header">
              <h3>Đánh giá từ khách ({reviews.length})</h3>
            </div>
            <div className="card-body">
              {reviews.length === 0 ? (
                <div className="empty-state">
                  <p>Chưa có đánh giá nào.</p>
                </div>
              ) : (
                <ul className="flex flex-col" style={{ gap: 'var(--space-md)' }}>
                  {reviews.map((r) => (
                    <li key={r.id} style={{ paddingBottom: 'var(--space-md)', borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <span className="avatar avatar-sm">{r.reviewer_name.charAt(0)}</span>
                        <strong>{r.reviewer_name}</strong>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{'⭐'.repeat(r.rating)}</span>
                        <span className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                      {r.comment && <p className="text-sm">{r.comment}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </main>

        <aside>
          <div className="card text-center">
            <div className="card-body">
              <span className="avatar avatar-2xl mx-auto">{buddy.profile.full_name.charAt(0)}</span>
              <h3 className="mt-md">{buddy.profile.full_name}</h3>
              <p className="text-sm text-muted">{buddy.location_city}</p>
              <div className="mt-md">
                <span className={`badge ${buddy.is_available ? 'badge-success' : 'badge-danger'}`}>
                  {buddy.is_available ? '🟢 Đang nhận khách' : '⚪ Tạm ẩn'}
                </span>
              </div>
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
          </div>
        </aside>
      </div>

      <style>{`
        .buddy-profile-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-lg);
        }
        @media (max-width: 900px) {
          .buddy-profile-grid { grid-template-columns: 1fr; }
        }
        .tab-bar {
          display: flex;
          gap: 4px;
          border-bottom: 2px solid var(--border-color);
        }
        .tab {
          padding: 10px 16px;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          margin-bottom: -2px;
          cursor: pointer;
          font-size: var(--font-size-sm);
          font-weight: 500;
          color: var(--text-secondary);
        }
        .tab.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
