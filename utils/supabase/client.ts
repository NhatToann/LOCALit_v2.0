/**
 * Public browser-side Supabase entry point.
 *
 * Kept as a thin re-export of the singleton `createClient` defined in
 * `./auth.ts`. The previous implementation defined a fresh client per
 * call — see RAM OPTIMIZATION comment in `./auth.ts` for context.
 *
 * Re-exports the session readers and the realtime-auth binder so any
 * module that imported them from the old `./client.ts` keeps working.
 */
export { createClient } from './auth'
export { readAccessToken, bindRealtimeAuth } from './client-binding'
export type { BrowserSupabaseClient } from './client-binding'