import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * POST /api/swipe
 *
 * Records a swipe action (like or pass) from the currently signed-in
 * user toward another user. Returns 200 with `{ matched: true,
 * match: {...} }` if this swipe completed a mutual like (i.e. the
 * trigger created a matches row). Otherwise returns `{ matched:
 * false }`.
 *
 * Body: { target_id: uuid, direction: 'like' | 'pass' }
 *
 * The server is the source of truth for swiper_role: it reads the
 * profile row and never trusts the client. The UNIQUE constraint on
 * (swiper_role, swiper_id, target_id) makes repeat swipes a no-op.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as
    | { target_id?: string; direction?: string }
    | null

  const targetId = body?.target_id
  const direction = body?.direction

  if (!targetId || typeof targetId !== 'string') {
    return NextResponse.json({ error: 'target_id is required' }, { status: 400 })
  }
  if (direction !== 'like' && direction !== 'pass') {
    return NextResponse.json(
      { error: "direction must be 'like' or 'pass'" },
      { status: 400 },
    )
  }
  if (targetId === user.id) {
    return NextResponse.json(
      { error: 'cannot swipe on yourself' },
      { status: 400 },
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const role = profile?.role
  if (role !== 'tourist' && role !== 'buddy') {
    return NextResponse.json({ error: 'unsupported role' }, { status: 403 })
  }

  // Upsert so that re-swiping (e.g. switching from pass to like) is
  // a single round-trip. The UNIQUE index handles uniqueness.
  const { data: swipe, error: swipeError } = await supabase
    .from('swipes')
    .upsert(
      {
        swiper_role: role,
        swiper_id: user.id,
        target_id: targetId,
        direction,
      },
      { onConflict: 'swiper_role,swiper_id,target_id' },
    )
    .select('id, direction, created_at')
    .single()

  if (swipeError) {
    return NextResponse.json(
      { error: swipeError.message, code: swipeError.code },
      { status: 500 },
    )
  }

  // If the new swipe is a buddy like, the trigger creates a match
  // (if the tourist already liked the buddy). We re-read matches to
  // surface the conversation trigger outcome to the client.
  let match: {
    id: string
    tourist_id: string
    buddy_id: string
    created_at: string
  } | null = null

  if (role === 'buddy' && direction === 'like') {
    const { data: found, error: matchError } = await supabase
      .from('matches')
      .select('id, tourist_id, buddy_id, created_at')
      .or(`tourist_id.eq.${user.id},buddy_id.eq.${user.id}`)
      .or(`tourist_id.eq.${targetId},buddy_id.eq.${targetId}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (matchError) {
      // Don't fail the whole call — the trigger may not have completed
      // yet. The client can fall back to a separate matches refresh.
      console.warn('[swipe] match lookup failed', matchError)
    } else {
      match = found ?? null
    }
  } else if (role === 'tourist' && direction === 'like') {
    // If the buddy has already liked back, the match was already
    // created by an earlier trigger. Look it up to tell the client.
    const { data: found } = await supabase
      .from('matches')
      .select('id, tourist_id, buddy_id, created_at')
      .eq('tourist_id', user.id)
      .eq('buddy_id', targetId)
      .maybeSingle()
    match = found ?? null
  }

  return NextResponse.json({
    swipe,
    matched: !!match,
    match,
  })
}
