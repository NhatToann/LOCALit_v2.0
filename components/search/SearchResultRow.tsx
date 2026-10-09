'use client'

/**
 * SearchResultRow — a single row in the /search result list.
 *
 * Renders the avatar, match-score badge, the 4-signal breakdown
 * chips, an expand-to-see-bio state, and the action buttons.
 *
 * Score breakdown (the AEO-friendly bit) is shown as
 * "2.1 km away · 3 matching tags · Speaks English · Available now"
 * — each chip references the value returned by the RPC.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  MapPin,
  Star,
  ChevronDown,
  Heart,
  MessageCircle,
  Globe,
  CheckCircle2,
  CircleDot,
} from 'lucide-react'
import type { BuddySearchResult } from '@/lib/search/types'

interface Props {
  result: BuddySearchResult
  saved: boolean
  onToggleSave: () => void
}

function labelFor(value: string): string {
  return value
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function scoreColor(score: number): string {
  if (score >= 70) return 'bg-success-bg text-success border-success-bg'
  if (score >= 40) return 'bg-primary-bg text-primary border-primary-bg'
  return 'bg-warning-bg text-warning border-warning-bg'
}

export default function SearchResultRow({ result, saved, onToggleSave }: Props) {
  const [expanded, setExpanded] = useState(false)
  const r = result
  const dist = r.distance_km != null ? `${r.distance_km.toFixed(1)} km` : null
  const tagOverlap = Math.round((r.tag_score / 100) * (r.specialties?.length ?? 0))
  const topLang = r.languages?.[0]

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        onMouseEnter={(e) => e.preventDefault()}
        aria-expanded={expanded}
        className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-paper transition-colors duration-150"
      >
        <span
          className="flex items-center justify-center w-10 h-10 rounded-full text-sm font-semibold text-paper shrink-0"
          style={{ backgroundColor: '#134E4A' }}
          aria-hidden="true"
        >
          {r.full_name.charAt(0)}
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-ink truncate">{r.full_name}</p>
            <span
              className={`badge text-xs font-mono tabular-nums border ${scoreColor(Number(r.match_score))}`}
              aria-label={`Match score ${Number(r.match_score).toFixed(0)} out of 100`}
            >
              <Sparkles size={12} className="inline mr-1" aria-hidden="true" />
              {Number(r.match_score).toFixed(0)}
            </span>
            {r.is_online ? (
              <span className="badge badge-success text-xs" title="Online now">
                <CircleDot size={10} className="inline mr-1" aria-hidden="true" />
                Online
              </span>
            ) : null}
          </div>

          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted mt-1.5" aria-label="Match breakdown">
            {dist ? (
              <li>
                <MapPin size={12} className="inline mr-0.5 align-middle" aria-hidden="true" />
                {dist}
              </li>
            ) : null}
            {tagOverlap > 0 ? (
              <li>
                <CheckCircle2 size={12} className="inline mr-0.5 align-middle" aria-hidden="true" />
                {tagOverlap} matching {tagOverlap === 1 ? 'tag' : 'tags'}
              </li>
            ) : null}
            {topLang ? (
              <li lang="en">
                <Globe size={12} className="inline mr-0.5 align-middle" aria-hidden="true" />
                Speaks {topLang}
                {r.languages.length > 1 ? ` +${r.languages.length - 1}` : ''}
              </li>
            ) : null}
            {r.is_available ? (
              <li className="text-success">Available now</li>
            ) : null}
          </ul>

          <p className="text-xs text-muted truncate mt-1">
            {r.specialties.slice(0, 3).map(labelFor).join(' · ') || r.location_city}
          </p>
        </div>

        <div className="text-right hidden sm:block shrink-0">
          <p className="text-sm font-medium">
            <Star
              size={12}
              className="inline mr-1 text-warning align-middle"
              aria-hidden="true"
            />
            {r.rating_count > 0 ? Number(r.rating_avg).toFixed(1) : '—'}
          </p>
          <p className="text-xs text-muted">
            {r.rating_count} {r.rating_count === 1 ? 'review' : 'reviews'}
          </p>
        </div>

        <ChevronDown
          size={18}
          className={`text-muted transition-transform duration-150 shrink-0 ${expanded ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded ? (
        <div className="px-5 pb-5 pt-2 bg-paper border-t border-border">
          <dl className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <dt className="text-eyebrow text-muted mb-1">Match signals</dt>
              <dd className="text-xs text-ink space-y-0.5 font-mono tabular-nums">
                <div>Text relevance <strong>{Number(r.text_score).toFixed(0)}</strong>/100</div>
                <div>Location <strong>{Number(r.geo_score).toFixed(0)}</strong>/100</div>
                <div>Tags <strong>{Number(r.tag_score).toFixed(0)}</strong>/100</div>
                <div>Availability <strong>{Number(r.avail_score).toFixed(0)}</strong>/100</div>
              </dd>
            </div>
            <div>
              <dt className="text-eyebrow text-muted mb-1">Specialties</dt>
              <dd className="flex flex-wrap gap-1">
                {r.specialties.length === 0 ? (
                  <span className="text-xs text-muted">—</span>
                ) : (
                  r.specialties.map((s) => (
                    <span key={s} className="badge badge-neutral text-xs">
                      {labelFor(s)}
                    </span>
                  ))
                )}
              </dd>
            </div>
            <div>
              <dt className="text-eyebrow text-muted mb-1">Languages</dt>
              <dd className="flex flex-wrap gap-1">
                {r.languages.length === 0 ? (
                  <span className="text-xs text-muted">—</span>
                ) : (
                  r.languages.map((l) => (
                    <span key={l} lang="en" className="lang-chip">
                      {l}
                    </span>
                  ))
                )}
              </dd>
            </div>
            <div>
              <dt className="text-eyebrow text-muted mb-1">Rate</dt>
              <dd className="text-sm text-ink">
                {r.hourly_rate != null ? (
                  <strong>
                    ${Number(r.hourly_rate).toFixed(0)} USD / hour
                  </strong>
                ) : (
                  <span className="text-muted text-xs">Not set</span>
                )}
              </dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              className={`inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm border ${
                saved
                  ? 'bg-primary-bg text-primary border-primary-bg'
                  : 'bg-transparent text-ink border-border-strong hover:bg-surface'
              }`}
            >
              <Heart
                size={14}
                className={saved ? 'fill-primary text-primary' : ''}
                aria-hidden="true"
              />
              {saved ? 'Saved' : 'Save'}
            </button>
            <Link
              href={`/buddies/${r.id}`}
              className="inline-flex items-center justify-center h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              View profile
            </Link>
            <Link
              href={`/chat?buddy=${r.id}`}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-surface"
            >
              <MessageCircle size={14} aria-hidden="true" />
              Message
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
