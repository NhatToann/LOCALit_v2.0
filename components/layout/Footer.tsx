import Link from 'next/link'

export default function Footer() {
  return (
    <footer style={{ background: 'var(--secondary)', color: 'var(--text-light)', marginTop: 'var(--space-3xl)' }}>
      <div className="container py-xl">
        <div className="grid grid-4" style={{ gap: 'var(--space-xl)' }}>
          <div>
            <div className="flex items-center gap-sm mb-md">
              <span style={{ fontSize: 24 }}>🌍</span>
              <span className="font-bold">
                <span style={{ color: 'var(--primary)' }}>LOCAL</span>it
              </span>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Kết nối du khách với những người bạn địa phương chân chính.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-md">Khám phá</h4>
            <ul className="flex flex-col gap-sm text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <li><Link href="/tourist/browse">Tìm Buddy</Link></li>
              <li><Link href="/map">Bản đồ</Link></li>
              <li><Link href="/tourist/dashboard">Của tôi</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-md">Dành cho Buddy</h4>
            <ul className="flex flex-col gap-sm text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <li><Link href="/register?role=buddy">Trở thành Buddy</Link></li>
              <li><Link href="/buddy/dashboard">Dashboard</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-md">Hỗ trợ</h4>
            <ul className="flex flex-col gap-sm text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
              <li>support@localit.dev</li>
              <li>Câu hỏi thường gặp</li>
            </ul>
          </div>
        </div>

        <div className="mt-lg pt-md" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
          <p className="text-sm">© 2026 LOCALit. Kỳ 8 Project.</p>
        </div>
      </div>
    </footer>
  )
}
