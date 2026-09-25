'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { resetPassword } from '@/utils/supabase/auth'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailValid = EMAIL_REGEX.test(email.trim())

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!emailValid) {
      setError('Vui lòng nhập email hợp lệ.')
      return
    }

    setLoading(true)
    const { error: resetError } = await resetPassword(email.trim())
    setLoading(false)

    if (resetError) {
      setError('Không thể gửi email. Vui lòng thử lại sau.')
      return
    }
    setSent(true)
  }

  return (
    <main className="min-h-screen flex-center" style={{ background: 'var(--bg-light)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body">
          <Link href="/login" className="text-primary text-sm">← Quay lại đăng nhập</Link>
          <div className="text-center mt-md mb-lg">
            <div style={{ fontSize: 40 }}>🔑</div>
            <h1 className="text-2xl mt-sm">Quên mật khẩu?</h1>
            <p className="text-muted text-sm mt-xs">
              Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu.
            </p>
          </div>

          {sent ? (
            <div className="alert alert-success">
              <span>✓</span>
              <div>
                <p className="font-semibold">Đã gửi email đặt lại!</p>
                <p className="text-sm mt-xs">
                  Kiểm tra hộp thư <strong>{email}</strong> và làm theo hướng dẫn.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
                {email && !emailValid && (
                  <p className="text-xs text-danger mt-xs">Định dạng email chưa đúng.</p>
                )}
              </div>

              {error && (
                <div className="alert alert-error mb-md">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading || !emailValid}
              >
                {loading ? 'Đang gửi...' : 'Gửi link đặt lại'}
              </button>
            </form>
          )}

          <div className="text-center mt-lg">
            <Link href="/login" className="text-sm text-muted">Quay lại đăng nhập</Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    }>
      <ForgotPasswordForm />
    </Suspense>
  )
}
