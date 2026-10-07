'use client'

/**
 * Paste-safe input helpers (2026-10-07).
 *
 * Why this exists:
 *   React's `onChange` is supposed to fire on every user-driven value change,
 *   including paste, autofill, and password-manager fills. In practice, on
 *   a few browser / OS combinations (and on programmatic DOM `value=` sets
 *   used by E2E tools and some 1Password builds), the `change` event never
 *   fires — the DOM value changes but the controlled component stays empty.
 *
 * The fix: use a native `input` listener as a safety net. `input` fires
 *   AFTER the DOM value changes, regardless of how it got there. The
 *   handler reads the current value out of the input and pushes it to React
 *   state via the same setter the keystroke `onChange` would call.
 *
 * Usage:
 *   <input
 *     value={email}
 *     onChange={(e) => setEmail(e.target.value)}
 *     onInput={syncValue(setEmail)}
 *     ...
 *   />
 *
 * `onChange` still runs on every keystroke (we don't replace it). `onInput`
 *   only kicks in when `onChange` somehow didn't, so the two work together.
 */

import type { ChangeEvent, Dispatch, SetStateAction, SyntheticEvent } from 'react'

/**
 * Returns a stable `onInput` handler that pushes the current input value
 * to a React state setter. The setter can be either:
 *   - A `Dispatch<SetStateAction<string>>` (a typical `useState` setter), or
 *   - A plain `(value: string) => void` callback.
 *
 * Memoize the result with `useCallback` if you pass it as a prop, or
 * just use `syncValue(setX)` inline.
 */
export function syncValue(
  setter: Dispatch<SetStateAction<string>> | ((value: string) => void),
) {
  return function onInput(e: SyntheticEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    const raw = e.currentTarget.value
    if (typeof setter === 'function') {
      // Both Dispatch<SetStateAction<string>> and (v: string) => void have
      // the same call signature `(value: string) => void`, but TS can't
      // always infer it when the param is overloaded. The cast through
      // unknown is the standard escape hatch.
      ;(setter as (v: string) => void)(raw)
    }
  }
}

/**
 * For numeric inputs (type=number). Reads the DOM value and converts to a
 * number — but preserves `''` as-is so empty state doesn't become `0`.
 */
export function syncNumberValue(
  setter: Dispatch<SetStateAction<string>>,
) {
  return function onInput(e: SyntheticEvent<HTMLInputElement>) {
    setter(e.currentTarget.value)
  }
}

/**
 * Convenience: paste a `name` into the change/input event handlers for a
 * form-field-style update. Returns the same shape that `onChange` does.
 *
 *   <input
 *     onChange={(e) => handle('email', e.target.value)}
 *     onInput={(e) => handle('email', e.currentTarget.value)}
 *   />
 */
export function fieldChange<K extends string>(
  setForm: Dispatch<SetStateAction<Record<K, string>>>,
  key: K,
) {
  return function handle(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((p) => ({ ...p, [key]: e.target.value }))
  }
}
