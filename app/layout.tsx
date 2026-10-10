import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import ScrollToTopOnNavigate from '@/components/layout/ScrollToTopOnNavigate'

export const metadata: Metadata = {
  title: 'LOCALit — Connect with Local Buddies in Da Nang',
  description: 'Discover authentic travel experiences with trusted local buddies in Da Nang. Find, connect, and explore the city together.',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <ScrollToTopOnNavigate />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
