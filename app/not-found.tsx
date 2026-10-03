import Link from 'next/link'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-[60vh] flex items-center justify-center px-6 py-16">
      <article className="max-w-[480px] mx-auto border border-border rounded-sm bg-surface p-8 lg:p-10 text-center">
        <Compass
          className="mx-auto text-primary mb-4"
          size={48}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <p className="text-eyebrow text-muted mb-2">Error 404</p>
        <h1 className="text-3xl font-semibold text-ink mb-2 tracking-tight">
          Page not found
        </h1>
        <p className="text-sm text-muted mb-6">
          The page you were looking for does not exist. It may have been moved
          or never existed.
        </p>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link
            href="/"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            Back to home
          </Link>
          <Link
            href="/browse"
            className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
          >
            Browse buddies
          </Link>
        </div>
      </article>
    </main>
  )
}
