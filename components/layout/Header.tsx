'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { Menu, User, Search, LogOut, X, Globe } from 'lucide-react';
import { createClient } from '@/utils/supabase/auth';
import { useRouter } from 'next/navigation';

type UserRole = 'tourist' | 'buddy';

interface HeaderProps {
  userRole?: UserRole;
  userName?: string;
}

const NAV_LINKS: Record<UserRole | 'guest', { path: string; label: string }[]> = {
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
};

export default function Header({ userRole, userName }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const links = NAV_LINKS[userRole ?? 'guest'];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const homePath =
    userRole === 'buddy'
      ? '/buddy/dashboard'
      : userRole === 'tourist'
        ? '/tourist/dashboard'
        : '/';

  const profilePath = userRole === 'buddy' ? '/buddy/profile' : '/tourist/profile';

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-surface border-b border-border z-50">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-6">
        <Link href={homePath} className="flex items-center gap-2 flex-shrink-0">
          <Globe size={28} className="text-primary" aria-hidden="true" />
          <span className="text-xl font-semibold text-primary tracking-tight">LOCALit</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8 flex-1 justify-center" aria-label="Primary">
          {links.map((link) => {
            const active =
              pathname === link.path || (link.path !== '/' && pathname.startsWith(link.path + '/'));
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`text-sm font-medium transition-colors duration-150 ${
                  active ? 'text-primary' : 'text-muted hover:text-ink'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 flex-shrink-0">
          {userRole ? (
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((s) => !s)}
                className="p-1 rounded-full transition-transform duration-150 hover:scale-105"
                aria-label="Open account menu"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="avatar avatar-md" aria-hidden="true">
                  {userName?.charAt(0)?.toUpperCase() ?? '?'}
                </span>
              </button>
              {menuOpen ? (
                <div
                  role="menu"
                  className="absolute top-full mt-2 right-0 min-w-[200px] bg-surface border border-border rounded-sm py-1 z-50"
                >
                  <div className="px-3 py-2 border-b border-border mb-1">
                    <p className="text-sm font-semibold text-ink">{userName ?? 'Account'}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {userRole === 'buddy' ? 'Local Buddy' : 'Tourist'}
                    </p>
                  </div>
                  <Link
                    href={profilePath}
                    onClick={() => setMenuOpen(false)}
                    role="menuitem"
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-ink hover:bg-paper"
                  >
                    <User size={16} aria-hidden="true" />
                    My Profile
                  </Link>
                  {userRole === 'tourist' ? (
                    <Link
                      href="/tourist/browse"
                      onClick={() => setMenuOpen(false)}
                      role="menuitem"
                      className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-ink hover:bg-paper"
                    >
                      <Search size={16} aria-hidden="true" />
                      Find a Buddy
                    </Link>
                  ) : null}
                  <div className="h-px bg-border my-1" role="separator" />
                  <button
                    onClick={handleSignOut}
                    role="menuitem"
                    className="flex items-center gap-2 w-full text-left px-3 py-2 text-sm text-danger hover:bg-paper"
                  >
                    <LogOut size={16} aria-hidden="true" />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden md:inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="hidden md:inline-flex items-center justify-center h-8 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                Sign up
              </Link>
            </>
          )}

          <button
            onClick={() => setMobileOpen((s) => !s)}
            className="md:hidden p-2"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? (
              <X size={24} aria-hidden="true" />
            ) : (
              <Menu size={24} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={`md:hidden ${mobileOpen ? 'block' : 'hidden'} absolute top-16 left-0 right-0 bg-surface border-b border-border px-6 py-6`}
      >
        <nav className="flex flex-col gap-4 mb-6" aria-label="Mobile primary">
          {links.map((link) => {
            const active =
              pathname === link.path || (link.path !== '/' && pathname.startsWith(link.path + '/'));
            return (
              <Link
                key={link.path}
                href={link.path}
                className={`text-lg font-medium ${
                  active ? 'text-primary' : 'text-ink hover:text-primary'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2 pt-4 border-t border-border">
          {!userRole ? (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper w-full"
              >
                Sign in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover w-full"
              >
                Sign up
              </Link>
            </>
          ) : (
            <>
              <Link
                href={profilePath}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper w-full gap-2"
              >
                <User size={16} aria-hidden="true" />
                My Profile
              </Link>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-danger-bg text-danger border border-danger-bg hover:bg-danger hover:text-paper w-full gap-2"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
