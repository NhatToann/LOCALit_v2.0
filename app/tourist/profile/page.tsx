'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Profile, Tourist, Connection } from '@/lib/types'

const INTERESTS = ['Beach', 'Photography', 'Food', 'History', 'Nature', 'Nightlife', 'Shopping', 'Culture', 'Adventure', 'Wellness']
const TRAVEL_STYLES = [{ id: 'solo', label: '🎒 Solo' }, { id: 'couple', label: '💑 Couple' }, { id: 'friends', label: '👥 Friends' }, { id: 'family', label: '👨‍👩‍👧 Family' }]
const LANGUAGES = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin']
const BUDGETS = [{ id: 'under-50', label: 'Dưới $50' }, { id: '50-100', label: '$50-100' }, { id: '100-200', label: '$100-200' }, { id: '200+', label: '$200+' }]

export default function TouristProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [tourist, setTourist] = useState<Tourist | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const user = await getCurrentUser()
      if (!user) return

      const supabase = createClient()
      const [{ data: p }, { data: t }, { data: c }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single<Profile>(),
        supabase.from('tourists').select('*').eq('id', user.id).single<Tourist>(),
        supabase.from('connections').select('*, buddy:buddies(*, profile:profiles(*))').eq('tourist_id', user.id).eq('status', 'accepted'),
      ])

      setProfile(p)
      setTourist(t)
      setConnections((c as Connection[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  function toggleInterest(i: string) {
    if (!tourist) return
    const exists = tourist.interests.includes(i)
    setTourist({ ...tourist, interests: exists ? tourist.interests.filter(x => x !== i) : [...tourist.interests, i] })
  }
  function toggleLanguage(l: string) {
    if (!tourist) return
    const exists = tourist.languages.includes(l)
    setTourist({ ...tourist, languages: exists ? tourist.languages.filter(x => x !== l) : [...tourist.languages, l] })
  }

  async function handleSave() {
    if (!profile || !tourist) return
    setSaving(true)

    const supabase = createClient()
    await supabase.from('profiles').update({
      full_name: profile.full_name,
      phone: profile.phone,
      bio: profile.bio,
    }).eq('id', profile.id)

    await supabase.from('tourists').update({
      nationality: tourist.nationality,
      date_of_birth: tourist.date_of_birth,
      travel_style: tourist.travel_style,
      interests: tourist.interests,
      languages: tourist.languages,
      budget_range: tourist.budget_range,
      destination: tourist.destination,
    }).eq('id', tourist.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  if (!profile || !tourist) return <div className="container py-xl"><p>Không tìm thấy</p></div>

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg">
        <div>
          <h1 className="text-3xl font-bold">Hồ sơ của tôi</h1>
          <p className="text-muted mt-sm">Giúp buddy hiểu bạn hơn</p>
        </div>
        <Link href="/tourist/dashboard" className="text-primary">← Quay lại</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        <div className="card">
          <div className="card-body">
            <h3 className="mb-lg">Thông tin cá nhân</h3>

            <div className="form-group">
              <label className="form-label">Họ tên</label>
              <input
                className="form-input"
                value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                maxLength={100}
              />
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
            </div>

            <hr style={{ margin: 'var(--space-lg) 0' }} />

            <h4 className="font-semibold mb-md">Thông tin du lịch</h4>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">Quốc tịch</label>
                <input
                  className="form-input"
                  value={tourist.nationality || ''}
                  onChange={(e) => setTourist({ ...tourist, nationality: e.target.value })}
                  maxLength={50}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày sinh</label>
                <input
                  type="date"
                  className="form-input"
                  value={tourist.date_of_birth || ''}
                  onChange={(e) => setTourist({ ...tourist, date_of_birth: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Điểm đến</label>
              <select
                className="form-input form-select"
                value={tourist.destination || 'Da Nang'}
                onChange={(e) => setTourist({ ...tourist, destination: e.target.value })}
              >
                <option>Da Nang</option>
                <option>Hoi An</option>
                <option>Hanoi</option>
                <option>Ho Chi Minh City</option>
                <option>Nha Trang</option>
                <option>Sapa</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Phong cách du lịch</label>
              <div className="grid grid-2">
                {TRAVEL_STYLES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setTourist({ ...tourist, travel_style: s.id })}
                    className={`btn ${tourist.travel_style === s.id ? 'btn-primary' : 'btn-outline'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Sở thích (chọn nhiều)</label>
              <div className="flex flex-wrap gap-sm">
                {INTERESTS.map(i => (
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
                {LANGUAGES.map(l => (
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
                {BUDGETS.map(b => (
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

            <div className="flex gap-md mt-lg">
              <button onClick={handleSave} disabled={saving} className="btn btn-primary">
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              {saved && <span className="flex items-center text-success">✓ Đã lưu</span>}
            </div>
          </div>
        </div>

        <aside>
          <div className="card mb-lg">
            <div className="card-body text-center">
              <div className="avatar avatar-2xl mx-auto">{profile.full_name.charAt(0)}</div>
              <h3 className="mt-md">{profile.full_name}</h3>
              <p className="text-sm text-muted">{tourist.nationality}</p>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="text-lg">Buddy đã kết nối ({connections.length})</h3>
            </div>
            <div className="card-body">
              {connections.length === 0 ? (
                <p className="text-sm text-muted text-center">Chưa kết nối với buddy nào.</p>
              ) : (
                <ul className="flex flex-col">
                  {connections.slice(0, 5).map(c => {
                    const b = c.buddy as any
                    return (
                      <li key={c.id} className="flex items-center gap-sm py-sm">
                        <div className="avatar avatar-md">{b?.profile?.full_name?.charAt(0) || '?'}</div>
                        <div>
                          <p className="text-sm font-medium">{b?.profile?.full_name}</p>
                          <p className="text-xs text-muted">{b?.location_city}</p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
