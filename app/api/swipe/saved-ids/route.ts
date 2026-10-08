import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/swipe/saved-ids
 *
 * Returns the small set `{ id: true }` of buddies the current user
 * has saved (direction='like'). Used by the /browse and /search
 * pages to seed their `savedBuddies` state from the database
 * instead of localStorage, so a new signup that saves a buddy and
 * then refreshes still sees the heart filled in.
 *
 * Wire size is intentionally tiny — the heavy list of saved
 * buddies (with bios, photos, etc.) is served by /api/swipe/liked.
 * The page only needs the IDs to render the toggle on each row.
 */
export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ saved_ids: [] })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  const role = profile?.role
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ saved_ids: [] })
  }

  const { data, error } = await supabase
    .from('swipes')
    .select('target_id')
    .eq('swiper_role', role)
    .eq('swiper_id', user.id)
    .eq('direction', 'like')

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: 500 },
    )
  }

  // Dedupe just in case (UNIQUE on (swiper_role, swiper_id, target_id)
  // should already make this a no-op).
  const seen = new Set<string>()
  const ids: string[] = []
  for (const row of data ?? []) {
    const id = row.target_id as string
    if (id && !seen.has(id)) {
      seen.add(id)
      ids.push(id)
    }
  }

  return NextResponse.json({ saved_ids: ids })
}
