/**
 * Loading UI for /buddy/* routes. Same pattern as /tourist/loading.tsx.
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
        <div className="skeleton h-10 w-1/2 mb-3" />
        <div className="skeleton h-5 w-2/5 mb-8" />
        <div className="grid gap-6">
          <div className="skeleton h-40 w-full" />
          <div className="grid grid-cols-3 gap-6">
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
            <div className="skeleton h-24 w-full" />
          </div>
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    </main>
  )
}
