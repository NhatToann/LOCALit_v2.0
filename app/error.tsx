'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

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
    <main className="container-page py-16">
      <div className="max-w-[480px] mx-auto border border-border rounded-sm bg-surface p-8 text-center">
        <AlertTriangle
          className="mx-auto mb-4 text-warning"
          size={48}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <h1 className="text-2xl font-semibold text-ink mb-2 tracking-tight">
          Couldn&apos;t load this section
        </h1>
        <p className="text-sm text-muted mb-6">
          Try again, or browse other parts of LOCALit.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
          >
            Home
          </Link>
        </div>
      </div>
    </main>
  )
}
