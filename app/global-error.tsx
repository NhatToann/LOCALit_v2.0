'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'

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
          background: '#FAFAF7',
          color: '#0F0F0F',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <LifeBuoy
            size={64}
            strokeWidth={1.5}
            color="#0063AE"
            style={{ marginBottom: 12 }}
            aria-hidden="true"
          />
          <h1 style={{ fontSize: 28, margin: '0 0 12px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#737373', margin: '0 0 24px', lineHeight: 1.6 }}>
            We hit an unexpected error loading this page. The team has been notified.
            Try again, or head back home.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '12px 22px',
                background: '#0063AE',
                color: '#FAFAF7',
                border: '1px solid #0063AE',
                borderRadius: 4,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Try again
            </button>
            <Link
              href="/"
              style={{
                padding: '12px 22px',
                background: '#FFFFFF',
                color: '#0F0F0F',
                border: '1px solid #D4D4D0',
                borderRadius: 4,
                fontWeight: 500,
                textDecoration: 'none',
                fontFamily: 'inherit',
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
                color: '#A3A3A3',
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
