import { MapPin, Calendar, Globe, Compass, MessageCircle, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { Tourist, Profile } from '@/lib/types'
import ConnectButton from '@/components/buddy/ConnectButton'

interface Props {
  tourist: Tourist
  profile: Profile
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

export default function TouristPublicView({ tourist: t, profile: p }: Props) {
  const score = publicScore(t, p)
  const topInterest = t.interests?.[0] ?? null
  const topLang = t.languages?.[0] ?? null

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <span
          className="flex items-center justify-center w-16 h-16 rounded-full text-2xl font-semibold text-paper shrink-0 overflow-hidden"
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
            {t.nationality ? (
              <>
                <Globe size={12} className="inline mr-1 align-middle" aria-hidden="true" />
                {t.nationality}
              </>
            ) : null}
            {t.destination ? (
              <>
                {' · '}
                <MapPin size={12} className="inline mr-1 align-middle" aria-hidden="true" />
                {t.destination}
              </>
            ) : null}
            {t.arrival_date ? (
              <>
                {' · '}
                <Calendar size={12} className="inline mr-1 align-middle" aria-hidden="true" />
                Arrives {fmtDate(t.arrival_date)}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ConnectButton recipientId={t.id} recipientName={p.full_name} viewerAs="buddy" />
          <Link
            href={`/chat?buddy=${t.id}`}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <MessageCircle size={14} aria-hidden="true" />
            Message
          </Link>
        </div>
      </header>

      {p.bio ? (
        <section className="mb-6 border border-border rounded-sm bg-surface p-5">
          <h2 className="text-sm font-semibold text-ink mb-2">About</h2>
          <p className="text-sm text-ink leading-relaxed max-w-prose">{p.bio}</p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card title="Interests">
          {t.interests.length === 0 ? (
            <Empty>—</Empty>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {t.interests.map((s) => (
                <li key={s}>
                  <span className="badge badge-neutral text-xs">{s}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Languages">
          {t.languages.length === 0 ? (
            <Empty>—</Empty>
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
        <Card title="Trip">
          {t.arrival_date || t.travel_style || t.budget_range ? (
            <ul className="text-sm space-y-1">
              {t.arrival_date ? (
                <li className="inline-flex items-center gap-1 text-ink">
                  <Calendar size={12} className="text-muted" aria-hidden="true" />
                  Arrives {fmtDate(t.arrival_date)}
                </li>
              ) : null}
              {t.travel_style ? (
                <li className="inline-flex items-center gap-1 text-ink">
                  <Compass size={12} className="text-muted" aria-hidden="true" />
                  Traveling as {t.travel_style}
                </li>
              ) : null}
              {t.budget_range ? (
                <li className="inline-flex items-center gap-1 text-ink">
                  <Sparkles size={12} className="text-muted" aria-hidden="true" />
                  Budget: {t.budget_range} USD/day
                </li>
              ) : null}
              {topInterest ? (
                <li className="inline-flex items-center gap-1 text-ink">
                  Loves {topInterest}{topLang ? ` · speaks ${topLang}` : ''}
                </li>
              ) : null}
            </ul>
          ) : (
            <Empty>No trip info yet</Empty>
          )}
        </Card>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border rounded-sm bg-surface p-4">
      <h2 className="text-eyebrow text-muted mb-2">{title}</h2>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}