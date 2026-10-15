'use client'

import {
  MapPin,
  Calendar,
  Globe,
  Compass,
  Sparkles,
  Heart,
  Users,
  Languages,
  Wallet,
  Plane,
} from 'lucide-react'
import { Link } from '@/components/ui/Link'
import type { Tourist, Profile } from '@/lib/types'
import ConnectButton from '@/components/connection/ConnectButton'
import ReviewSection from '@/components/review/ReviewSection'
import { StarDisplay } from '@/components/review/ReviewSection'

interface Props {
  tourist: Tourist
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
 * Tourist public profile — symmetric to BuddyPublicView but reads the
 * tourists table. The viewer (typically a buddy) can issue a connection
 * request via ConnectButton with viewerAs='buddy', so the schema's
 * tourist_id/buddy_id NOT NULL constraints are satisfied.
 */
function publicScore(t: Tourist, p: Profile): number {
  let s = 0
  if (p.avatar_url) s += 10
  if (t.interests.length >= 1) s += 10
  if (t.interests.length >= 3) s += 10
  if (t.languages.length >= 1) s += 10
  if (t.languages.length >= 2) s += 10
  if (t.arrival_date) s += 10
  if (t.travel_style) s += 10
  if (t.nationality) s += 5
  if (p.is_online) s += 10
  if (t.destination) s += 5
  return Math.min(100, s)
}

function fmtDate(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STYLE_LABEL: Record<string, string> = {
  solo: 'Solo tourist',
  couple: 'Traveling as a couple',
  friends: 'Traveling with friends',
  family: 'Traveling with family',
}

const BUDGET_LABEL: Record<string, string> = {
  'under-50': 'Under $50/day',
  '50-100': '$50–100/day',
  '100-200': '$100–200/day',
  '200+': '$200+/day',
}

export default function TouristPublicView({
  tourist: t,
  profile: p,
  ratingAvg,
  ratingCount,
}: Props) {
  const score = publicScore(t, p)
  const topInterest = t.interests?.[0] ?? null
  const topLang = t.languages?.[0] ?? null

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
              <span className="role-tag role-tag-tourist">Tourist</span>
              {p.is_online ? (
                <span className="badge badge-success text-xs">
                  <span className="inline-block w-1.5 h-1.5 bg-current rounded-full mr-1 align-middle" aria-hidden="true" />
                  Online now
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2 text-sm text-muted">
              {t.nationality ? (
                <span className="inline-flex items-center gap-1">
                  <Globe size={13} aria-hidden="true" />
                  {t.nationality}
                </span>
              ) : null}
              {t.destination ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={13} aria-hidden="true" />
                  {t.destination}
                </span>
              ) : null}
              {t.arrival_date ? (
                <span className="inline-flex items-center gap-1">
                  <Calendar size={13} aria-hidden="true" />
                  Arrives {fmtDate(t.arrival_date)}
                </span>
              ) : null}
              {ratingCount > 0 ? (
                <StarDisplay rating={ratingAvg} showValue count={ratingCount} />
              ) : null}
            </div>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-border">
              <div>
                <dt className="text-eyebrow text-muted">Interests</dt>
                <dd className="text-sm font-semibold text-ink mt-0.5 tabular-nums">
                  {t.interests.length || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-eyebrow text-muted">Languages</dt>
                <dd className="text-sm font-semibold text-ink mt-0.5 tabular-nums">
                  {t.languages.length || '—'}
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

          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <ConnectButton recipientId={t.id} recipientName={p.full_name} viewerAs="buddy" />
            {topInterest ? (
              <Link
                href={`/search?tag=${encodeURIComponent(topInterest)}`}
                className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-muted border border-border hover:bg-paper"
              >
                <Heart size={14} aria-hidden="true" />
                Find similar tourists
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── About ── */}
      {p.bio ? (
        <section className="mb-5 border border-border rounded-sm bg-surface p-5">
          <h2 className="text-eyebrow text-muted mb-2">About</h2>
          <p className="text-sm text-ink leading-relaxed max-w-prose">{p.bio}</p>
        </section>
      ) : null}

      {/* ── Details grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card title="Interests" icon={Sparkles}>
          {t.interests.length === 0 ? (
            <Empty>Not listed yet</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {t.interests.map((s) => (
                <li key={s}>
                  <Link href={`/search?tag=${encodeURIComponent(s)}`} className="badge badge-neutral text-xs hover:bg-paper">
                    {s}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Languages" icon={Languages}>
          {t.languages.length === 0 ? (
            <Empty>Not listed yet</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {t.languages.map((l) => (
                <li key={l} lang="en">
                  <span className="lang-chip">{l}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Travel style" icon={Compass}>
          {t.travel_style ? (
            <p className="text-sm text-ink font-medium">
              {STYLE_LABEL[t.travel_style] ?? t.travel_style}
            </p>
          ) : (
            <Empty>Not specified</Empty>
          )}
        </Card>

        <Card title="Trip & budget" icon={Wallet}>
          <ul className="space-y-1.5 text-sm">
            {t.arrival_date ? (
              <li className="inline-flex items-center gap-1.5 text-ink">
                <Plane size={13} className="text-muted shrink-0" aria-hidden="true" />
                Arrives {fmtDate(t.arrival_date)}
              </li>
            ) : null}
            {t.budget_range ? (
              <li className="inline-flex items-center gap-1.5 text-ink">
                <Wallet size={13} className="text-muted shrink-0" aria-hidden="true" />
                {BUDGET_LABEL[t.budget_range] ?? t.budget_range}
              </li>
            ) : null}
            {!t.arrival_date && !t.budget_range ? <Empty>Not specified</Empty> : null}
          </ul>
        </Card>
      </div>

      {/* ── Reviews ── */}
      <ReviewSection revieweeId={t.id} revieweeName={p.full_name} />
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