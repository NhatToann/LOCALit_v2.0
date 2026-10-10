/**
 * Programmatic navigation that actually works.
 *
 * WHY THIS EXISTS (2026-10-10)
 * -----------------------------
 * `router.push()` from `next/navigation` is a no-op on this build. The
 * click is received, the handler runs to completion, the popover closes,
 * `history.pushState` is never called, no RSC request is issued, and the
 * URL never changes. Measured on production: clicking a notification row
 * produced zero `framenavigated` events and zero `pushState` calls,
 * while a plain `<a href>` injected at runtime navigated correctly in
 * the same session with the same cookie.
 *
 * `components/ui/Link.tsx` already documents this and works around it
 * by rendering a real `<a>`. The same workaround is needed here, but an
 * imperatively created anchor has to be appended to the document before
 * `.click()` will navigate in every browser.
 *
 * A plain anchor is also the *better* UX here: a full document load is
 * ~200ms from the edge, and it guarantees the destination page's server
 * components re-run against fresh data. `router.push` with a cached RSC
 * payload is what left the connect button stuck on its old state.
 *
 * WHY A NAVIGATOR INSTANCE INSTEAD OF `window.location.assign`
 * `location.assign` is synchronous and cannot be cancelled; the
 * navigator defers the actual assignment to a microtask, so callers that
 * need to do a little more work right after (fire an analytics event,
 * close a sheet) are not fighting the browser mid-navigation.
 */

/** Options mirroring the small subset of `router.push` this app uses. */
interface NavigateOptions {
  /** Replace the current entry instead of pushing a new one. */
  replace?: boolean
  /** Scroll to the top after navigating. Default true. */
  scroll?: boolean
}

/**
 * Navigate to an absolute path (`/chat?with=<id>`) using a real anchor.
 *
 * Same-origin by construction: `href` is resolved against the current
 * document, so there is no open-redirect surface here.
 */
export function navigate(href: string, options: NavigateOptions = {}): void {
  if (typeof window === 'undefined') return

  const target = new URL(href, window.location.href)
  if (target.origin !== window.location.origin) {
    // Cross-origin: let the browser handle it as a normal document load.
    window.location.assign(target.href)
    return
  }

  // Already on this route — nothing to do. Bailing out avoids a pointless
  // RSC refetch and, more importantly, avoids a reload when a user taps
  // the same notification twice in a row.
  const samePath = target.pathname === window.location.pathname
  const sameQuery = target.search === window.location.search
  if (samePath && sameQuery) return

  const anchor = document.createElement('a')
  anchor.href = target.href
  anchor.rel = 'noreferrer'
  if (options.replace) {
    // `location.replace` is the imperative equivalent of router.replace.
    window.history.replaceState(null, '', target.href)
  }
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  if (options.scroll !== false) {
    // A full document load restores the previous scroll offset. Reset it
    // after the new document is painted, matching what `router.push`
    // would have done.
    requestAnimationFrame(() => window.scrollTo(0, 0))
  }
}

/**
 * Variant for absolute URLs (e.g. an email link that must resolve against
 * one of the canonical origins rather than whatever hash URL the user is on).
 */
export function navigateToOrigin(origin: string, path: string): void {
  if (typeof window === 'undefined') return
  window.location.assign(new URL(path, origin).href)
}

/**
 * Rewrite the current URL without re-running the route.
 *
 * WHY THIS EXISTS (2026-10-10)
 * Several pages read a one-shot query param on mount (`?conv=`,
 * `?buddy=`, `?call=`) and then want to strip it so a refresh does not
 * re-trigger the same side effect. The original code called
 * `router.replace()` for that, which is a dead no-op here — so the param
 * stuck in the address bar and every refresh re-fired the consumed
 * effect.
 *
 * Deliberately NOT `navigate()`: a full document load here would throw
 * away the conversation the user just opened.
 */
export function replaceUrl(path: string): void {
  if (typeof window === 'undefined') return
  const target = new URL(path, window.location.href)
  if (target.origin !== window.location.origin) return
  window.history.replaceState(null, '', target.href)
}