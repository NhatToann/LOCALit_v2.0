'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'

export default function HomePage() {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function checkUser() {
      const user = await getCurrentUser()
      if (user) {
        // Redirect to dashboard based on role
        const supabase = createClient()
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'buddy') {
          window.location.href = '/buddy/dashboard'
        } else if (profile?.role === 'tourist') {
          window.location.href = '/tourist/dashboard'
        }
        setLoading(false)
      } else {
        setLoading(false)
      }
    }
    checkUser()
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    )
  }

  return (
    <main className="min-h-screen" style={{ background: 'linear-gradient(135deg, #FFE4DB, #FFD1B5)' }}>
      {/* Hero Section */}
      <section className="container" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div className="text-center">
          <h1 className="text-5xl font-bold mb-md">
            <span style={{ color: 'var(--primary)' }}>LOCAL</span>it
          </h1>
          <p className="text-xl text-secondary mb-lg" style={{ maxWidth: 600, margin: '0 auto 24px' }}>
            Kết nối du khách với những người bạn địa phương chân chính.
            Trải nghiệm Việt Nam theo cách đích thực nhất.
          </p>

          <div className="flex-center gap-md mb-xl" style={{ flexWrap: 'wrap' }}>
            <Link href="/register?role=tourist" className="btn btn-primary btn-lg">
              🧳 Tôi là du khách
            </Link>
            <Link href="/register?role=buddy" className="btn btn-outline btn-lg">
              🌍 Tôi là local buddy
            </Link>
          </div>

          <Link href="/login" className="text-primary font-medium">
            Đã có tài khoản? Đăng nhập →
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container py-xl">
        <div className="grid grid-3">
          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: 48, marginBottom: 16 }}>📍</div>
              <h3 className="mb-sm">Tìm Buddy gần bạn</h3>
              <p className="text-sm text-muted">
                Xem các local buddy hiện đang ở gần vị trí của bạn trên bản đồ thời gian thực.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
              <h3 className="mb-sm">Trò chuyện ngay</h3>
              <p className="text-sm text-muted">
                Nhắn tin với buddy trước chuyến đi. Lên kế hoạch lịch trình cùng nhau.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-body text-center">
              <div style={{ fontSize: 48, marginBottom: 16 }}>⭐</div>
              <h3 className="mb-sm">Đánh giá sau chuyến đi</h3>
              <p className="text-sm text-muted">
                Chia sẻ trải nghiệm để giúp cộng đồng ngày càng tốt hơn.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
