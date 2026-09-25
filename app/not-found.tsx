import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen flex-center">
      <div className="text-center">
        <p className="text-6xl">🗺️</p>
        <h1 className="text-4xl mt-md">404 — Không tìm thấy</h1>
        <p className="text-muted mt-sm">Trang bạn tìm kiếm không tồn tại.</p>
        <Link href="/" className="btn btn-primary mt-lg">← Về trang chủ</Link>
      </div>
    </main>
  )
}
