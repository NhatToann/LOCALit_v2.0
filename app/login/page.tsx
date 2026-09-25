'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/utils/supabase/auth'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    // Validation
    if (!email.includes('@') || !email.includes('.')) {
      setError('Vui lòng nhập email hợp lệ.')
      return
    }
    if (password.length < 6) {
      setError('Mật khẩu phải có ít nhất 6 ký tự.')
      return
    }

    setLoading(true)

    const { data, error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(signInError.message === 'Invalid login credentials'
        ? 'Email hoặc mật khẩu không đúng.'
        : 'Đăng nhập thất bại. Vui lòng thử lại.')
      setLoading(false)
      return
    }

    // Get role and redirect
    if (data.user) {
      const { createClient } = await import('@/utils/supabase/auth')
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      const defaultPath = profile?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'
      router.push(redirectTo || defaultPath)
    }
  }

  return (
    <main className="min-h-screen flex-center" style={{ background: 'var(--bg-light)' }}>
      <div className="card" style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-body">
          <div className="text-center mb-lg">
            <Link href="/" className="text-2xl font-bold">
              <span style={{ color: 'var(--primary)' }}>LOCAL</span>it
            </Link>
            <h1 className="mt-md">Đăng nhập</h1>
            <p className="text-sm text-muted">Chào mừng quay lại!</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className={`form-input ${error && !email.includes('@') ? 'error' : ''}`}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="password">Mật khẩu</label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="Nhập mật khẩu"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <div className="alert alert-error mb-md">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={loading || !email || !password}
            >
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>

            <div className="text-center mt-md">
              <Link href="/forgot-password" className="text-sm text-primary">
                Quên mật khẩu?
              </Link>
            </div>
          </form>

          <div className="divider mt-lg mb-md">
            <span>hoặc</span>
          </div>

          <div className="text-center">
            <p className="text-sm text-muted">
              Chưa có tài khoản? <Link href="/register" className="text-primary font-medium">Đăng ký</Link>
            </p>
          </div>

          <div className="mt-lg" style={{ padding: 12, background: 'var(--info-light)', borderRadius: 8 }}>
            <p className="text-xs text-secondary" style={{ textAlign: 'center' }}>
              💡 <strong>Demo accounts:</strong><br />
              lan.pham@localit.dev / password123 (buddy)<br />
              john.doe@example.com / password123 (tourist)
            </p>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    }>
      <LoginForm />
    </Suspense>
  )
}
