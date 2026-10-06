import type { Metadata } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import AppShell from '@/components/layout/AppShell'

// Plus Jakarta Sans — display + body (single family for consistency, per
// docs/design.md Section 3.1). Geometric humanist. Note: this font
// currently does NOT include the Vietnamese subset (only latin +
// latin-ext), so any Vietnamese characters on the page fall back to
// the system sans. The bilingual EN/VI motif strings in the design use
// only accented characters covered by latin-ext (e.g. Đ, à, ư).
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-jakarta',
})

// JetBrains Mono — monospace for data callouts (numbers, money, code).
// Used in MetricCard, status counters, future data tables. Tabular
// numerals prevent layout shift.
const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-jetbrains',
})

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
    <html lang="en" className={`${jakarta.variable} ${jetbrains.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
