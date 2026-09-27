import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

export const metadata: Metadata = {
  title: 'LOCALit — Connect with Local Buddies in Da Nang',
  description: 'Discover authentic travel experiences with trusted local buddies in Da Nang. Find, connect, and explore the city together.',
  icons: {
    icon: '/favicon.ico',
  },
}

// Inline before-paint theme bootstrap — reads localStorage so dark mode
// avoids the FOUC flash. Mirrors lib/theme.ts#applyTheme.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('localit-theme');var isDark=t==='dark'||(t!=='light'&&t!=='dark'&&t!=='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(isDark)document.documentElement.classList.add('dark');}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
