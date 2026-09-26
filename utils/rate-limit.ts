/**
 * IP-based rate limiting (in-memory, single-instance).
 *
 * Production deployments on Vercel serverless can be multi-instance; an
 * in-memory map only protects a single instance. For multi-instance coverage
 * we'd need an edge KV store. For now this gives us a meaningful baseline
 * protection — even if it can be bypassed by forcing a cold start on a
 * different instance, it's still a strong defense against scripted attacks.
 *
 * Usage:
 *   const ok = await rateLimit(ip, 'signup', { windowMs: 60_000, max: 5 })
 *   if (!ok) return new Response('Too Many Requests', { status: 429 })
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitState {
  [key: string]: RateLimitEntry
}

const STATE: RateLimitState = {}

export interface RateLimitOptions {
  /** Sliding window length in milliseconds */
  windowMs: number
  /** Max requests allowed within the window */
  max: number
}

export interface RateLimitResult {
  ok: boolean
  remaining: number
  resetAt: number
}

/**
 * Check and increment the rate-limit counter for a (bucket, key) pair.
 * Returns ok=false when the limit is exceeded.
 */
export function rateLimit(
  key: string,
  bucket: string,
  opts: RateLimitOptions,
): RateLimitResult {
  const compositeKey = `${bucket}:${key}`
  const now = Date.now()
  const entry = STATE[compositeKey]

  if (!entry || entry.resetAt <= now) {
    STATE[compositeKey] = { count: 1, resetAt: now + opts.windowMs }
    return { ok: true, remaining: opts.max - 1, resetAt: now + opts.windowMs }
  }

  entry.count += 1
  if (entry.count > opts.max) {
    return { ok: false, remaining: 0, resetAt: entry.resetAt }
  }

  return { ok: true, remaining: opts.max - entry.count, resetAt: entry.resetAt }
}

/**
 * Best-effort client IP extraction. Prefers cf-connecting-ip (Cloudflare) and
 * x-forwarded-for (Vercel), falling back to x-real-ip.
 */
export function getClientIp(req: Request): string {
  const headers = (req as Request & { headers: Headers }).headers ?? new Headers()
  return (
    headers.get('cf-connecting-ip') ??
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headers.get('x-real-ip') ??
    'unknown'
  )
}

/**
 * Convenience: returns a 429 Response with a Retry-After header.
 */
export function rateLimitResponse(resetAt: number): Response {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfter),
    },
  })
}
