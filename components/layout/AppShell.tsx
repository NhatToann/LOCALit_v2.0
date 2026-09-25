'use client'

import { usePathname } from 'next/navigation'
import Header from './Header'
import Footer from './Footer'

// Routes where the role-aware Header (in tourist/buddy layouts) is rendered.
const ROLE_LAYOUTS = ['/tourist', '/buddy']

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const inRoleLayout = ROLE_LAYOUTS.some((p) => pathname.startsWith(p))
  const isAuthPage =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
  const isLanding = pathname === '/'

  // Login/Register pages have their own split layout (no global header/footer).
  if (isAuthPage) {
    return <>{children}</>
  }

  // Tourist / buddy layouts already render their own Header.
  if (inRoleLayout) {
    return (
      <>
        {children}
        <Footer />
      </>
    )
  }

  // Public pages (homepage, browse, map for guests): show guest Header + Footer.
  return (
    <>
      <Header />
      <main style={{ minHeight: 'calc(100vh - var(--header-height))', paddingTop: 'var(--header-height)' }}>
        {children}
      </main>
      <Footer />
    </>
  )
}
