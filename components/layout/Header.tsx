'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import { useRouter } from 'next/navigation'

interface HeaderProps {
  userRole?: 'tourist' | 'buddy'
  userName?: string
}

const NAV_LINKS: Record<string, { path: string; label: string }[]> = {
  buddy: [
    { path: '/buddy/dashboard', label: 'Dashboard' },
    { path: '/buddy/requests', label: 'Yêu cầu' },
    { path: '/buddy/profile', label: 'Hồ sơ' },
    { path: '/chat', label: 'Tin nhắn' },
  ],
  tourist: [
    { path: '/tourist/dashboard', label: 'Dashboard' },
    { path: '/tourist/browse', label: 'Tìm Buddy' },
    { path: '/map', label: 'Bản đồ' },
    { path: '/tourist/trips', label: 'Chuyến đi' },
    { path: '/chat', label: 'Tin nhắn' },
  ],
  guest: [
    { path: '/', label: 'Trang chủ' },
    { path: '/tourist/browse', label: 'Tìm Buddy' },
  ],
}

export default function Header({ userRole, userName }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const links = NAV_LINKS[userRole ?? 'guest']

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const homePath =
    userRole === 'buddy'
      ? '/buddy/dashboard'
      : userRole === 'tourist'
      ? '/tourist/dashboard'
      : '/'

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 'var(--header-height)',
        background: 'var(--bg-white)',
        borderBottom: '1px solid var(--border-color)',
        zIndex: 'var(--z-fixed)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="container flex-between h-full" style={{ height: '100%' }}>
        <Link href={homePath} className="flex items-center gap-sm" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 24 }}>🌍</span>
          <span className="font-bold" style={{ fontSize: 'var(--font-size-lg)' }}>
            <span style={{ color: 'var(--primary)' }}>LOCAL</span>it
          </span>
        </Link>

        <nav className="flex items-center gap-md hide-mobile" aria-label="Primary">
          {links.map((link) => {
            const active =
              pathname === link.path || (link.path !== '/' && pathname.startsWith(link.path + '/'))
            return (
              <Link
                key={link.path}
                href={link.path}
                style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--primary)' : 'var(--text-secondary)',
                  padding: '6px 10px',
                  borderRadius: 'var(--border-radius)',
                  background: active ? 'var(--primary-alpha)' : 'transparent',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-md" style={{ position: 'relative' }}>
          {userRole ? (
            <div ref={menuRef}>
              <button
                onClick={() => setMenuOpen((s) => !s)}
                className="flex items-center gap-sm"
                aria-label="Mở menu tài khoản"
                aria-expanded={menuOpen}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                  borderRadius: 'var(--border-radius-full)',
                }}
              >
                <span className="avatar avatar-md">
                  {userName?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </button>
              {menuOpen && (
                <div
                  className="card animate-fadeIn"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    minWidth: 220,
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 'var(--z-popover)',
                  }}
                >
                  <div className="card-body" style={{ padding: 'var(--space-sm)' }}>
                    <div
                      style={{
                        padding: 'var(--space-sm) var(--space-md)',
                        borderBottom: '1px solid var(--border-color)',
                        marginBottom: 'var(--space-xs)',
                      }}
                    >
                      <p className="font-semibold text-sm">{userName ?? 'Tài khoản'}</p>
                      <p className="text-xs text-muted">{userRole === 'buddy' ? 'Local Buddy' : 'Du khách'}</p>
                    </div>
                    <Link
                      href={userRole === 'buddy' ? '/buddy/profile' : '/tourist/profile'}
                      className="dropdown-item"
                      onClick={() => setMenuOpen(false)}
                    >
                      👤 Hồ sơ của tôi
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="dropdown-item"
                      style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      🚪 Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm hide-mobile">Đăng nhập</Link>
              <Link href="/register" className="btn btn-primary btn-sm">Đăng ký</Link>
            </>
          )}
        </div>
      </div>
      <style>{`
        .dropdown-item {
          display: block;
          padding: var(--space-sm) var(--space-md);
          font-size: var(--font-size-sm);
          color: var(--text-primary);
          border-radius: var(--border-radius);
          transition: background var(--transition-fast);
        }
        .dropdown-item:hover { background: var(--bg-gray); }
      `}</style>
    </header>
  )
}
