'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signUp, createClient } from '@/utils/supabase/auth'
import '../auth.css'

const INTERESTS = [
  { id: 'food', label: 'Food', emoji: '🍜' },
  { id: 'photography', label: 'Photography', emoji: '📷' },
  { id: 'history', label: 'History', emoji: '🏛️' },
  { id: 'beach', label: 'Beach', emoji: '🏖️' },
  { id: 'nature', label: 'Nature', emoji: '🏔️' },
  { id: 'nightlife', label: 'Nightlife', emoji: '🌃' },
  { id: 'shopping', label: 'Shopping', emoji: '🛍️' },
  { id: 'culture', label: 'Local Culture', emoji: '🎎' },
]

const TRAVEL_STYLES = [
  { id: 'solo', label: 'Solo', desc: 'Một mình khám phá' },
  { id: 'couple', label: 'Couple', desc: 'Cùng người yêu' },
  { id: 'friends', label: 'With Friends', desc: 'Cùng bạn bè' },
  { id: 'family', label: 'Family', desc: 'Cùng gia đình' },
]

const LANGUAGES = ['English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian']

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const roleParam = searchParams.get('role') === 'buddy' ? 'buddy' : 'tourist'

  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    role: roleParam as 'tourist' | 'buddy',
    nationality: '',
    travelStyle: '',
    interests: [] as string[],
    languages: [] as string[],
    destination: 'Da Nang',
    arrivalDate: '',
    budgetRange: '50-100',
    locationCity: 'Da Nang',
    bio: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  function toggleInterest(id: string) {
    setFormData(prev => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter(i => i !== id)
        : [...prev.interests, id]
    }))
  }

  function toggleLanguage(lang: string) {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.includes(lang)
        ? prev.languages.filter(l => l !== lang)
        : [...prev.languages, lang]
    }))
  }

  async function handleSubmit() {
    setError('')
    setLoading(true)

    try {
      const { data, error: signUpError } = await signUp(
        formData.email,
        formData.password,
        formData.fullName,
        formData.role
      )

      if (signUpError || !data.user) {
        setError(signUpError?.message || 'Đăng ký thất bại.')
        setLoading(false)
        return
      }

      const supabase = createClient()
      const profileData = {
        phone: formData.phone || null,
        bio: formData.bio || null,
      }

      if (formData.role === 'tourist') {
        const { error: touristError } = await supabase
          .from('tourists')
          .insert({
            id: data.user.id,
            ...profileData,
            nationality: formData.nationality || null,
            travel_style: formData.travelStyle || null,
            interests: formData.interests,
            languages: formData.languages,
            budget_range: formData.budgetRange,
            arrival_date: formData.arrivalDate || null,
            destination: formData.destination,
          })

        if (touristError) {
          setError('Không thể lưu thông tin tourist: ' + touristError.message)
          setLoading(false)
          return
        }
      } else {
        const { error: buddyError } = await supabase
          .from('buddies')
          .insert({
            id: data.user.id,
            location_city: formData.locationCity,
            languages: formData.languages,
            specialties: formData.interests,
            bio: formData.bio || null,
            hourly_rate: 15.0,
          })

        if (buddyError) {
          setError('Không thể lưu thông tin buddy: ' + buddyError.message)
          setLoading(false)
          return
        }
      }

      // Redirect to login (Supabase requires email confirm or immediate login)
      router.push(`/login?registered=1`)
    } catch (err) {
      setError('Có lỗi xảy ra. Vui lòng thử lại.')
      setLoading(false)
    }
  }

  const stepOneReady =
    formData.fullName.length >= 2 &&
    validateEmail(formData.email) &&
    formData.password.length >= 6 &&
    formData.password === formData.confirmPassword

  const stepTwoReady =
    (formData.role === 'tourist'
      ? (formData.travelStyle && formData.destination && formData.interests.length > 0)
      : (formData.locationCity && formData.bio.length >= 10))

  const brandingTitle = formData.role === 'buddy'
    ? 'Trở thành Local Buddy!'
    : 'Bắt đầu hành trình!'
  const brandingSubtitle = formData.role === 'buddy'
    ? 'Chia sẻ văn hóa Việt Nam của bạn và kết nối với du khách toàn cầu'
    : 'Khám phá Việt Nam cùng local buddy địa phương'

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
              <h1>{brandingTitle}</h1>
              <p>{brandingSubtitle}</p>
            </div>

            <div className="branding-features">
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>{formData.role === 'buddy' ? 'Nhận yêu cầu từ du khách' : 'Tìm buddy phù hợp sở thích'}</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>{formData.role === 'buddy' ? 'Kiếm thu nhập linh hoạt' : 'Chat real-time với buddy'}</span>
              </div>
              <div className="feature-item">
                <div className="feature-icon">✓</div>
                <span>{formData.role === 'buddy' ? 'Đánh giá minh bạch' : 'Đánh giá sau mỗi chuyến đi'}</span>
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
              <h2>Tạo tài khoản</h2>
              <p>Bước {step} / 2: {step === 1 ? 'Tài khoản' : 'Thông tin bổ sung'}</p>
            </div>

            {/* Progress */}
            <div className="auth-progress" style={{ display: 'flex', justifyContent: 'center', marginBottom: 32, gap: 8 }}>
              <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
                <div className="step-circle">1</div>
              </div>
              <div className={`progress-line ${step >= 2 ? 'active' : ''}`} style={{ width: 60, height: 3, background: step >= 2 ? 'var(--primary)' : 'var(--border-color)', marginBottom: 18 }} />
              <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
                <div className="step-circle">2</div>
              </div>
            </div>

            {/* Step 1: Account */}
            {step === 1 && (
              <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (stepOneReady) setStep(2) }}>
                <div className="form-group">
                  <label>Bạn là</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                    <button
                      type="button"
                      className={`btn ${formData.role === 'tourist' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setFormData(p => ({ ...p, role: 'tourist' }))}
                    >
                      🧳 Du khách
                    </button>
                    <button
                      type="button"
                      className={`btn ${formData.role === 'buddy' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setFormData(p => ({ ...p, role: 'buddy' }))}
                    >
                      🌍 Local Buddy
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="fullName">Họ tên</label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-input"
                    placeholder="Nguyễn Văn A"
                    value={formData.fullName}
                    onChange={(e) => setFormData(p => ({ ...p, fullName: e.target.value }))}
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    className={`form-input ${formData.email && !validateEmail(formData.email) ? 'error' : ''}`}
                    placeholder="you@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData(p => ({ ...p, email: e.target.value }))}
                    required
                    autoComplete="email"
                  />
                  {formData.email && !validateEmail(formData.email) && (
                    <p className="form-hint error" style={{ marginTop: 4 }}>Email không hợp lệ</p>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="phone">Số điện thoại</label>
                  <input
                    id="phone"
                    type="tel"
                    className="form-input"
                    placeholder="+84 123 456 789"
                    value={formData.phone}
                    onChange={(e) => setFormData(p => ({ ...p, phone: e.target.value }))}
                    maxLength={20}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Mật khẩu</label>
                  <input
                    id="password"
                    type="password"
                    className="form-input"
                    placeholder="Tối thiểu 6 ký tự"
                    value={formData.password}
                    onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                    required
                    autoComplete="new-password"
                    minLength={6}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="confirmPassword">Xác nhận mật khẩu</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className={`form-input ${formData.confirmPassword && formData.password !== formData.confirmPassword ? 'error' : ''}`}
                    placeholder="Nhập lại mật khẩu"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData(p => ({ ...p, confirmPassword: e.target.value }))}
                    required
                    autoComplete="new-password"
                  />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="form-hint error" style={{ marginTop: 4 }}>Mật khẩu không khớp</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-block"
                  disabled={!stepOneReady}
                >
                  Tiếp tục →
                </button>
              </form>
            )}

            {/* Step 2: Profile info */}
            {step === 2 && (
              <form className="auth-form" onSubmit={(e) => { e.preventDefault(); if (stepTwoReady) handleSubmit() }}>
                {formData.role === 'tourist' ? (
                  <>
                    <div className="form-group">
                      <label>Bạn đi đâu?</label>
                      <select
                        className="form-input form-select"
                        value={formData.destination}
                        onChange={(e) => setFormData(p => ({ ...p, destination: e.target.value }))}
                      >
                        <option value="Da Nang">Da Nang</option>
                        <option value="Hoi An">Hoi An</option>
                        <option value="Hanoi">Hanoi</option>
                        <option value="Ho Chi Minh City">Ho Chi Minh City</option>
                        <option value="Nha Trang">Nha Trang</option>
                        <option value="Sapa">Sapa</option>
                        <option value="Ha Long Bay">Ha Long Bay</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Ngày đến (dự kiến)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.arrivalDate}
                        onChange={(e) => setFormData(p => ({ ...p, arrivalDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="form-group">
                      <label>Phong cách du lịch</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                        {TRAVEL_STYLES.map(style => (
                          <button
                            key={style.id}
                            type="button"
                            className={`style-card ${formData.travelStyle === style.id ? 'selected' : ''}`}
                            onClick={() => setFormData(p => ({ ...p, travelStyle: style.id }))}
                            style={{
                              padding: 'var(--space-md)',
                              background: 'var(--bg-white)',
                              border: `2px solid ${formData.travelStyle === style.id ? 'var(--primary)' : 'var(--border-color)'}`,
                              borderRadius: 12,
                              cursor: 'pointer',
                              textAlign: 'center',
                            }}
                          >
                            <strong style={{ display: 'block', fontSize: 'var(--font-size-sm)' }}>{style.label}</strong>
                            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{style.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Sở thích (chọn nhiều)</label>
                      <div className="interests-grid">
                        {INTERESTS.map(i => (
                          <button
                            key={i.id}
                            type="button"
                            className={`interest-card ${formData.interests.includes(i.id) ? 'selected' : ''}`}
                            onClick={() => toggleInterest(i.id)}
                          >
                            <span className="interest-icon">{i.emoji}</span>
                            <span className="interest-label">{i.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Ngôn ngữ bạn nói</label>
                      <div className="languages-grid">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang}
                            type="button"
                            className={`language-btn ${formData.languages.includes(lang) ? 'selected' : ''}`}
                            onClick={() => toggleLanguage(lang)}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Thành phố của bạn</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.locationCity}
                        onChange={(e) => setFormData(p => ({ ...p, locationCity: e.target.value }))}
                        maxLength={50}
                      />
                    </div>

                    <div className="form-group">
                      <label>Chuyên môn</label>
                      <div className="interests-grid">
                        {INTERESTS.map(i => (
                          <button
                            key={i.id}
                            type="button"
                            className={`interest-card ${formData.interests.includes(i.id) ? 'selected' : ''}`}
                            onClick={() => toggleInterest(i.id)}
                          >
                            <span className="interest-icon">{i.emoji}</span>
                            <span className="interest-label">{i.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Ngôn ngữ bạn nói</label>
                      <div className="languages-grid">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang}
                            type="button"
                            className={`language-btn ${formData.languages.includes(lang) ? 'selected' : ''}`}
                            onClick={() => toggleLanguage(lang)}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Giới thiệu bản thân (tối thiểu 10 ký tự)</label>
                      <textarea
                        className="form-input form-textarea"
                        value={formData.bio}
                        onChange={(e) => setFormData(p => ({ ...p, bio: e.target.value }))}
                        maxLength={500}
                        rows={4}
                        placeholder="Kể về bản thân và điều bạn có thể chia sẻ..."
                      />
                      <p className="form-hint">{formData.bio.length}/500</p>
                    </div>
                  </>
                )}

                {error && (
                  <div className="alert alert-error">
                    <span>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="form-actions">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setStep(1)}
                    disabled={loading}
                  >
                    ← Quay lại
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!stepTwoReady || loading}
                  >
                    {loading ? 'Đang tạo...' : 'Hoàn tất đăng ký'}
                  </button>
                </div>
              </form>
            )}

            <div className="auth-footer">
              Đã có tài khoản? <Link href="/login">Đăng nhập</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex-center">
        <div className="loading-spinner" />
      </main>
    }>
      <RegisterForm />
    </Suspense>
  )
}
