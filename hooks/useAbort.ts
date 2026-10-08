'use client'

import { useEffect, useRef } from 'react'

/**
 * Per-call AbortController factory that auto-aborts all controllers on
 * unmount AND aborts the previous controller when a new call is made.
 *
 * Pattern: a `load()` function is called from multiple effects (mount,
 * realtime refresh, interval) — each call needs its own AbortController
 * so a slow in-flight request gets cancelled when a newer one starts
 * (otherwise the older response might overwrite the newer state).
 *
 * Usage:
 *   const { makeController } = useAbortFactory()
 *   async function load() {
 *     const ctrl = makeController()
 *     try {
 *       const r = await supabase.from('foo').select('*').abortSignal(ctrl.signal)
 *       if (ctrl.signal.aborted) return  // superseded by a newer load()
 *       setFoo(r.data)
 *     } catch (e) {
 *       if (ctrl.signal.aborted) return
 *       setError(...)
 *     }
 *   }
 *   useEffect(() => { load() }, [deps])
 */
export function useAbortFactory() {
  const activeRef = useRef<AbortController | null>(null)
  const allRef = useRef<Set<AbortController>>(new Set())
  useEffect(() => {
    return () => {
      // Abort everything on unmount so no late response can
      // setState into a now-unmounted closure.
      for (const c of allRef.current) {
        try {
          c.abort()
        } catch {
          /* ignore */
        }
      }
      allRef.current.clear()
      activeRef.current = null
    }
  }, [])
  return {
    /**
     * Returns a fresh AbortController. Any previously-returned active
     * controller is aborted first so only the latest call's response
     * is allowed to write state.
     */
    makeController(): AbortController {
      if (activeRef.current) {
        try {
          activeRef.current.abort()
        } catch {
          /* ignore */
        }
        allRef.current.delete(activeRef.current)
      }
      const ctrl = new AbortController()
      activeRef.current = ctrl
      allRef.current.add(ctrl)
      return ctrl
    },
  }
}
