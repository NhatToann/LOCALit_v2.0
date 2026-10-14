'use client'

import {
  MapPin,
  Star,
  DollarSign,
  MessageCircle,
  Sparkles,
  Globe,
  Clock,
  Heart,
  Route,
  Languages,
  Award,
  CalendarDays,
} from 'lucide-react'
import { Link } from '@/components/ui/Link'
import type { Buddy, Profile } from '@/lib/types'
import { labelFor } from '@/lib/specialties'
import ConnectButton from '@/components/buddy/ConnectButton'
import ReviewSection from '@/components/review/ReviewSection'
import { StarDisplay } from '@/components/review/ReviewSection'

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

const TRANSPORT_LABEL: Record<string, string> = {
  walk: 'On foot',
  bike: 'Bicycle',
  motorbike: 'Motorbike',
  car: 'Car',
  bus: 'Bus',
}

export default function BuddyPublicView({ buddy: b, profile: p, ratingAvg, ratingCount }: Props) {
  const score = publicScore(b, p)
  const topTag = b.specialties[0]
  const topLang = b.languages[0]

  return (
    <div className="container-page py-8">
      {/* ── Hero ── */}
      <header className="border border-border rounded-sm bg-surface p-5 mb-5">
        <div className="flex flex-wrap items-start gap-5">
          <span
            className="flex items-center justify-center w-20 h-20 rounded-full text-3xl font-semibold text-paper shrink-0 overflow-hidden"
            style={{ backgroundColor: '#134E4A' }}
            aria-hidden="true"
          >
            {p.avatar_url ? (
              <img
                src={p.avatar_url}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              p.full_name.charAt(0)
            )}
          </span>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-page-title">{p.full_name}</h1>
              <span className="role-tag role-tag-buddy">Buddy</span>
              {p.is_online ? (
                <span className="badge badge-success text-xs">
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full mr-1 align-middle" aria-hidden="true" />
                  Online now
                </span>
              ) : null}
              {!b.is_available ? (
                <span className="badge badge-warning text-xs">Not taking requests</span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} aria-hidden="true" />
                {b.location_city}
              </span>
              {b.hourly_rate ? (
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <DollarSign size={13} aria-hidden="true" />
                  {Number(b.hourly_rate).toFixed(0)} USD / hour
                </span>
              ) : null}
              {ratingCount > 0 ? (
                <StarDisplay rating={ratingAvg} showValue count={ratingCount} />
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Star size={13} aria-hidden="true" />
                  No reviews yet
                </span>
              )}
              <span className="inline-flex items-center gap-1 tabular-nums">
                <Route size={13} aria-hidden="true" />
                {b.trips_completed} {b.trips_completed === 1 ? 'trip' : 'trips'} completed
              </span>
            </div>

            {/* At-a-glance metrics strip */}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
              <div>
                <dt className="text-eyebrow text-muted">Languages</dt>
                <dd className="text-sm font-semibold text-ink mt-0.5 tabular-nums">
                  {b.languages.length || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow text-muted">Specialties</dt>
                <dd className="text-sm font-semibold text-ink mt-0.5 tabular-nums">
                  {b.specialties.length || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow text-muted">Rating</dt>
                <dd className="text-sm font-semibold text-ink mt-0.5 tabular-nums">
                  {ratingCount > 0 ? ratingAvg.toFixed(1) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow text-muted">Profile</dt>
                <dd className="text-sm font-semibold text-ink mt-0.5">
                  <span
                    className={`badge text-xs font-mono tabular-nums border ${scoreColor(score)}`}
                    aria-label={`Profile completeness ${score} out of 100`}
                  >
                    <Sparkles size={11} className="inline mr-1" aria-hidden="true" />
                    {score}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <ConnectButton recipientId={b.id} recipientName={p.full_name} viewerAs="tourist" />
            <Link
              href={`/chat?buddy=${b.id}`}
              className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <MessageCircle size={14} aria-hidden="true" />
              Message
            </Link>
            {topTag || topLang ? (
              <Link
                href={`/search?${topTag ? `tag=${topTag}` : ''}${topTag && topLang ? '&' : ''}${
                  topLang ? `lang=${encodeURIComponent(topLang)}` : ''
                }`}
                className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-muted border border-border hover:bg-paper"
              >
                <Heart size={14} aria-hidden="true" />
                Find similar buddies
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── About ── */}
      {p.bio || b.bio ? (
        <section className="mb-5 border border-border rounded-sm bg-surface p-5">
          <h2 className="text-eyebrow text-muted mb-2">About</h2>
          {p.bio ? (
            <p className="text-sm text-ink leading-relaxed max-w-prose">{p.bio}</p>
          ) : null}
          {b.bio && b.bio !== p.bio ? (
            <p className="text-sm text-ink leading-relaxed max-w-prose mt-2 pt-2 border-t border-border">
              {b.bio}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Details grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card title="Specialties" icon={Award}>
          {b.specialties.length === 0 ? (
            <Empty>Not listed yet</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {b.specialties.map((s) => (
                <li key={s}>
                  <Link href={`/search?tag=${s}`} className="badge badge-neutral text-xs hover:bg-paper">
                    {labelFor(s)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Languages" icon={Languages}>
          {b.languages.length === 0 ? (
            <Empty>Not listed yet</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {b.languages.map((l) => (
                <li key={l} lang="en">
                  <Link href={`/search?lang=${encodeURIComponent(l)}`} className="lang-chip hover:bg-paper">
                    {l}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Getting around" icon={Route}>
          {b.transport ? (
            <ul className="space-y-1.5 text-sm">
              <li className="text-ink font-medium">{TRANSPORT_LABEL[b.transport] ?? b.transport}</li>
              {b.transport_note ? (
                <li className="text-xs text-muted leading-relaxed">{b.transport_note}</li>
              ) : null}
            </ul>
          ) : (
            <Empty>Not specified</Empty>
          )}
        </Card>

        <Card title="Favorite places" icon={MapPin}>
          {b.favorite_places.length === 0 ? (
            <Empty>Not listed yet</Empty>
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

      {/* ── Availability strip ── */}
      <section className="mb-5 border border-border rounded-sm bg-surface p-4">
        <h2 className="text-eyebrow text-muted mb-2">Availability</h2>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className={`inline-flex items-center gap-1.5 font-medium ${b.is_available ? 'text-success' : 'text-muted'}`}>
            <Clock size={14} aria-hidden="true" />
            {b.is_available ? 'Accepting connection requests' : 'Not accepting new requests'}
          </span>
          {b.languages.includes('English') || b.languages.includes('Vietnamese') ? (
            <span className="inline-flex items-center gap-1.5 text-ink">
              <Globe size={14} aria-hidden="true" />
              Speaks {b.languages.slice(0, 3).join(', ')}
            </span>
          ) : null}
          {b.hourly_rate ? (
            <span className="inline-flex items-center gap-1.5 text-ink tabular-nums">
              <CalendarDays size={14} aria-hidden="true" />
              {Number(b.hourly_rate).toFixed(0)} USD/hour, no booking fee
            </span>
          ) : null}
        </div>
      </section>

      {/* ── Reviews ── */}
      <ReviewSection revieweeId={b.id} revieweeName={p.full_name} />
    </div>
  )
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon?: typeof MapPin
  children: React.ReactNode
}) {
  return (
    <section className="border border-border rounded-sm bg-surface p-4">
      <h2 className="text-eyebrow text-muted mb-2 flex items-center gap-1.5">
        {Icon ? <Icon size={12} aria-hidden="true" /> : null}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}