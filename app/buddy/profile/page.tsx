'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'

interface BuddyData {
  id: string
  location_city: string
  languages: string[]
  specialties: string[]
  hourly_rate: number
  bio: string | null
  is_available: boolean
  profile: {
    full_name: string
    avatar_url: string | null
    phone: string | null
  }
}

export default function BuddyProfilePage() {
  const [buddy, setBuddy] = useState<BuddyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('buddies')
        .select('*, profile:profiles(*)')
        .eq('id', user.id)
        .single<BuddyData>()

      setBuddy(data)
      setLoading(false)
    }
    load()
  }, [])

  async function updateField(field: string, value: any) {
    if (!buddy) return
    setBuddy({ ...buddy, [field]: value })
  }

  async function updateProfileField(field: string, value: string) {
    if (!buddy) return
    setBuddy({ ...buddy, profile: { ...buddy.profile, [field]: value } })
  }

  async function handleSave() {
    if (!buddy) return
    setSaving(true)
    const supabase = createClient()

    // Update profile (name, phone)
    await supabase.from('profiles').update({
      full_name: buddy.profile.full_name,
      phone: buddy.profile.phone || null,
    }).eq('id', buddy.id)

    // Update buddy
    await supabase.from('buddies').update({
      location_city: buddy.location_city,
      hourly_rate: buddy.hourly_rate,
      bio: buddy.bio || null,
      languages: buddy.languages,
      specialties: buddy.specialties,
      is_available: buddy.is_available,
    }).eq('id', buddy.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  if (!buddy) return <div className="container py-xl"><p>Không tìm thấy</p></div>

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg">
        <div>
          <h1 className="text-3xl font-bold">Hồ sơ Buddy</h1>
          <p className="text-muted mt-sm">Cập nhật thông tin để thu hút du khách</p>
        </div>
        <Link href="/buddy/dashboard" className="text-primary">← Quay lại</Link>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        <div className="card">
          <div className="card-body">
            <h3 className="mb-lg">Thông tin cơ bản</h3>

            <div className="form-group">
              <label className="form-label">Họ tên</label>
              <input
                className="form-input"
                value={buddy.profile.full_name}
                onChange={(e) => updateProfileField('full_name', e.target.value)}
                maxLength={100}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Số điện thoại</label>
              <input
                type="tel"
                className="form-input"
                value={buddy.profile.phone || ''}
                onChange={(e) => updateProfileField('phone', e.target.value)}
                maxLength={20}
                placeholder="+84..."
              />
            </div>

            <div className="form-group">
              <label className="form-label">Thành phố</label>
              <input
                className="form-input"
                value={buddy.location_city}
                onChange={(e) => updateField('location_city', e.target.value)}
                maxLength={50}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Giá theo giờ (USD)</label>
              <input
                type="number"
                className="form-input"
                value={buddy.hourly_rate}
                onChange={(e) => updateField('hourly_rate', parseFloat(e.target.value) || 0)}
                min={0}
                max={500}
                step={0.5}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Giới thiệu bản thân</label>
              <textarea
                className="form-input form-textarea"
                value={buddy.bio || ''}
                onChange={(e) => updateField('bio', e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="Kể về bản thân và điều bạn có thể chia sẻ..."
              />
              <p className="form-hint">{(buddy.bio?.length || 0)}/500</p>
            </div>

            <div className="form-group">
              <label className="form-label">Trạng thái</label>
              <select
                className="form-input form-select"
                value={buddy.is_available ? 'true' : 'false'}
                onChange={(e) => updateField('is_available', e.target.value === 'true')}
              >
                <option value="true">🟢 Sẵn sàng nhận khách</option>
                <option value="false">⚪ Tạm ẩn</option>
              </select>
            </div>

            <div className="flex gap-md mt-lg">
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
              {saved && <span className="flex items-center text-success">✓ Đã lưu</span>}
            </div>
          </div>
        </div>

        <aside>
          <div className="card">
            <div className="card-body text-center">
              <div className="avatar avatar-2xl mx-auto">
                {buddy.profile.full_name.charAt(0)}
              </div>
              <h3 className="mt-md">{buddy.profile.full_name}</h3>
              <p className="text-sm text-muted">{buddy.location_city}</p>
              <p className="mt-md">
                <span className="badge badge-success">{buddy.is_available ? 'Đang hoạt động' : 'Offline'}</span>
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
