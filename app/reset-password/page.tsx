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
        setError('This reset link is invalid or has expired. Please request a new one.')
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
      setError('Password must be at least 8 characters and include letters and numbers.')
      return
    }
    if (!passwordsMatch) {
      setError('The confirmation password does not match.')
      return
    }

    setLoading(true)
    const { error: updateError } = await updatePassword(password)
    setLoading(false)

    if (updateError) {
      setError(updateError.message || 'Could not reset your password. Please try again.')
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
            <h1 className="text-2xl mt-sm">Reset your password</h1>
            <p className="text-muted text-sm mt-xs">Choose a new password for your account.</p>
          </div>

          {error ? (
            <div className="alert alert-error mb-md">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="password">New password</label>
              <input
                id="password"
                type="password"
                className="form-input"
                placeholder="At least 8 characters with letters and numbers"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                required
              />
              {password && !passwordValid && (
                <p className="text-xs text-danger mt-xs">
                  Password must be at least 8 characters and include both letters and numbers.
                </p>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm">Confirm password</label>
              <input
                id="confirm"
                type="password"
                className="form-input"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                maxLength={128}
                required
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-xs text-danger mt-xs">The confirmation password does not match.</p>
              )}
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={!canSubmit}>
              {loading ? 'Saving...' : 'Reset password'}
            </button>
          </form>

          <div className="text-center mt-lg">
            <Link href="/login" className="text-sm text-muted">← Back to sign in</Link>
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
