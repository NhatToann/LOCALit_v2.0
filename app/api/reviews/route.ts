import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * Profile reviews — POST (write/edit) and DELETE (retract).
 *
 * A review needs no trip: it needs the two people to have actually met.
 * The 2026-10-10 migration made `trip_id` nullable and added
 * `connection_id`, plus the INSERT/UPDATE/DELETE policies this route
 * depends on.
 *
 * Authorization
 * -------------
 * You may only review someone you have an ACCEPTED connection with.
 * That gate is the whole point: without it anyone signed in could flood
 * any profile with fake 5-star ratings. The DB policy re-checks the
 * same condition (defense in depth), and we check here too so the user
 * gets a readable 403 instead of a raw Postgres error.
 */

const RATING_MIN = 1
const RATING_MAX = 5
const COMMENT_MAX = 1000

/**
 * Find the accepted connection between the caller and another user.
 * Reads `requester_id` / `recipient_id` — the source of truth per the
 * connection migration; `tourist_id` / `buddy_id` are legacy denormalized
 * fallbacks that are not populated on every row.
 */
async function findAcceptedLink(
  supabase: Awaited<ReturnType<typeof createClient>>,
  callerId: string,
  otherId: string,
) {
  const { data, error } = await supabase
    .from('connections')
    .select('id')
    .eq('status', 'accepted')
    .or(
      `and(requester_id.eq.${callerId},recipient_id.eq.${otherId}),` +
        `and(requester_id.eq.${otherId},recipient_id.eq.${callerId})`,
    )
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return (data as { id: string } | null) ?? null
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in to leave a review.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as
    | { reviewee_id?: string; rating?: number; comment?: string; connection_id?: string }
    | null

  const revieweeId = body?.reviewee_id
  const rating = body?.rating
  const comment = body?.comment

  if (!revieweeId || typeof revieweeId !== 'string') {
    return NextResponse.json({ error: 'reviewee_id is required.' }, { status: 400 })
  }
  if (revieweeId === user.id) {
    return NextResponse.json({ error: 'You cannot review your own profile.' }, { status: 400 })
  }
  if (
    typeof rating !== 'number' ||
    !Number.isInteger(rating) ||
    rating < RATING_MIN ||
    rating > RATING_MAX
  ) {
    return NextResponse.json(
      { error: `Rating must be a whole number from ${RATING_MIN} to ${RATING_MAX}.` },
      { status: 400 },
    )
  }
  if (typeof comment === 'string' && comment.length > COMMENT_MAX) {
    return NextResponse.json(
      { error: `Comment must be ${COMMENT_MAX} characters or fewer.` },
      { status: 400 },
    )
  }

  let link: { id: string } | null
  try {
    link = await findAcceptedLink(supabase, user.id, revieweeId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
  if (!link) {
    return NextResponse.json(
      { error: 'You can only review someone you have connected with.' },
      { status: 403 },
    )
  }

  // Clear the text rather than storing '' so the UI never renders a
  // blank comment block.
  const trimmed =
    typeof comment === 'string' && comment.trim().length > 0 ? comment.trim() : null

  // The unique index on (reviewer_id, reviewee_id) makes this an edit
  // when a review already exists, so "leave" and "change" share a path.
  const { data, error } = await supabase
    .from('reviews')
    .upsert(
      {
        reviewer_id: user.id,
        reviewee_id: revieweeId,
        rating,
        comment: trimmed,
        trip_id: null,
        connection_id: body?.connection_id ?? link.id,
      },
      { onConflict: 'reviewer_id,reviewee_id' },
    )
    .select('id, rating, comment, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'You already reviewed this profile.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, review: data }, { status: 201 })
}

/**
 * Retract a review you left. There is no `id` parameter — the delete is
 * scoped to the caller's own row, so there is nothing to tamper with.
 * The `reviews_delete` RLS policy enforces the same rule server-side.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as { reviewee_id?: string } | null
  const revieweeId = body?.reviewee_id

  if (!revieweeId || typeof revieweeId !== 'string') {
    return NextResponse.json({ error: 'reviewee_id is required.' }, { status: 400 })
  }

  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('reviewer_id', user.id)
    .eq('reviewee_id', revieweeId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}