/**
 * URL search-param contract for /search.
 *
 * The page is a Server Component that reads these from
 * `searchParams` and passes them to the search_buddies RPC.
 * The SearchContent client component re-uses the same shape to
 * sync state back to the URL via router.replace().
 */

export type SearchSort = 'match' | 'distance' | 'rating'

export interface BuddySearchParams {
  q?: string
  lang?: string
  tag?: string
  place?: string
  radius?: number
  sort?: SearchSort
  page?: number
  /** Manual lat/lng anchor (overrides `place` if both provided). */
  lat?: number
  lng?: number
}

export const SORT_OPTIONS: readonly SearchSort[] = ['match', 'distance', 'rating']
export const DEFAULT_RADIUS_KM = 50
export const PAGE_SIZE = 20

function first(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0]
  return v
}

function asInt(v: string | undefined): number | undefined {
  if (v == null) return undefined
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

function asFloat(v: string | undefined): number | undefined {
  if (v == null) return undefined
  const n = Number.parseFloat(v)
  return Number.isFinite(n) ? n : undefined
}

export function parseSearchParams(
  input: Record<string, string | string[] | undefined>,
): BuddySearchParams {
  const out: BuddySearchParams = {}
  const q = first(input.q)
  if (q && q.trim()) out.q = q.trim()
  const lang = first(input.lang)
  if (lang && lang.trim()) out.lang = lang.trim()
  const tag = first(input.tag)
  if (tag && tag.trim()) out.tag = tag.trim()
  const place = first(input.place)
  if (place && place.trim()) out.place = place.trim()
  const radius = asInt(first(input.radius))
  if (typeof radius === 'number') out.radius = Math.min(Math.max(radius, 1), 50)
  const sort = first(input.sort) as SearchSort | undefined
  if (sort && (SORT_OPTIONS as readonly string[]).includes(sort)) out.sort = sort
  const page = asInt(first(input.page))
  if (typeof page === 'number' && page >= 1) out.page = page
  const lat = asFloat(first(input.lat))
  const lng = asFloat(first(input.lng))
  if (typeof lat === 'number') out.lat = lat
  if (typeof lng === 'number') out.lng = lng
  return out
}

export function serializeSearchParams(p: BuddySearchParams): URLSearchParams {
  const sp = new URLSearchParams()
  if (p.q) sp.set('q', p.q)
  if (p.lang) sp.set('lang', p.lang)
  if (p.tag) sp.set('tag', p.tag)
  if (p.place) sp.set('place', p.place)
  if (typeof p.radius === 'number' && p.radius !== DEFAULT_RADIUS_KM) sp.set('radius', String(p.radius))
  if (p.sort && p.sort !== 'match') sp.set('sort', p.sort)
  if (typeof p.page === 'number' && p.page > 1) sp.set('page', String(p.page))
  if (typeof p.lat === 'number') sp.set('lat', String(p.lat))
  if (typeof p.lng === 'number') sp.set('lng', String(p.lng))
  return sp
}

/**
 * Build a link to /search with a patch over the current params.
 * Removes keys when set to undefined.
 */
export function buildSearchLink(
  patch: Partial<BuddySearchParams>,
  current: BuddySearchParams = {},
  base = '/search',
): string {
  const next: BuddySearchParams = { ...current, ...patch }
  // Drop undefineds and empty strings
  for (const k of Object.keys(next) as (keyof BuddySearchParams)[]) {
    if (next[k] === undefined || next[k] === '' || next[k] === null) {
      delete next[k]
    }
  }
  // Reset page when a filter changes (unless the patch is for page itself)
  if (!('page' in patch) && next.page && next.page > 1) next.page = 1
  const qs = serializeSearchParams(next).toString()
  return qs ? `${base}?${qs}` : base
}
