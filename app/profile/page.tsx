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

  if (role === 'buddy') {
    return <BuddyProfileView />
  }
  if (role === 'tourist') {
    return <TouristProfileView />
  }

  // No role (orphaned profile, signup never finished). Render a soft
  // empty state instead of letting one of the views throw on a
  // missing row.
  return (
    <div className="container-page py-16">
      <p className="text-eyebrow text-primary mb-2">Account</p>
      <h1 className="text-page-title">Profile</h1>
      <p className="text-sm text-muted mt-3 max-w-prose">
        Your account doesn&apos;t have a role yet. Complete the sign-up
        flow at <a className="text-primary underline" href="/register">/register</a>{' '}
        to pick tourist or buddy, then come back here.
      </p>
    </div>
  )
}