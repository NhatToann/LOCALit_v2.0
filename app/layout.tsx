import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/layout/AppShell'
import ThemeProvider from '@/components/theme/ThemeProvider'

export const metadata: Metadata = {
  title: 'LOCALit — Connect with Local Buddies in Da Nang',
  description: 'Discover authentic travel experiences with trusted local buddies in Da Nang. Find, connect, and explore the city together.',
  icons: {
    icon: '/favicon.ico',
  },
}

// Pre-paint bootstrap for next-themes. The @teispace/next-themes fork does not
// inject its own inline script for `attribute="class"`, so we replicate it
// here. Reads the same `theme` key next-themes writes (light|dark|system)
// and falls back to the OS preference. Runs synchronously before paint so
// dark-mode users never see a white flash.
const themeBootstrap = `(function(){try{var t=localStorage.getItem('theme');var isDark=t==='dark'||((t===null||t==='system')&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var c=document.documentElement.classList;c.remove('light','dark');if(isDark)c.add('dark');else c.add('light');}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
