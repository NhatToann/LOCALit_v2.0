import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex-center">
      <div className="text-center">
        <p className="text-6xl">🗺️</p>
        <h1 className="text-4xl mt-md">404 — Page not found</h1>
        <p className="text-muted mt-sm">The page you are looking for does not exist.</p>
        <Link href="/" className="btn btn-primary mt-lg">← Back to home</Link>
      </div>
    </main>
  )
}
