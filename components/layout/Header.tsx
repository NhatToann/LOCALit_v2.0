import Link from 'next/link'

export default function Header({ userRole }: { userRole?: 'tourist' | 'buddy' }) {
  const navLinks = userRole === 'buddy'
    ? [
        { path: '/buddy/dashboard', label: 'Dashboard' },
        { path: '/buddy/requests', label: 'Requests' },
        { path: '/buddy/profile', label: 'Profile' },
        { path: '/chat', label: 'Messages' },
      ]
    : userRole === 'tourist'
    ? [
        { path: '/tourist/dashboard', label: 'Dashboard' },
        { path: '/tourist/browse', label: 'Find Buddies' },
        { path: '/tourist/trips', label: 'My Trips' },
        { path: '/map', label: 'Map' },
        { path: '/chat', label: 'Messages' },
      ]
    : [
        { path: '/', label: 'Home' },
      ]

  return (
    <header
      className="fixed top-0 left-0 right-0 bg-white"
      style={{
        height: 'var(--header-height)',
        borderBottom: '1px solid var(--border-color)',
        zIndex: 'var(--z-fixed)',
      }}
    >
      <div className="container flex-between h-full">
        <Link href={userRole === 'buddy' ? '/buddy/dashboard' : userRole === 'tourist' ? '/tourist/dashboard' : '/'} className="flex items-center gap-sm">
          <span style={{ fontSize: 24 }}>🌍</span>
          <span className="font-bold text-lg">
            <span style={{ color: 'var(--primary)' }}>LOCAL</span>it
          </span>
        </Link>

        <nav className="flex items-center gap-md hide-mobile">
          {navLinks.map((link) => (
            <Link key={link.path} href={link.path} className="text-sm text-secondary hover:text-primary transition">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-md">
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="btn btn-ghost btn-sm">
              Đăng xuất
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
