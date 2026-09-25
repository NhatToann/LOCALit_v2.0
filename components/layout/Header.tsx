'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { useRouter } from 'next/navigation'
import './Header.css'

interface HeaderProps {
  userRole?: 'tourist' | 'buddy'
  userName?: string
}

const NAV_LINKS: Record<string, { path: string; label: string }[]> = {
  buddy: [
    { path: '/buddy/dashboard', label: 'Dashboard' },
    { path: '/buddy/requests', label: 'Requests' },
    { path: '/map', label: 'Map' },
    { path: '/buddy/profile', label: 'Profile' },
  ],
  tourist: [
    { path: '/tourist/dashboard', label: 'Dashboard' },
    { path: '/tourist/browse', label: 'Buddies' },
    { path: '/map', label: 'Map' },
    { path: '/tourist/trips', label: 'Trips' },
    { path: '/chat', label: 'Messages' },
  ],
  guest: [
    { path: '/', label: 'Home' },
    { path: '/tourist/browse', label: 'Buddies' },
    { path: '/map', label: 'Map' },
  ],
}

export default function Header({ userRole, userName }: HeaderProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

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

  const profilePath = userRole === 'buddy' ? '/buddy/profile' : '/tourist/profile'

  return (
    <header className="header">
      <div className="header-container">
        <Link href={homePath} className="logo">
          <span className="logo-icon">🌍</span>
          <span className="logo-text">LOCALit</span>
        </Link>

        <nav className="nav-desktop" aria-label="Primary">
          {links.map((link) => {
            const active =
              pathname === link.path || (link.path !== '/' && pathname.startsWith(link.path + '/'))
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`nav-link ${active ? 'active' : ''}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="header-actions">
          {userRole ? (
            <div ref={menuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMenuOpen((s) => !s)}
                className="user-avatar-btn"
                aria-label="Open account menu"
                aria-expanded={menuOpen}
              >
                <span className="avatar avatar-md">
                  {userName?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </button>
              {menuOpen && (
                <div className="user-menu">
                  <div className="user-menu-info">
                    <p>{userName ?? 'Account'}</p>
                    <p>{userRole === 'buddy' ? 'Local Buddy' : 'Tourist'}</p>
                  </div>
                  <Link href={profilePath} onClick={() => setMenuOpen(false)}>
                    <span>👤</span> My Profile
                  </Link>
                  {userRole === 'tourist' && (
                    <Link href="/tourist/browse" onClick={() => setMenuOpen(false)}>
                      <span>🔍</span> Find a Buddy
                    </Link>
                  )}
                  <div className="menu-divider" />
                  <button onClick={handleSignOut} className="logout">
                    <span>🚪</span> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="btn btn-outline btn-sm">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                Sign up
              </Link>
            </>
          )}

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileOpen((s) => !s)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      <div className={`mobile-menu ${mobileOpen ? 'open' : ''}`}>
        <nav className="mobile-nav">
          {links.map((link) => {
            const active =
              pathname === link.path || (link.path !== '/' && pathname.startsWith(link.path + '/'))
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`mobile-nav-link ${active ? 'active' : ''}`}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>
        <div className="mobile-actions">
          {!userRole ? (
            <>
              <Link href="/login" className="btn btn-outline btn-block">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-primary btn-block">
                Sign up
              </Link>
            </>
          ) : (
            <>
              <Link href={profilePath} className="btn btn-outline btn-block">
                👤 My Profile
              </Link>
              <button onClick={handleSignOut} className="btn btn-danger btn-block">
                🚪 Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
