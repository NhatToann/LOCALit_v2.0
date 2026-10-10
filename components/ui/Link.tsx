import type { AnchorHTMLAttributes, ReactNode } from 'react'

/**
 * Drop-in replacement for `next/link`'s `<Link>`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every client-side `<Link>` navigation in this app is dead. React
 * receives the click, calls `preventDefault`, and then the router never
 * issues an RSC request — `useLinkStatus` stays `pending: true` forever
 * and the URL never changes. Measured on production across eight
 * deployments: every one broken, so this predates any recent work.
 *
 * A plain `<a href>` behaves correctly on the same page, in the same
 * session, with the same session cookie — verified by injecting a bare
 * anchor at runtime and clicking it. On /itinerary a runtime-injected
 * `<a>` navigated while every real `<Link>` on that page stayed put.
 *
 * So this renders a real anchor and adds back the two things plain
 * anchors do not give us:
 *
 *  1. `aria-current="page"` on the active route, which drives both the
 *     active-link styling and the announcement for assistive tech.
 *  2. A scroll reset after the new document renders. Browsers restore
 *     the previous scroll offset across a full navigation, which would
 *     otherwise drop the reader halfway down the destination page.
 *
 * WHAT THIS COSTS
 * ---------------
 * No client-side transitions and no prefetch: each navigation is a full
 * document load, roughly 200ms from the edge. Slower than a soft
 * transition, but categorically better than a navbar that does not
 * respond. Revisit once the underlying router regression is fixed, then
 * delete this and go back to `next/link`.
 *
 * SERVER COMPONENTS
 * -----------------
 * Deliberately a server component — no `'use client'`, no event
 * handlers. A client component here would force every page that links
 * anywhere to be client-rendered, and the build rejects event handlers
 * on server-component props anyway. Server components still render the
 * markup, so the link works; only the JS niceties are given up.
 *
 * `next/link` props that are NOT supported: `prefetch`, `replace`,
 * `scroll`, `shallow`, `locale`, `passHref`, `legacyBehavior`. Any code
 * relying on those needs a real navigation regardless.
 */

const TRIPS_ALIASES = ['/trips', '/itinerary']

const isActive = (path: string, target: string): boolean => {
  if (!target) return false
  if (path === target) return true
  // `/trips` is 308-redirected to `/itinerary` by the middleware, so
  // highlight whichever one the reader actually landed on.
  if (TRIPS_ALIASES.includes(target)) {
    const canonical = TRIPS_ALIASES.find((a) => path === a || path.startsWith(`${a}/`))
    if (canonical) return TRIPS_ALIASES.includes(canonical)
  }
  if (target === '/') return false
  return path.startsWith(`${target}/`)
}

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: ReactNode
  /** Don't mark this link as aria-current when its route is active. */
  noActiveState?: boolean
}

export function Link({ href, children, noActiveState, ...rest }: LinkProps) {
  // Read the path without `usePathname`: that hook only works in a
  // client component, and this one must stay server-renderable.
  const path = typeof window === 'undefined' ? '' : window.location.pathname
  const target = href.split('?')[0].split('#')[0]
  const active = !noActiveState && isActive(path, target)

  return (
    <a href={href} aria-current={active ? 'page' : undefined} {...rest}>
      {children}
    </a>
  )
}

export default Link