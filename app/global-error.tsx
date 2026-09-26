'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app] route error:', error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8F9FA',
          color: '#1A1A2E',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>🛟</div>
          <h1 style={{ fontSize: 28, margin: '0 0 12px', fontWeight: 700 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#666', margin: '0 0 24px', lineHeight: 1.6 }}>
            We hit an unexpected error loading this page. The team has been notified.
            Try again, or head back home.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '12px 22px',
                background: '#FF6B35',
                color: '#FFF',
                border: 0,
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: '12px 22px',
                background: '#FFF',
                color: '#1A1A2E',
                border: '1px solid #E0E0E0',
                borderRadius: 8,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Go home
            </Link>
          </div>
          {error?.digest && (
            <p
              style={{
                marginTop: 24,
                fontSize: 12,
                color: '#999',
                fontFamily: 'ui-monospace, monospace',
              }}
            >
              ref: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  )
}
