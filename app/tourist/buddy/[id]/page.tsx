'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'

interface BuddyData {
  id: string
  location_city: string
  languages: string[]
  specialties: string[]
  hourly_rate: number
  rating_avg: number
  trips_completed: number
  bio: string | null
  is_available: boolean
  profile: {
    full_name: string
    avatar_url: string | null
  }
}

export default function BuddyProfilePage() {
  const params = useParams()
  const buddyId = params?.id as string
  const [buddy, setBuddy] = useState<BuddyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [existingConnection, setExistingConnection] = useState<{ status: string } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('buddies')
        .select('*, profile:profiles(*)')
        .eq('id', buddyId)
        .single<BuddyData>()

      setBuddy(data)

      // Check existing connection
      const { data: conn } = await supabase
        .from('connections')
        .select('status')
        .eq('tourist_id', user.id)
        .eq('buddy_id', buddyId)
        .single()

      setExistingConnection(conn)
      setLoading(false)
    }
    if (buddyId) load()
  }, [buddyId])

  async function handleConnect() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    setSending(true)
    const { error } = await supabase.from('connections').insert({
      tourist_id: user.id,
      buddy_id: buddyId,
      message: message || null,
    })

    if (!error) {
      setSent(true)
      setExistingConnection({ status: 'pending' })
      // Also create conversation thread
      await supabase.from('conversations').insert({
        tourist_id: user.id,
        buddy_id: buddyId,
      })
    }
    setSending(false)
  }

  if (loading) {
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }
  if (!buddy) {
    return <div className="container py-xl text-center"><p>Buddy không tồn tại</p></div>
  }

  return (
    <div>
      {/* Header */}
      <section style={{ background: 'linear-gradient(135deg, var(--primary-alpha), var(--bg-white))', paddingBlock: 'var(--space-3xl)' }}>
        <div className="container">
          <div className="flex items-center gap-lg flex-wrap">
            <div className="avatar avatar-2xl relative">
              {buddy.profile.avatar_url ? <img src={buddy.profile.avatar_url} alt={buddy.profile.full_name} /> : buddy.profile.full_name.charAt(0)}
              {buddy.is_available && <div className="avatar-online" />}
            </div>
            <div className="flex-1" style={{ minWidth: 280 }}>
              <h1 className="text-3xl">{buddy.profile.full_name}</h1>
              <p className="text-muted mt-sm">📍 {buddy.location_city}</p>
              <div className="rating mt-sm">
                {'★'.repeat(Math.round(buddy.rating_avg))}
                <span className="rating-text">{buddy.rating_avg.toFixed(1)} • {buddy.trips_completed} chuyến</span>
              </div>
            </div>
            <div>
              <p className="text-3xl font-bold" style={{ color: 'var(--primary)' }}>${buddy.hourly_rate}</p>
              <p className="text-sm text-muted">/giờ</p>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-xl">
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
          {/* Main */}
          <div>
            <div className="card mb-lg">
              <div className="card-header">
                <h3>Giới thiệu</h3>
              </div>
              <div className="card-body">
                <p className="text-secondary">{buddy.bio || 'Buddy chưa có phần giới thiệu.'}</p>
              </div>
            </div>

            <div className="card mb-lg">
              <div className="card-header">
                <h3>Chuyên môn</h3>
              </div>
              <div className="card-body flex flex-wrap gap-sm">
                {buddy.specialties.length > 0 ? buddy.specialties.map(s => (
                  <span key={s} className="tag tag-selected">✓ {s}</span>
                )) : <span className="text-muted">Chưa cập nhật</span>}
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h3>Ngôn ngữ</h3>
              </div>
              <div className="card-body flex flex-wrap gap-sm">
                {buddy.languages.map(l => <span key={l} className="lang-chip">{l}</span>)}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <aside>
            <div className="card" style={{ position: 'sticky', top: 90 }}>
              <div className="card-body">
                {existingConnection?.status === 'accepted' && (
                  <div className="alert alert-success mb-md">
                    <span>✓</span><span>Bạn đã kết nối với buddy này</span>
                  </div>
                )}
                {existingConnection?.status === 'pending' && (
                  <div className="alert alert-info mb-md">
                    <span>⏳</span><span>Yêu cầu của bạn đang chờ buddy duyệt</span>
                  </div>
                )}
                {existingConnection?.status === 'declined' && (
                  <div className="alert alert-error mb-md">
                    <span>✕</span><span>Buddy đã từ chối</span>
                  </div>
                )}

                {!existingConnection && !sent && (
                  <>
                    <h3 className="mb-md">Kết nối với {buddy.profile.full_name.split(' ')[0]}</h3>
                    <textarea
                      className="form-input form-textarea"
                      placeholder="Lời nhắn cho buddy (tùy chọn)"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={3}
                      maxLength={500}
                      style={{ marginBottom: 12 }}
                    />
                    <button
                      className="btn btn-primary btn-block"
                      onClick={handleConnect}
                      disabled={sending}
                    >
                      {sending ? 'Đang gửi...' : '💬 Gửi yêu cầu kết nối'}
                    </button>
                  </>
                )}

                {sent && (
                  <div className="alert alert-success">
                    <span>✓</span>
                    <span>Đã gửi yêu cầu! Buddy sẽ phản hồi sớm.</span>
                  </div>
                )}

                {existingConnection && (
                  <Link href={`/chat`} className="btn btn-outline btn-block mt-md">
                    💬 Mở cuộc trò chuyện
                  </Link>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
