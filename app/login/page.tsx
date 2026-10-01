'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Check } from 'lucide-react'
import { signIn } from '@/utils/supabase/auth'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo')
  const registered = searchParams.get('registered') === '1'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const emailLooksValid = email.includes('@') && email.includes('.')
  const canSignIn = emailLooksValid && password.length >= 6

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!emailLooksValid) {
      setError('Please enter a valid email address.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    const { data, error: signInError } = await signIn(email, password)

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Incorrect email or password.'
          : 'Sign in failed. Please try again.',
      )
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

      const defaultPath = '/dashboard'
      router.push(redirectTo || defaultPath)
    }
  }

  return (
    <main className="container-page py-12 max-w-md">
      <header className="mb-6 text-center">
        <h1 className="text-page-title">Sign in</h1>
        <p className="text-sm text-muted mt-2">
          Welcome back. Continue your Da Nang trip with a verified local buddy.
        </p>
      </header>

      {registered ? (
        <div className="alert alert-success mb-4" role="status">
          <Check size={16} aria-hidden="true" />
          <div>
            <p className="font-semibold">Sign up successful.</p>
            <p className="text-sm">Please sign in with your new account.</p>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="border border-border rounded-sm bg-surface p-6"
        noValidate
      >
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email</label>
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
          {email && !emailLooksValid ? (
            <p className="form-hint text-danger">Please enter a valid email address.</p>
          ) : null}
        </div>

        <div className="form-group">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="form-label">Password</label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            className="form-input"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {password && password.length < 6 ? (
            <p className="form-hint text-danger">Password must be at least 6 characters.</p>
          ) : null}
        </div>

        {error ? (
          <div className="alert alert-error mb-4" role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={!canSignIn || loading}
          className="w-full h-11 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="text-sm text-muted text-center mt-6">
        New to LOCALit?{' '}
        <Link href="/register" className="text-primary hover:underline font-medium">
          Create an account
        </Link>
      </p>

      <details className="mt-6 text-xs text-muted">
        <summary className="cursor-pointer font-medium">Demo accounts</summary>
        <div className="mt-2 space-y-1">
          <p>
            <code>lan.pham@localit.dev</code> / <code>password123</code> (buddy)
          </p>
          <p>
            <code>john.doe@example.com</code> / <code>password123</code> (tourist)
          </p>
        </div>
      </details>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="container-page py-16 text-center">
          <div className="loading-spinner mx-auto" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
