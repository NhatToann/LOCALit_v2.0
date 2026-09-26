'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[app] segment error:', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>⚠️</div>
        <h2 style={{ fontSize: 22, margin: '0 0 8px', fontWeight: 700 }}>
          Couldn&apos;t load this section
        </h2>
        <p style={{ color: '#666', margin: '0 0 20px' }}>
          Try again, or browse other parts of LOCALit.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '10px 18px',
              background: '#FF6B35',
              color: '#FFF',
              border: 0,
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
          <Link
            href="/"
            style={{
              padding: '10px 18px',
              background: '#FFF',
              border: '1px solid #E0E0E0',
              borderRadius: 8,
              fontWeight: 600,
              textDecoration: 'none',
              color: '#1A1A2E',
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  )
}
