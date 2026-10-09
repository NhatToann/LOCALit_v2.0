import { MapPin, Star, DollarSign, MessageCircle, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { Buddy, Profile } from '@/lib/types'
import { labelFor } from '@/lib/specialties'
import ConnectButton from '@/components/buddy/ConnectButton'

interface Props {
  buddy: Buddy
  profile: Profile
  ratingAvg: number
  ratingCount: number
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-success-bg text-success border-success-bg'
  if (score >= 40) return 'bg-primary-bg text-primary border-primary-bg'
  return 'bg-warning-bg text-warning border-warning-bg'
}

/**
 * Compute a simple "this buddy matches what you might want" score
 * from their own data (no tourist context available). Used to add
 * a 0-100 confidence badge on the public profile so tourists can
 * quickly gauge completeness + availability without going to /search.
 */
function publicScore(b: Buddy, p: Profile): number {
  let s = 0
  if (p.avatar_url) s += 10
  if (b.bio && b.bio.length >= 30) s += 10
  if (b.specialties.length >= 1) s += 10
  if (b.specialties.length >= 3) s += 10
  if (b.languages.length >= 1) s += 10
  if (b.languages.length >= 2) s += 10
  if (b.hourly_rate > 0) s += 10
  if (b.favorite_places.length >= 1) s += 5
  if (b.is_available) s += 15
  if (p.is_online) s += 10
  return Math.min(100, s)
}

export default function BuddyPublicView({ buddy: b, profile: p, ratingAvg, ratingCount }: Props) {
  const score = publicScore(b, p)
  const topTag = b.specialties[0]
  const topLang = b.languages[0]

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span
          className="flex items-center justify-center w-16 h-16 rounded-full text-2xl font-semibold text-paper shrink-0"
          style={{ backgroundColor: '#0063AE' }}
          aria-hidden="true"
        >
          {p.full_name.charAt(0)}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-page-title">{p.full_name}</h1>
            <span
              className={`badge text-xs font-mono tabular-nums border ${scoreColor(score)}`}
              aria-label={`Profile completeness ${score} out of 100`}
            >
              <Sparkles size={12} className="inline mr-1" aria-hidden="true" />
              {score}
            </span>
            {p.is_online ? (
              <span className="badge badge-success text-xs">Online</span>
            ) : null}
          </div>
          <p className="text-sm text-muted mt-1">
            <MapPin size={12} className="inline mr-1 align-middle" aria-hidden="true" />
            {b.location_city}
            {b.hourly_rate ? (
              <>
                {' · '}
                <DollarSign size={12} className="inline mr-0.5 align-middle" aria-hidden="true" />
                {Number(b.hourly_rate).toFixed(0)} USD / hour
              </>
            ) : null}
            {ratingCount > 0 ? (
              <>
                {' · '}
                <Star size={12} className="inline mr-1 align-middle text-warning" aria-hidden="true" />
                {ratingAvg.toFixed(1)} ({ratingCount} {ratingCount === 1 ? 'review' : 'reviews'})
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {topTag || topLang ? (
            <Link
              href={`/search?${topTag ? `tag=${topTag}` : ''}${topTag && topLang ? '&' : ''}${
                topLang ? `lang=${encodeURIComponent(topLang)}` : ''
              }`}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              Find similar buddies
            </Link>
          ) : null}
          <ConnectButton recipientId={b.id} recipientName={p.full_name} viewerAs="tourist" />
          <Link
            href={`/chat?buddy=${b.id}`}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <MessageCircle size={14} aria-hidden="true" />
            Message
          </Link>
        </div>
      </header>

      {b.bio ? (
        <section className="mb-6 border border-border rounded-sm bg-[#FFFFFF] p-5">
          <h2 className="text-sm font-semibold text-ink mb-2">About</h2>
          <p className="text-sm text-ink leading-relaxed max-w-prose">{b.bio}</p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="Specialties">
          {b.specialties.length === 0 ? (
            <Empty>—</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {b.specialties.map((s) => (
                <li key={s}>
                  <Link
                    href={`/search?tag=${s}`}
                    className="badge badge-neutral text-xs hover:bg-paper"
                  >
                    {labelFor(s)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Languages">
          {b.languages.length === 0 ? (
            <Empty>—</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {b.languages.map((l) => (
                <li key={l} lang="en">
                  <Link
                    href={`/search?lang=${encodeURIComponent(l)}`}
                    className="lang-chip hover:bg-paper"
                  >
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Favorite places">
          {b.favorite_places.length === 0 ? (
            <Empty>—</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {b.favorite_places.map((pl) => (
                <li key={pl}>
                  <span className="badge badge-info text-xs">{pl}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-sm bg-[#FFFFFF] p-4">
      <h2 className="text-eyebrow text-muted mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}
