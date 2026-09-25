'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Demo placeholder — would call supabase.auth.resetPasswordForEmail(email)
    setSent(true)
  }

  return (
    <main className="min-h-screen flex-center" style={{ background: 'var(--bg-light)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body">
          <Link href="/login" className="text-primary text-sm">← Quay lại đăng nhập</Link>
          <h1 className="text-2xl mt-md">Quên mật khẩu?</h1>
          <p className="text-muted mb-lg">Nhập email của bạn để nhận link đặt lại mật khẩu.</p>

          {sent ? (
            <div className="alert alert-success">
              <span>✓</span>
              <span>Email đặt lại mật khẩu đã được gửi (demo).</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={!email}>
                Gửi link đặt lại
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
