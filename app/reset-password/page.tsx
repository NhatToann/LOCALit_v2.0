'use client'

import { useState, Suspense, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Lock, AlertTriangle, ArrowLeft } from 'lucide-react'
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
  const passwordValid =
    password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password)
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
      <main className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </main>
    )
  }

  return (
    <main className="container-page py-12 max-w-md">
      <Link
        href="/login"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back to sign in
      </Link>

      <header className="text-center mb-6">
        <span
          className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-paper text-primary mb-3"
          aria-hidden="true"
        >
          <Lock size={24} />
        </span>
        <h1 className="text-page-title">Reset your password</h1>
        <p className="text-sm text-muted mt-2">Choose a new password for your account.</p>
      </header>

      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="border border-border rounded-sm bg-surface p-6"
        noValidate
      >
        <div className="form-group">
          <label htmlFor="password" className="form-label">New password</label>
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
          {password && !passwordValid ? (
            <p className="form-hint text-danger">
              Password must be at least 8 characters and include both letters and numbers.
            </p>
          ) : null}
        </div>

        <div className="form-group">
          <label htmlFor="confirm" className="form-label">Confirm password</label>
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
          {confirmPassword && !passwordsMatch ? (
            <p className="form-hint text-danger">The confirmation password does not match.</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full h-11 mt-2 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving…' : 'Reset password'}
        </button>
      </form>

      <p className="text-sm text-muted text-center mt-6">
        <Link href="/login" className="hover:underline">
          Back to sign in
        </Link>
      </p>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
