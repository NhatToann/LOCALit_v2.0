'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signUp, createClient } from '@/utils/supabase/auth'

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
  { id: 'solo', label: 'Solo' },
  { id: 'couple', label: 'Couple' },
  { id: 'friends', label: 'With Friends' },
  { id: 'family', label: 'Family' },
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
      // 1. Sign up
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

      // 2. Create profile details (tourist or buddy)
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

      // 3. Redirect to dashboard
      const dashboardPath = formData.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'
      router.push(dashboardPath)
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

  return (
    <main className="min-h-screen" style={{ background: 'var(--bg-light)' }}>
      <div className="container" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="text-center mb-lg">
          <Link href="/" className="text-2xl font-bold">
            <span style={{ color: 'var(--primary)' }}>LOCAL</span>it
          </Link>
        </div>

        <div className="card mx-auto" style={{ maxWidth: 560 }}>
          <div className="card-body">
            <h2 className="text-center mb-sm">Đăng ký</h2>
            <p className="text-center text-sm text-muted mb-lg">
              Bước {step} / 2: {step === 1 ? 'Tài khoản' : 'Thông tin bổ sung'}
            </p>

            {/* Progress */}
            <div className="progress-steps">
              <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
                <div className="step-circle">1</div>
              </div>
              <div className={`progress-line ${step >= 2 ? 'active' : ''}`} />
              <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
                <div className="step-circle">2</div>
              </div>
            </div>

            {/* Step 1: Account */}
            {step === 1 && (
              <>
                <div className="form-group">
                  <label className="form-label">Bạn là</label>
                  <div className="grid grid-2">
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
                  <label className="form-label" htmlFor="fullName">Họ tên</label>
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
                  <label className="form-label" htmlFor="email">Email</label>
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
                    <p className="form-hint error">Email không hợp lệ</p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="phone">Số điện thoại</label>
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
                  <label className="form-label" htmlFor="password">Mật khẩu</label>
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
                  <label className="form-label" htmlFor="confirmPassword">Xác nhận mật khẩu</label>
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
                    <p className="form-hint error">Mật khẩu không khớp</p>
                  )}
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-block mt-lg"
                  disabled={!stepOneReady}
                  onClick={() => setStep(2)}
                >
                  Tiếp tục →
                </button>
              </>
            )}

            {/* Step 2: Profile info */}
            {step === 2 && (
              <>
                {formData.role === 'tourist' ? (
                  <>
                    <div className="form-group">
                      <label className="form-label">Bạn đi đâu?</label>
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
                      <label className="form-label">Ngày đến (dự kiến)</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.arrivalDate}
                        onChange={(e) => setFormData(p => ({ ...p, arrivalDate: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Phong cách du lịch</label>
                      <div className="grid grid-2">
                        {TRAVEL_STYLES.map(style => (
                          <button
                            key={style.id}
                            type="button"
                            className={`btn ${formData.travelStyle === style.id ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => setFormData(p => ({ ...p, travelStyle: style.id }))}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Sở thích</label>
                      <div className="grid grid-4" style={{ gap: '8px' }}>
                        {INTERESTS.map(i => (
                          <button
                            key={i.id}
                            type="button"
                            className={`btn btn-sm ${formData.interests.includes(i.id) ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => toggleInterest(i.id)}
                          >
                            {i.emoji} {i.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ngôn ngữ</label>
                      <div className="flex flex-wrap gap-sm">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang}
                            type="button"
                            className={`btn btn-sm ${formData.languages.includes(lang) ? 'btn-primary' : 'btn-outline'}`}
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
                      <label className="form-label">Thành phố của bạn</label>
                      <input
                        type="text"
                        className="form-input"
                        value={formData.locationCity}
                        onChange={(e) => setFormData(p => ({ ...p, locationCity: e.target.value }))}
                        maxLength={50}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Chuyên môn</label>
                      <div className="grid grid-4" style={{ gap: '8px' }}>
                        {INTERESTS.map(i => (
                          <button
                            key={i.id}
                            type="button"
                            className={`btn btn-sm ${formData.interests.includes(i.id) ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => toggleInterest(i.id)}
                          >
                            {i.emoji} {i.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Ngôn ngữ bạn nói</label>
                      <div className="flex flex-wrap gap-sm">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang}
                            type="button"
                            className={`btn btn-sm ${formData.languages.includes(lang) ? 'btn-primary' : 'btn-outline'}`}
                            onClick={() => toggleLanguage(lang)}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Giới thiệu bản thân (tối thiểu 10 ký tự)</label>
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
                  <div className="alert alert-error mb-md">
                    <span>⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex gap-md mt-lg">
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setStep(1)}
                    disabled={loading}
                  >
                    ← Quay lại
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    disabled={!stepTwoReady || loading}
                    onClick={handleSubmit}
                  >
                    {loading ? 'Đang tạo tài khoản...' : 'Hoàn tất đăng ký'}
                  </button>
                </div>
              </>
            )}

            <p className="text-center text-sm text-muted mt-lg">
              Đã có tài khoản? <Link href="/login" className="text-primary">Đăng nhập</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
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
