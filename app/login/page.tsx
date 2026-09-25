'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signIn } from '@/utils/supabase/auth'
import '../auth.css'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo')
  const registered = searchParams.get('registered') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailLooksValid = email.includes('@') && email.includes('.')
  const canSignIn = emailLooksValid && password.length >= 6

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!emailLooksValid) {
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

    if (data.user) {
      const { createClient } = await import('@/utils/supabase/auth')
      const supabase = createClient()
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      const defaultPath = profile?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'
      router.push(redirectTo || defaultPath)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        {/* Left Side - Branding */}
        <div className="auth-branding">
          <div className="branding-content">
            <Link href="/" className="auth-logo">
              <span className="auth-logo-icon">L</span>
              <span>LOCALit</span>
            </Link>

            <div className="branding-text">
              <h1>Chào mừng trở lại!</h1>
              <p>Tiếp tục hành trình và kết nối với những local buddy tuyệt vời tại Việt Nam</p>
            </div>

            <div className="branding-features">
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Gợi ý buddy thông minh theo sở thích của bạn</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Vị trí real-time của các buddy gần bạn</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>Lên kế hoạch và cộng tác lịch trình cùng nhau</span>
              </div>
            </div>

            <div className="branding-image">
              <img
                src="https://images.unsplash.com/photo-1528127269322-539801943592?w=900&h=400&fit=crop"
                alt="Travel Vietnam"
              />
            </div>
          </div>
        </div>

        {/* Right Side - Form */}
        <div className="auth-form-section">
          <div className="auth-form-container">
            <div className="auth-header">
              <h2>Đăng nhập</h2>
              <p>Chào mừng quay lại! Vui lòng nhập thông tin của bạn.</p>
            </div>

            {registered && (
              <div className="login-info">
                <div className="success-checkmark">✓</div>
                <p style={{ color: '#166534', fontWeight: 600 }}>Đăng ký thành công!</p>
                <p style={{ color: '#166534', fontSize: 13, marginTop: 4 }}>
                  Vui lòng đăng nhập với tài khoản vừa tạo
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                {email && !emailLooksValid && (
                  <p className="form-hint error" style={{ marginTop: 4 }}>
                    Vui lòng nhập email hợp lệ.
                  </p>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="password">Mật khẩu</label>
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
                {password && password.length < 6 && (
                  <p className="form-hint error" style={{ marginTop: 4 }}>
                    Mật khẩu phải có ít nhất 6 ký tự.
                  </p>
                )}
              </div>

              <div className="form-row-flex">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Ghi nhớ đăng nhập</span>
                </label>
                <Link href="/forgot-password" className="link-primary">
                  Quên mật khẩu?
                </Link>
              </div>

              {error && (
                <div className="alert alert-error">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {!canSignIn && !error && (
                <p className="form-hint" style={{ textAlign: 'center', marginBottom: 16 }}>
                  Nhập email và mật khẩu để tiếp tục.
                </p>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={!canSignIn || loading}
              >
                {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
            </form>

            <div className="auth-divider">
              <span>hoặc tiếp tục với</span>
            </div>

            <div className="social-buttons">
              <button
                type="button"
                className="social-btn"
                onClick={() => alert('Đăng nhập Google là demo placeholder. Vui lòng dùng email.')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button
                type="button"
                className="social-btn"
                onClick={() => alert('Đăng nhập GitHub là demo placeholder. Vui lòng dùng email.')}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub
              </button>
            </div>

            <div className="auth-footer">
              Chưa có tài khoản? <Link href="/register">Đăng ký ngay</Link>
            </div>

            <div className="demo-accounts">
              <strong>💡 Tài khoản demo:</strong>
              <br />
              lan.pham.buddy@gmail.com / password123 (buddy)
              <br />
              john.doe.tourist@gmail.com / password123 (tourist)
            </div>
          </div>
        </div>
      </div>
    </div>
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
