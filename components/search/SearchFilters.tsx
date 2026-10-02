'use client'

/**
 * SearchFilters — sidebar of facet checkboxes driven by the
 * search_buddies_facets RPC. Toggling a facet calls back to
 * SearchContent which updates the URL.
 *
 * Facets are pass-through counts; clicking a tag/lang/city is an
 * additive filter (one tag, one lang, one city at a time for v1).
 */

import { Check, X } from 'lucide-react'
import type { SearchFacets } from '@/lib/search/types'
import type { BuddySearchParams } from '@/lib/search/searchParams'

interface Props {
  facets: SearchFacets | null
  current: BuddySearchParams
  onChange: (patch: Partial<BuddySearchParams>) => void
}

const CANONICAL_SPECIALTIES = [
  'street-food',
  'history',
  'nightlife',
  'photography',
  'shopping',
  'nature',
  'wellness',
  'language-exchange',
  'motorbike-tours',
  'fishing',
  'cooking-class',
  'artisan-craft',
]

const LANG_OPTIONS = [
  'English',
  'Vietnamese',
  'Japanese',
  'Korean',
  'French',
  'Mandarin',
  'Russian',
  'Spanish',
  'German',
]

const RADIUS_OPTIONS = [1, 2, 5, 10, 25, 50]

function countFor(
  facets: SearchFacets | null,
  field: 'specialties' | 'languages' | 'cities',
  value: string,
): number {
  if (!facets) return 0
  return facets[field]?.find((f) => f.value === value)?.count ?? 0
}

function facetValues(facets: SearchFacets | null, field: 'specialties' | 'languages' | 'cities') {
  if (!facets) return [] as Array<{ value: string; count: number }>
  return facets[field] ?? []
}

function labelFor(value: string): string {
  return value
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function SearchFilters({ facets, current, onChange }: Props) {
  const specValues = facetValues(facets, 'specialties')
  const langValues = facetValues(facets, 'languages')
  const cityValues = facetValues(facets, 'cities')
  const totalCount = facets?.total ?? 0

  return (
    <div className="border border-border rounded-sm bg-surface p-4 sticky top-4">
      <h2 className="text-sm font-semibold text-ink mb-3">Filters</h2>
      <p className="text-xs text-muted mb-4" aria-live="polite">
        {totalCount} matching {totalCount === 1 ? 'buddy' : 'buddies'}
      </p>

      {/* Availability */}
      <fieldset className="mb-5">
        <legend className="text-eyebrow text-muted mb-2">Availability</legend>
        <label className="flex items-center gap-2 text-sm py-1 cursor-pointer">
          <input
            type="checkbox"
            checked={current.tag === 'available-now' || current.sort === 'match'}
            onChange={() => {
              /* Match sort already includes availability boost;
                 keep this as a future visual toggle. */
            }}
            className="accent-primary"
            disabled
          />
          <span className="text-muted">Available now (auto-included)</span>
        </label>
      </fieldset>

      {/* Specialties */}
      <fieldset className="mb-5">
        <legend className="text-eyebrow text-muted mb-2">Specialty</legend>
        <ul className="space-y-1">
          {CANONICAL_SPECIALTIES.map((s) => {
            const count = countFor(facets, 'specialties', s)
            const active = current.tag === s
            // Hide zero-count options after the first non-zero row
            // so the list is not always 12 long.
            if (facets && count === 0 && specValues.length > 0) return null
            return (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onChange({ tag: active ? undefined : s })}
                  aria-pressed={active}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm border ${
                    active
                      ? 'bg-primary-bg text-primary border-primary-bg'
                      : 'bg-transparent text-ink border-transparent hover:bg-paper'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {active ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <span className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span className="truncate">{labelFor(s)}</span>
                  </span>
                  <span className="text-xs text-muted font-mono">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      {/* Languages */}
      <fieldset className="mb-5">
        <legend className="text-eyebrow text-muted mb-2">Language</legend>
        <ul className="space-y-1">
          {LANG_OPTIONS.map((l) => {
            const count = countFor(facets, 'languages', l)
            const active = current.lang === l
            if (facets && count === 0 && langValues.length > 0) return null
            return (
              <li key={l}>
                <button
                  type="button"
                  onClick={() => onChange({ lang: active ? undefined : l })}
                  aria-pressed={active}
                  lang="en"
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm rounded-sm border ${
                    active
                      ? 'bg-primary-bg text-primary border-primary-bg'
                      : 'bg-transparent text-ink border-transparent hover:bg-paper'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {active ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <span className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    <span className="truncate">{l}</span>
                  </span>
                  <span className="text-xs text-muted font-mono">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      {/* Radius */}
      <fieldset className="mb-5">
        <legend className="text-eyebrow text-muted mb-2">Radius</legend>
        <ul className="flex flex-wrap gap-1.5">
          {RADIUS_OPTIONS.map((r) => {
            const active = (current.radius ?? 50) === r
            return (
              <li key={r}>
                <button
                  type="button"
                  onClick={() => onChange({ radius: active ? undefined : r, place: undefined, lat: undefined, lng: undefined })}
                  aria-pressed={active}
                  className={`h-7 px-2.5 text-xs font-medium rounded-pill border ${
                    active
                      ? 'bg-primary text-paper border-primary'
                      : 'bg-transparent text-muted border-border hover:border-border-strong'
                  }`}
                >
                  {r >= 50 ? 'Any' : `${r} km`}
                </button>
              </li>
            )
          })}
        </ul>
      </fieldset>

      {/* Active filters as removable chips */}
      <ActiveChips current={current} onChange={onChange} />
    </div>
  )
}

function ActiveChips({
  current,
  onChange,
}: {
  current: BuddySearchParams
  onChange: (patch: Partial<BuddySearchParams>) => void
}) {
  const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
  if (current.q) {
    chips.push({ key: 'q', label: `q: "${current.q}"`, onRemove: () => onChange({ q: undefined }) })
  }
  if (current.tag) {
    chips.push({
      key: 'tag',
      label: labelFor(current.tag),
      onRemove: () => onChange({ tag: undefined }),
    })
  }
  if (current.lang) {
    chips.push({
      key: 'lang',
      label: current.lang,
      onRemove: () => onChange({ lang: undefined }),
    })
  }
  if (current.place) {
    chips.push({
      key: 'place',
      label: `near ${current.place}`,
      onRemove: () => onChange({ place: undefined }),
    })
  }
  if (typeof current.radius === 'number' && current.radius < 50) {
    chips.push({
      key: 'radius',
      label: `Within ${current.radius} km`,
      onRemove: () => onChange({ radius: undefined }),
    })
  }
  if (typeof current.lat === 'number' && typeof current.lng === 'number') {
    chips.push({
      key: 'anchor',
      label: 'Custom location',
      onRemove: () => onChange({ lat: undefined, lng: undefined }),
    })
  }
  if (chips.length === 0) return null
  return (
    <div>
      <p className="text-eyebrow text-muted mb-2">Active</p>
      <ul className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={c.onRemove}
              className="inline-flex items-center gap-1 h-7 px-2 text-xs font-medium rounded-pill border border-border-strong bg-paper text-ink hover:border-primary hover:text-primary"
            >
              <span>{c.label}</span>
              <X size={12} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
