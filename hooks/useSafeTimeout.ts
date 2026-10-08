'use client'

import { useEffect, useRef } from 'react'

/**
 * Track the latest setTimeout handle so the next call auto-cancels the
 * previous one and the effect cleanup clears any pending timer.
 *
 * Pattern: "show toast for 3s, then clear". Without this hook, calling
 * `setSavedAt(now)` twice in 100ms schedules two `setSavedAt(null)`
 * timers; the first fires 3s after the FIRST call, not 3s after the
 * SECOND. That's why toasts sometimes linger after the user has already
 * triggered a new action. With this hook, the new call cancels the old
 * one — the timer fires exactly 3s after the last action.
 *
 * Also survives unmount: the returned cleanup (registered with useEffect)
 * clears the handle if the component unmounts before the timer fires,
 * preventing "setState on unmounted component" warnings.
 *
 * Usage:
 *   const { schedule } = useSafeTimeout()
 *   schedule(() => setSavedAt(null), 3000)
 */
export function useSafeTimeout() {
  const handleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    return () => {
      if (handleRef.current !== null) {
        clearTimeout(handleRef.current)
        handleRef.current = null
      }
    }
  }, [])
  return {
    schedule(fn: () => void, ms: number): void {
      if (handleRef.current !== null) {
        clearTimeout(handleRef.current)
      }
      handleRef.current = setTimeout(() => {
        handleRef.current = null
        fn()
      }, ms)
    },
    clear(): void {
      if (handleRef.current !== null) {
        clearTimeout(handleRef.current)
        handleRef.current = null
      }
    },
  }
}
