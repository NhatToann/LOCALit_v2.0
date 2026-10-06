// OSM Nominatim result cache — 7 day TTL, SHA-1 keyed, stored in localStorage.
// All errors swallowed (localStorage may be disabled, quota exceeded, etc).
const STORAGE_KEY = 'localit:osm:cache:v1'
const TTL_MS = 7 * 24 * 60 * 60 * 1000

type CacheEntry<T> = { ts: number; data: T }

function read(): Record<string, CacheEntry<unknown>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, CacheEntry<unknown>>
  } catch {
    return {}
  }
}

function write(map: Record<string, CacheEntry<unknown>>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    // quota or disabled — silently drop
  }
}

async function sha1(input: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  // Fallback: simple non-cryptographic hash, unique enough for cache key.
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0
  }
  return `f${(h >>> 0).toString(16)}`
}

export async function cachedFetch<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const k = await sha1(key)
  const map = read()
  const now = Date.now()
  const hit = map[k]
  if (hit && now - hit.ts < TTL_MS) {
    return hit.data as T
  }
  const data = await loader()
  map[k] = { ts: now, data }
  write(map)
  return data
}

export function clearOsmCache(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
