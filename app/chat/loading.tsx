/**
 * Loading UI for /chat. Chat has its own mini-rail layout; keep the
 * skeleton shape similar so the layout shift is minimal.
 */
export default function Loading() {
  return (
    <main
      id="main-content"
      className="min-h-[calc(100vh-4rem)] pt-16"
      aria-busy="true"
      aria-label="Loading chat"
    >
      <div className="max-w-7xl mx-auto h-[calc(100vh-4rem)] grid grid-cols-1 md:grid-cols-[280px_1fr]">
        <div className="border-r border-border hidden md:flex flex-col p-4 gap-2">
          <div className="skeleton h-9 w-full mb-2" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
        <div className="flex flex-col p-6">
          <div className="skeleton h-8 w-1/3 mb-4" />
          <div className="flex-1 skeleton h-full w-full" />
        </div>
      </div>
    </main>
  )
}
