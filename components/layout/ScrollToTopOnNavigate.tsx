'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Sends the reader back to the top on every fresh page load and route
 * change.
 *
 * Chrome keeps `history.scrollRestoration = 'auto'` by default, which
 * restores the previous scroll offset after a reload. On the long
 * scrolling pages here (homepage, /map) that meant hitting F5 while
 * reading the footer dropped you straight back into the footer, with no
 * way to tell that the reload happened at all. Restoring that offset is
 * only ever helpful for a paginated feed that keeps its place — for
 * ordinary pages it just looks like the page loaded broken.
 *
 * Two separate cases are handled:
 *
 * 1. Reload — `scrollRestoration` is set to `'manual'` and we jump to
 *    the top ourselves, on the next frame, once the document has a real
 *    height. Doing it in an effect rather than during render keeps the
 *    DOM untouched while React is reconciling.
 *
 * 2. Client-side navigation — Next.js preserves scroll on back/forward
 *    by design and resets it on a fresh push, but the reset happens
 *    before client components have laid out. `/chat` and `/dashboard`
 *    both fetch their data after mount, so the document is still short
 *    at that moment and the reset is clamped to 0. We redo the reset
 *    after the layout settles.
 *
 * The `scroll-behavior: smooth` on `html` would turn an instant jump
 * into an animation the user did not ask for, so `behavior: 'instant'`
 * is passed explicitly.
 */
export default function ScrollToTopOnNavigate() {
  const pathname = usePathname()

  // 1. Reload.
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
  }, [])

  // 2. Route change, after the new page has laid out. The `requestAnimationFrame`
  //    deferral matters: on the data-driven pages the first paint is a
  //    skeleton, so an immediate reset is clamped by a document that is
  //    not tall enough yet.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    })
    return () => cancelAnimationFrame(frame)
  }, [pathname])

  return null
}