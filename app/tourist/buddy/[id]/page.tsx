'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { ConnectionStatus } from '@/lib/types'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

interface BuddyData {
  id: string
  full_name: string
  bio: string | null
  avatar_url: string | null
  phone: string | null
  is_online: boolean
  location_city: string
  latitude: number
  longitude: number
  languages: string[]
  specialties: string[]
  hourly_rate: number | null
  rating_avg: number | null
  trips_completed: number
}

interface Review {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer_name: string | null
}

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 }

export default function BuddyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [buddy, setBuddy] = useState<BuddyData | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])
  const [connection, setConnection] = useState<{ status: ConnectionStatus; id: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const me = await getCurrentUser()

      const { data: b } = await supabase
        .from('buddies')
        .select('*, profile:profiles(full_name, bio, avatar_url, phone, is_online)')
        .eq('id', id)
        .single()

      if (cancelled) return
      if (!b) {
        setError('Không tìm thấy buddy.')
        setLoading(false)
        return
      }
      setBuddy({
        id: b.id,
        full_name: (b.profile as any)?.full_name ?? 'Buddy',
        bio: (b.profile as any)?.bio ?? null,
        avatar_url: (b.profile as any)?.avatar_url ?? null,
        phone: (b.profile as any)?.phone ?? null,
        is_online: (b.profile as any)?.is_online ?? false,
        location_city: b.location_city,
        latitude: b.latitude ?? DEFAULT_LOCATION.lat,
        longitude: b.longitude ?? DEFAULT_LOCATION.lng,
        languages: b.languages ?? [],
        specialties: b.specialties ?? [],
        hourly_rate: b.hourly_rate ?? null,
        rating_avg: b.rating_avg ?? null,
        trips_completed: b.trips_completed ?? 0,
      })

      const [{ data: r }, { data: c }] = await Promise.all([
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at, reviewer:profiles!reviewer_id(full_name)')
          .eq('reviewee_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
        me
          ? supabase
              .from('connections')
              .select('id, status')
              .eq('buddy_id', id)
              .eq('tourist_id', me.id)
              .maybeSingle()
          : Promise.resolve({ data: null } as any),
      ])

      if (cancelled) return
      setReviews(
        (r ?? []).map((row: any) => ({
          id: row.id,
          rating: row.rating,
          comment: row.comment,
          created_at: row.created_at,
          reviewer_name: row.reviewer?.full_name ?? null,
        })),
      )
      if (c) setConnection({ id: c.id, status: c.status as ConnectionStatus })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [id])

  async function sendRequest() {
    if (!buddy) return
    const me = await getCurrentUser()
    if (!me) {
      router.push('/login')
      return
    }
    setActionLoading(true)
    setError('')
    const supabase = createClient()
    const { data, error: insertErr } = await supabase
      .from('connections')
      .insert({
        tourist_id: me.id,
        buddy_id: buddy.id,
        message: message.trim() || null,
        status: 'pending',
      })
      .select('id, status')
      .single()
    setActionLoading(false)
    if (insertErr) {
      if (insertErr.code === '23505') {
        setError('Bạn đã gửi yêu cầu cho buddy này rồi.')
      } else {
        setError('Không thể gửi yêu cầu: ' + insertErr.message)
      }
      return
    }
    if (data) setConnection({ id: data.id, status: data.status as ConnectionStatus })
  }

  async function openChat() {
    if (!buddy) return
    const me = await getCurrentUser()
    if (!me) {
      router.push('/login')
      return
    }
    const supabase = createClient()
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('tourist_id', me.id)
      .eq('buddy_id', buddy.id)
      .maybeSingle()

    if (existing) {
      router.push(`/chat/${existing.id}`)
      return
    }
    const { data: created, error: createErr } = await supabase
      .from('conversations')
      .insert({ tourist_id: me.id, buddy_id: buddy.id })
      .select('id')
      .single()
    if (createErr) {
      setError('Không thể mở cuộc trò chuyện: ' + createErr.message)
      return
    }
    router.push(`/chat/${created.id}`)
  }

  if (loading) {
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }
  if (error && !buddy) {
    return (
      <div className="container py-xl">
        <div className="alert alert-error"><span>⚠️</span><span>{error}</span></div>
        <Link href="/tourist/browse" className="btn btn-primary mt-md">← Quay lại danh sách</Link>
      </div>
    )
  }
  if (!buddy) return null

  return (
    <div className="container py-xl">
      <Link href="/tourist/browse" className="text-sm text-muted">← Quay lại danh sách</Link>

      <div className="buddy-profile-grid mt-md">
        <main>
          {/* Hero card */}
          <div className="card">
            <div className="card-body">
              <div style={{ display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <span className="avatar avatar-2xl">{buddy.full_name.charAt(0)}</span>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h1 style={{ fontSize: 'var(--font-size-2xl)', marginBottom: 0 }}>{buddy.full_name}</h1>
                    {buddy.is_online && <span className="badge badge-success">● Online</span>}
                  </div>
                  <p className="text-muted mt-xs">📍 {buddy.location_city}</p>
                  <div className="buddy-rating mt-sm">
                    <span style={{ fontWeight: 600, color: 'var(--accent)' }}>
                      ⭐ {buddy.rating_avg ? buddy.rating_avg.toFixed(1) : '—'}
                    </span>
                    <span className="text-sm text-muted ml-sm">
                      ({reviews.length} đánh giá · {buddy.trips_completed} chuyến)
                    </span>
                  </div>
                  {buddy.bio && <p className="mt-md">{buddy.bio}</p>}
                </div>
              </div>

              <hr style={{ margin: 'var(--space-lg) 0' }} />

              {/* Tags */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-md)' }}>
                <div>
                  <span className="detail-label">Ngôn ngữ</span>
                  <div className="lang-list">
                    {buddy.languages.length === 0
                      ? <span className="text-muted text-sm">Chưa cập nhật</span>
                      : buddy.languages.map((l) => <span key={l} className="lang-chip">{l}</span>)}
                  </div>
                </div>
                <div>
                  <span className="detail-label">Chuyên môn</span>
                  <div className="lang-list">
                    {buddy.specialties.length === 0
                      ? <span className="text-muted text-sm">Chưa cập nhật</span>
                      : buddy.specialties.map((s) => <span key={s} className="lang-chip">{s}</span>)}
                  </div>
                </div>
                <div>
                  <span className="detail-label">Phí</span>
                  <strong>
                    {buddy.hourly_rate && buddy.hourly_rate > 0
                      ? `$${Number(buddy.hourly_rate).toFixed(0)}/giờ`
                      : 'Thỏa thuận'}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {/* Reviews */}
          <div className="card mt-lg">
            <div className="card-header">
              <h3>Đánh giá ({reviews.length})</h3>
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
                        <span className="avatar avatar-sm">{r.reviewer_name?.charAt(0) ?? '?'}</span>
                        <strong>{r.reviewer_name ?? 'Người dùng'}</strong>
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
          {/* Action card */}
          <div className="card">
            <div className="card-body">
              <h3 className="mb-md">Bắt đầu trò chuyện</h3>

              {!connection && (
                <>
                  <div className="form-group">
                    <label className="form-label" htmlFor="msg">Lời nhắn (tùy chọn)</label>
                    <textarea
                      id="msg"
                      className="form-input form-textarea"
                      rows={3}
                      placeholder="Xin chào! Mình muốn tìm hiểu thêm về bạn..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, 280))}
                      maxLength={280}
                    />
                    <p className="text-xs text-muted mt-xs">{message.length}/280</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={sendRequest}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Đang gửi...' : '🤝 Gửi yêu cầu kết nối'}
                  </button>
                </>
              )}

              {connection?.status === 'pending' && (
                <div className="alert alert-info">
                  <span>⏳</span>
                  <div>
                    <p className="font-semibold">Đã gửi yêu cầu</p>
                    <p className="text-sm">Buddy sẽ phản hồi sớm nhất có thể.</p>
                  </div>
                </div>
              )}

              {connection?.status === 'declined' && (
                <div className="alert alert-error">
                  <span>✕</span>
                  <span>Buddy đã từ chối yêu cầu của bạn.</span>
                </div>
              )}

              {connection?.status === 'accepted' && (
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={openChat}
                >
                  💬 Mở cuộc trò chuyện
                </button>
              )}

              {error && (
                <div className="alert alert-error mt-md"><span>⚠️</span><span>{error}</span></div>
              )}
            </div>
          </div>

          {/* Map */}
          <div className="card mt-lg" style={{ overflow: 'hidden' }}>
            <div className="card-header">
              <h3 className="text-base">Vị trí</h3>
            </div>
            <MapView
              userLocation={{ lat: buddy.latitude, lng: buddy.longitude }}
              height={260}
              showSelfMarker={false}
            />
          </div>

          {buddy.phone && (
            <div className="card mt-lg">
              <div className="card-body text-sm">
                <span className="detail-label">Liên hệ</span>
                <p>📞 {buddy.phone}</p>
              </div>
            </div>
          )}
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
        .buddy-rating { display: flex; align-items: center; gap: 6px; }
        .ml-sm { margin-left: 8px; }
        .lang-list { display: flex; flex-wrap: wrap; gap: 4px; }
      `}</style>
    </div>
  )
}
