/**
 * GET  /api/connections           — list all of the caller's connections
 * POST /api/connections           — send a new connection request
 *
 * POST body:
 *   {
 *     recipient_id: string  (uuid of the user you want to connect with),
 *     duration_days?: number (1-30, default = caller's profile setting)
 *   }
 *
 * Rate limit: 10 requests / 60s / IP (defensive — the underlying
 * connection INSERT also has a UNIQUE index that prevents duplicates).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/utils/rate-limit'
import { z } from 'zod'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PostSchema = z.object({
  recipient_id: z.string().regex(UUID_RE, 'Invalid UUID'),
  duration_days: z.number().int().min(1).max(30).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(`connections.post.${ip}`, 'connections.post', {
      windowMs: 60_000,
      max: 10,
    })
    if (!rl.ok) return rateLimitResponse(rl.resetAt)

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }
    const parsed = PostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_body', details: parsed.error.flatten() },
        { status: 400 },
      )
    }
    const { recipient_id, duration_days } = parsed.data

    if (recipient_id === user.id) {
      return NextResponse.json(
        { error: 'self_connection_not_allowed' },
        { status: 400 },
      )
    }

    // Recipient must exist.
    const { data: recipient } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('id', recipient_id)
      .maybeSingle()
    if (!recipient) {
      return NextResponse.json({ error: 'recipient_not_found' }, { status: 404 })
    }

    // Default duration = caller's profile setting (1-30, default 7).
    const { data: caller } = await supabase
      .from('profiles')
      .select('default_connection_duration, role')
      .eq('id', user.id)
      .maybeSingle()
    const finalDuration = duration_days ?? caller?.default_connection_duration ?? 7

    // Check for existing connection in either direction.
    const { data: existing } = await supabase
      .from('connections')
      .select('id, status, requester_id, recipient_id')
      .or(
        `and(requester_id.eq.${user.id},recipient_id.eq.${recipient_id}),` +
          `and(requester_id.eq.${recipient_id},recipient_id.eq.${user.id})`,
      )
      .limit(1)
      .maybeSingle()
    if (existing) {
      return NextResponse.json(
        {
          error: 'connection_already_exists',
          connection_id: existing.id,
          status: existing.status,
        },
        { status: 409 },
      )
    }

    // Insert the connection. The 2026-11-07 bidirectional migration
    // accepts requester_id / recipient_id as the source of truth; the
    // legacy tourist_id / buddy_id columns are populated best-effort so
    // the historical RLS / index continue to work.
    const { data, error } = await supabase
      .from('connections')
      .insert({
        requester_id: user.id,
        recipient_id,
        requester_role: caller?.role ?? 'tourist',
        recipient_role: recipient.role,
        status: 'pending',
        duration_days: finalDuration,
      })
      .select()
      .single()
    if (error) {
      return NextResponse.json({ error: 'insert_failed', message: error.message }, { status: 500 })
    }

    return NextResponse.json(
      { connection: data, duration_days: finalDuration },
      { status: 201 },
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: 'server_error', message }, { status: 500 })
  }
}

export async function GET(_req: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    // Unauthenticated visitors get an empty list, not 401. The page-level
    // /connections server component already gates on auth and renders
    // "Please sign in to see your connections" — but the bell/header
    // wiring on every other page used to issue this fetch speculatively,
    // which flooded the browser console with 401s for signed-out
    // visitors. Returning 200 with an empty list is semantically correct
    // (an unauthenticated user has no connections) and keeps the
    // console quiet.
    if (!user) return NextResponse.json({ connections: [] })

    // Pull every connection the user participates in, both directions.
    const { data, error } = await supabase
      .from('connections')
      .select(
        'id, requester_id, recipient_id, requester_role, recipient_role, status, lifecycle, accepted_at, expires_at, locked_at, renewed_at, duration_days, message, created_at, updated_at',
      )
      .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('updated_at', { ascending: false })
    if (error) {
      return NextResponse.json({ error: 'query_failed', message: error.message }, { status: 500 })
    }

    // Hydrate partner profile (lightweight) so the UI can render the list
    // without a second round-trip per row.
    const partnerIds = Array.from(
      new Set(
        (data ?? []).map((c) =>
          c.requester_id === user.id ? c.recipient_id : c.requester_id,
        ),
      ),
    )
    let partners: Array<{ id: string; full_name: string; avatar_url: string | null; role: string }> = []
    if (partnerIds.length > 0) {
      const { data: rows } = await supabase
        .from('safe_profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', partnerIds)
      partners = rows ?? []
    }
    const partnerById = new Map(partners.map((p) => [p.id, p]))

    // Annotate with derived fields (is_locked, days_remaining).
    const enriched = (data ?? []).map((c) => {
      const partnerId = c.requester_id === user.id ? c.recipient_id : c.requester_id
      const expiresAt = c.expires_at ? new Date(c.expires_at) : null
      const isLocked =
        c.status === 'accepted' && expiresAt !== null && expiresAt.getTime() < Date.now()
      const daysRemaining =
        c.status === 'accepted' && expiresAt
          ? Math.max(-999, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000))
          : null
      return {
        ...c,
        partner_id: partnerId,
        partner: partnerById.get(partnerId) ?? null,
        is_locked: isLocked || c.locked_at != null,
        days_remaining: daysRemaining,
      }
    })

    return NextResponse.json({ connections: enriched })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    return NextResponse.json({ error: 'server_error', message }, { status: 500 })
  }
}
