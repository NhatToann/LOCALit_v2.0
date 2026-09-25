'use client'

import { useState, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { updatePassword, getCurrentUser } from '@/utils/supabase/auth'
import { createClient } from '@/utils/supabase/auth'

function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    async function check() {
      const user = await getCurrentUser()
      if (!user) {
        setError('Liên kết đặt lại không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu lại.')
      }
      setChecking(false)
    }
    check()
  }, [])

  const passwordsMatch = password === confirmPassword
  const passwordValid = password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
  const canSubmit = passwordsMatch && passwordValid && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!passwordValid) {
      setError('Mật khẩu phải có ít nhất 8 ký tự, gồm chữ và số.')
      return
    }
    if (!passwordsMatch) {
      setError('Mật khẩu xác nhận không khớp.')
      return
    }

    setLoading(true)
    const { error: updateError } = await updatePassword(password)
    setLoading(false)

    if (updateError) {
      setError(updateError.message || 'Đặt lại mật khẩu thất bại. Vui lòng thử lại.')
      return
    }

    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', (await getCurrentUser())?.id)
      .single()

    const dest = profile?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'
    router.push(dest)
  }

  if (checking) {
    return (
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    )
  }

  return (
    <main className="min-h-screen flex-center" style={{ background: 'var(--bg-light)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body">
          <div className="text-center mb-lg">
            <div style={{ fontSize: 40 }}>🔒</div>
            <h1 className="text-2xl mt-sm">Đặt lại mật khẩu</h1>
            <p className="text-muted text-sm mt-xs">Nhập mật khẩu mới cho tài khoản của bạn.</p>
          </div>

          {error ? (
            <div className="alert alert-error mb-md">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="password">Mật khẩu mới</label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="Tối thiểu 8 ký tự, có chữ và số"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
              {password && !passwordValid && (
                <p className="text-xs text-danger mt-xs">
                  Mật khẩu phải có ít nhất 8 ký tự, gồm chữ cái và số.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Xác nhận mật khẩu</label>
              <input
                id="confirm"
                type="password"
                className="form-input"
                placeholder="Nhập lại mật khẩu mới"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                maxLength={128}
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-danger mt-xs">Mật khẩu xác nhận không khớp.</p>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
              {loading ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
            </button>
          </form>

          <div className="text-center mt-lg">
            <Link href="/login" className="text-sm text-muted">← Quay lại đăng nhập</Link>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
