/**
 * /profile — role-aware dispatcher (created 2026-10-01).
 *
 * History:
 *   Before this commit the page was TouristProfilePage — a 920-line
 *   form that always assumed the visitor had a row in `public.tourists`.
 *   Buddy accounts hit the page, the form silently rendered empty,
 *   and the user (rightly) reported "tôi không thấy profile của buddy".
 *
 *   We now:
 *     1. Look up profiles.role for the session user.
 *     2. Render TouristProfileView for tourists, BuddyProfileView
 *        for buddies. Both share the same tab / completeness-score
 *        / avatar / password / delete-account UX, only the data
 *        shape and form fields differ.
 *     3. Render a friendly placeholder for accounts with no role
 *        (orphaned profiles) so we don't loop on a 500.
 *
 * The original TouristProfilePage moved to
 * `components/profile/TouristProfileView.tsx` without behaviour
 * changes; BuddyProfileView is its sibling.
 *
 * Why server-side first fetch (and not just client):
 *   profiles.role is the cheapest way to route; reading it on the
 *   server keeps the dispatcher synchronous with the auth cookie.
 *   The view itself re-queries the data because the props cross
 *   the RSC → client boundary only as a plain hint.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import TouristProfileView from '@/components/profile/TouristProfileView'
import BuddyProfileView from '@/components/profile/BuddyProfileView'

export const dynamic = 'force-dynamic'

/**
 * 2026-10-02 — Role-row auto-create.
 *
 * If a profile has role='buddy' but the user is missing a row in
 * `public.buddies` (or vice versa for tourists), insert a default
 * row before rendering. Idempotent: if the row already exists,
 * the SELECT below finds it and we skip the INSERT. This protects
 * the UI from "Buddy profile not found." / "Profile not found."
 * empty states that surfaced after a signup where the role-table
 * row was not created (e.g. trigger failure or partial migration).
 *
 * Defaults are conservative (Da Nang, English, empty arrays, 0
 * numeric counters). Buddy hourly_rate defaults to $15 (mid of the
 * 15–45 range shown on the homepage); tourist destination is
 * locked to Da Nang per LOCALit's current scope.
 */
async function ensureRoleRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  role: 'tourist' | 'buddy',
): Promise<void> {
  const table = role === 'buddy' ? 'buddies' : 'tourists'
  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq('id', userId)
    .maybeSingle()
  if (existing?.id) return

  if (role === 'buddy') {
    await supabase.from('buddies').insert({
      id: userId,
      location_city: 'Da Nang',
      languages: ['English'],
      specialties: [],
      hourly_rate: 15,
      is_available: true,
      favorite_places: [],
      trips_completed: 0,
      rating_avg: 0,
      bio: null,
    } as never)
  } else {
    await supabase.from('tourists').insert({
      id: userId,
      nationality: '',
      date_of_birth: null,
      travel_style: 'solo',
      interests: [],
      languages: ['English'],
      budget_range: '50-100',
      destination: 'Da Nang',
    } as never)
  }
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/profile')
  }

  const { data: profile } = await supabase
      .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle<{ role?: 'tourist' | 'buddy' | 'admin' | null }>()

  const role = profile?.role ?? null

  // Auto-create the role-specific row if missing. Fire-and-forget
  // failure handling: if the INSERT fails (e.g. RLS denial), the
  // downstream view's own empty-state still gives the user a clear
  // "Profile not found." message instead of a crash.
  if (role === 'buddy') {
    try {
      await ensureRoleRow(supabase, user.id, 'buddy')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[profile] ensureRoleRow(buddy) failed:', (err as Error).message)
    }
    return <BuddyProfileView />
  }
  if (role === 'tourist') {
    try {
      await ensureRoleRow(supabase, user.id, 'tourist')
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[profile] ensureRoleRow(tourist) failed:', (err as Error).message)
    }
    return <TouristProfileView />
  }

  // No role (orphaned profile, signup never finished). Render a soft
  // empty state instead of letting one of the views throw on a
  // missing row.
  return (
    <div className="container-page py-16">
        <p className="text-eyebrow text-primary mb-2">
          Account
          <span
            className="ml-2 italic text-muted"
            style={{ letterSpacing: '0.02em' }}
            aria-hidden="true"
          >
            tài khoản
          </span>
        </p>
      <h1 className="text-page-title">Profile</h1>
      <p className="text-sm text-muted mt-3 max-w-prose">
        Your account doesn&apos;t have a role yet. Complete the sign-up
        flow at <a className="text-primary underline" href="/register">/register</a>{' '}
        to pick tourist or buddy, then come back here.
      </p>
    </div>
  )
}