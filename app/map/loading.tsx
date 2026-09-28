/**
 * Loading UI for /map. Map page has a tall canvas — keep the skeleton
 * simple to avoid layout thrash when the map tiles stream in.
 */
export default function Loading() {
  return (
    <main
      id="main-content"
      className="min-h-[calc(100vh-4rem)] pt-16"
      aria-busy="true"
      aria-label="Loading map"
    >
      <div className="container-page py-8">
        <div className="skeleton h-9 w-1/3 mb-6" />
        <div className="skeleton h-[calc(100vh-12rem)] w-full" />
      </div>
    </main>
  )
}
