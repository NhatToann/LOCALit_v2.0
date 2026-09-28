'use client';

import { useLinkStatus } from 'next/link';

/**
 * Tiny inline indicator shown next to a nav link while Next.js is fetching
 * the next route's RSC payload. Without this, the user clicks a nav button,
 * the page freezes for ~300-800ms (TTFB Asia + RSC stream), and the click
 * feels "dead".
 *
 * Per Next.js 16 docs (useLinkStatus), the pending state only fires when
 * prefetching is disabled or the destination route is dynamic and hasn't
 * finished prefetching — which is exactly our authenticated routes
 * (Cache-Control: no-store, so no browser-level cache).
 *
 * The element is fixed-size to avoid layout shifts, with opacity 0 by
 * default and a 100ms animation-delay so it doesn't flash on fast nav.
 */
export function NavHint() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={`nav-hint ${pending ? 'is-pending' : ''}`}
    />
  );
}
