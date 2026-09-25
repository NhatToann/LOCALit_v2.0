'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Profile, Tourist } from '@/lib/types'

const INTERESTS = ['Beach', 'Photography', 'Food', 'History', 'Nature', 'Nightlife', 'Shopping', 'Culture', 'Adventure', 'Wellness']
const TRAVEL_STYLES = [
  { id: 'solo', label: 'Solo', emoji: '🎒' },
  { id: 'couple', label: 'Couple', emoji: '💑' },
  { id: 'friends', label: 'Friends', emoji: '👥' },
  { id: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
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

type Tab = 'personal' | 'preferences' | 'account'

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

  useEffect(() => {
    async function load() {
      const user = await getCurrentUser()
      if (!user) return
      const supabase = createClient()
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
        supabase.from('tourists').select('*').eq('id', user.id).single<Tourist>(),
      ])
      setProfile(p)
      setTourist(t)
      setLoading(false)
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
    // Self-delete the profile row — RLS allows deleting own profile, which cascades
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

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-3xl font-bold">Hồ sơ của tôi</h1>
          <p className="text-muted mt-sm">Quản lý thông tin cá nhân và sở thích du lịch</p>
        </div>
        <Link href="/tourist/dashboard" className="text-primary">← Dashboard</Link>
      </div>

      <div className="profile-grid">
        <main>
          <div className="tab-bar">
            <button className={`tab ${activeTab === 'personal' ? 'active' : ''}`} onClick={() => setActiveTab('personal')}>
              👤 Thông tin cá nhân
            </button>
            <button className={`tab ${activeTab === 'preferences' ? 'active' : ''}`} onClick={() => setActiveTab('preferences')}>
              🧳 Sở thích du lịch
            </button>
            <button className={`tab ${activeTab === 'account' ? 'active' : ''}`} onClick={() => setActiveTab('account')}>
              ⚙️ Tài khoản
            </button>
          </div>

          <div className="card mt-md">
            <div className="card-body">
              {error && <div className="alert alert-error mb-md"><span>⚠️</span><span>{error}</span></div>}

              {activeTab === 'personal' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Họ tên *</label>
                    <input
                      className="form-input"
                      value={profile.full_name}
                      onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                      maxLength={100}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" value={profile.email} disabled style={{ background: 'var(--bg-gray)' }} />
                    <p className="text-xs text-muted mt-xs">Email không thể thay đổi.</p>
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
                    <label className="form-label">Giới thiệu ngắn</label>
                    <textarea
                      className="form-input form-textarea"
                      value={profile.bio || ''}
                      onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                      rows={3}
                      maxLength={500}
                      placeholder="Kể về bạn..."
                    />
                    <p className="text-xs text-muted mt-xs">{(profile.bio ?? '').length}/500</p>
                  </div>
                  <div className="flex gap-md">
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                      {saving ? 'Đang lưu...' : '💾 Lưu thay đổi'}
                    </button>
                    {savedAt && <span className="text-success flex items-center">✓ Đã lưu</span>}
                  </div>
                </>
              )}

              {activeTab === 'preferences' && (
                <>
                  <div className="grid grid-2">
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
                  </div>
                  <div className="form-group">
                    <label className="form-label">Điểm đến chính</label>
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
                    <div className="grid grid-2">
                      {TRAVEL_STYLES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setTourist({ ...tourist, travel_style: s.id })}
                          className={`btn ${tourist.travel_style === s.id ? 'btn-primary' : 'btn-outline'}`}
                        >
                          {s.emoji} {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Sở thích</label>
                    <div className="flex flex-wrap gap-sm">
                      {INTERESTS.map((i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggleInterest(i)}
                          className={`btn btn-sm ${tourist.interests.includes(i) ? 'btn-primary' : 'btn-outline'}`}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ngôn ngữ</label>
                    <div className="flex flex-wrap gap-sm">
                      {LANGUAGES.map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => toggleLanguage(l)}
                          className={`btn btn-sm ${tourist.languages.includes(l) ? 'btn-primary' : 'btn-outline'}`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ngân sách hằng ngày</label>
                    <div className="grid grid-2">
                      {BUDGETS.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setTourist({ ...tourist, budget_range: b.id })}
                          className={`btn ${tourist.budget_range === b.id ? 'btn-primary' : 'btn-outline'}`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
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
                      {pwMsg && <p className="text-sm mb-md" style={{ color: pwMsg.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>{pwMsg}</p>}
                      <button type="submit" className="btn btn-primary" disabled={pwSaving}>
                        {pwSaving ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
                      </button>
                    </form>
                  </div>

                  <hr style={{ margin: 'var(--space-xl) 0' }} />

                  <div className="danger-zone">
                    <h4 className="text-danger">⚠️ Xóa tài khoản</h4>
                    <p className="text-sm text-muted mt-sm">
                      Hành động này sẽ xóa vĩnh viễn hồ sơ, chuyến đi, tin nhắn và đánh giá của bạn. Không thể hoàn tác.
                    </p>
                    <button type="button" onClick={handleDeleteAccount} className="btn btn-danger mt-md">
                      Xóa tài khoản
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </main>

        <aside>
          <div className="card text-center">
            <div className="card-body">
              <span className="avatar avatar-2xl mx-auto">{profile.full_name.charAt(0)}</span>
              <h3 className="mt-md">{profile.full_name}</h3>
              <p className="text-sm text-muted">{tourist.nationality || 'Chưa cập nhật quốc tịch'}</p>
              <p className="text-xs text-muted mt-sm">{profile.email}</p>
            </div>
          </div>
        </aside>
      </div>

      <style>{`
        .profile-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--space-lg);
        }
        @media (max-width: 900px) {
          .profile-grid { grid-template-columns: 1fr; }
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
          transition: all var(--transition-fast);
        }
        .tab:hover { color: var(--primary); }
        .tab.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
          font-weight: 600;
        }
        .account-section h4 { margin-bottom: 8px; }
      `}</style>
    </div>
  )
}
