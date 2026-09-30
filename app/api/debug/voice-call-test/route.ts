/**
 * POST /api/debug/voice-call-test
 *
 * Test-only endpoint that uses the Supabase service role to:
 *   - GET: find or create a John↔Lan conversation; return its id +
 *     caller_id + callee_id
 *   - POST { action: 'insert-pending', conversationId, callerId,
 *     calleeId }: insert a row into pending_calls with status='ringing'
 *   - POST { action: 'get-pending', pendingCallId }: read a pending row
 *   - POST { action: 'update-pending', pendingCallId, status }:
 *     update a pending row's status
 *
 * Only mounted in non-production. Used by scripts/playwright-callee-test.mjs
 * because the local DNS resolver cannot reach db.pqvnjgyqbxlylawwogjv.supabase.co
 * (no A record) and the test env can't dial IPv6.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing')
  }
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(req: NextRequest) {
  try {
    const sb = admin()
    const url = new URL(req.url)
    const create = url.searchParams.get('create') === '1'
    // Find seeded John↔Lan conversation (either direction)
    const { data: convs } = await sb
      .from('conversations')
      .select(
        'id, tourist_id, buddy_id, tourist:profiles!conversations_tourist_id_fkey(full_name), buddy:profiles!conversations_buddy_id_fkey(full_name)',
      )
      .or(
        'and(tourist_id.eq.aaaa1111-1111-1111-1111-111111111111,buddy_id.eq.11111111-1111-1111-1111-111111111111),and(tourist_id.eq.11111111-1111-1111-1111-111111111111,buddy_id.eq.aaaa1111-1111-1111-1111-111111111111)',
      )
      .order('created_at', { ascending: false })
      .limit(1)
    type Conv = {
      id: string
      tourist_id: string
      buddy_id: string
      tourist: { full_name: string | null }[] | null
      buddy: { full_name: string | null }[] | null
    }
    let conv: Conv | null = (convs?.[0] as Conv | undefined) ?? null
    if (!conv && create) {
      // Try plain insert first
      const { error: ie } = await sb
        .from('conversations')
        .insert({
          tourist_id: 'aaaa1111-1111-1111-1111-111111111111',
          buddy_id: '11111111-1111-1111-1111-111111111111',
        })
      if (!ie) {
        // Insert succeeded — re-query to get the row
        const { data: re } = await sb
          .from('conversations')
          .select('id, tourist_id, buddy_id')
          .eq('tourist_id', 'aaaa1111-1111-1111-1111-111111111111')
          .eq('buddy_id', '11111111-1111-1111-1111-111111111111')
          .limit(1)
        const found = re?.[0]
        if (found) {
          conv = { ...(found as { id: string; tourist_id: string; buddy_id: string }), tourist: null, buddy: null }
        }
      } else {
        return NextResponse.json({ error: 'insert failed: ' + ie.message }, { status: 500 })
      }
    }
    if (!conv) {
      return NextResponse.json({ error: 'no John↔Lan conversation' }, { status: 404 })
    }
    const tp = Array.isArray(conv.tourist) ? conv.tourist[0] : conv.tourist
    const bp = Array.isArray(conv.buddy) ? conv.buddy[0] : conv.buddy
    return NextResponse.json({
      conversationId: conv.id,
      callerId: 'aaaa1111-1111-1111-1111-111111111111',
      callerName: tp?.full_name ?? 'John Doe',
      calleeId: '11111111-1111-1111-1111-111111111111',
      calleeName: bp?.full_name ?? 'Lan Pham',
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = admin()
    const body = (await req.json()) as Record<string, unknown>
    const action = String(body.action ?? '')
    if (action === 'insert-pending') {
      const { data, error } = await sb
        .from('pending_calls')
        .insert({
          conversation_id: String(body.conversationId),
          caller_id: String(body.callerId),
          callee_id: String(body.calleeId),
          status: 'ringing',
        })
        .select('id, conversation_id, caller_id, callee_id, status, created_at')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }
    if (action === 'get-pending') {
      const { data, error } = await sb
        .from('pending_calls')
        .select('id, conversation_id, caller_id, callee_id, status, created_at, updated_at')
        .eq('id', String(body.pendingCallId))
        .maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data ?? null)
    }
    if (action === 'update-pending') {
      const { data, error } = await sb
        .from('pending_calls')
        .update({ status: String(body.status), updated_at: new Date().toISOString() })
        .eq('id', String(body.pendingCallId))
        .select('id, status')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }
    if (action === 'list-ringing') {
      const { data, error } = await sb
        .from('pending_calls')
        .select('id, conversation_id, caller_id, callee_id, status, created_at')
        .eq('status', 'ringing')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data ?? [] })
    }
    if (action === 'clean-ringing') {
      // Cancel any ringing rows for a given pair
      const { error } = await sb
        .from('pending_calls')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('status', 'ringing')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'unknown action: ' + action }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}