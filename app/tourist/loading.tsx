/**
 * Loading UI for /tourist/* routes. Per Next.js docs, this is an "instant
 * loading state" — it shows immediately on navigation, while the RSC
 * payload for the new route streams in. The shared layout (Header +
 * Footer) stays interactive, so clicking another nav link cancels the
 * current navigation (no need to wait).
 */
export default function Loading() {
  return (
    <main
      id="main-content"
      className="min-h-[calc(100vh-4rem)] pt-16"
      aria-busy="true"
      aria-label="Loading page"
    >
      <div className="container-page py-16">
        <div className="skeleton h-10 w-2/3 mb-3" />
        <div className="skeleton h-5 w-1/2 mb-8" />
        <div className="grid gap-6">
          <div className="skeleton h-32 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
        </div>
      </div>
    </main>
  )
}
