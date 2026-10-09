/**
 * POST /api/itinerary/from-template
 *
 * Body: { templateId: string, title?: string, startDate?: string }
 *
 * Reads the static template, creates a new itinerary + its day lists +
 * its cards, all in the caller's ownership. Returns the new itinerary
 * row so the client can redirect to /itinerary/[id].
 *
 * Auth: cookie session via @supabase/ssr.
 *
 * Notes
 * ─────
 * • All inserts are wrapped in a single RPC chain via the JS SDK; if
 *   any step fails we delete the partial itinerary and surface the
 *   error to the client.
 * • For the "blank" template we create the itinerary with no days or
 *   cards so the user starts on the empty board.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getTemplateById } from '@/lib/itinerary/templates'

const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>()
const LIMIT = 10
const WINDOW_MS = 60_000

function rateLimit(key: string): boolean {
  const now = Date.now()
  const slot = RATE_LIMIT.get(key)
  if (!slot || slot.resetAt < now) {
    RATE_LIMIT.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return true
  }
  if (slot.count >= LIMIT) return false
  slot.count += 1
  return true
}

export async function POST(req: NextRequest) {
  // 1. Auth
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  // 2. Rate limit
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!rateLimit(`from-template:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  // 3. Parse body
  const body = await req.json().catch(() => null) as
    | { templateId?: string; title?: string; startDate?: string }
    | null
  if (!body || !body.templateId) {
    return NextResponse.json({ error: 'templateId is required.' }, { status: 400 })
  }
  const template = getTemplateById(body.templateId)
  if (!template) {
    return NextResponse.json({ error: 'Template not found.' }, { status: 404 })
  }

  // 4. Resolve dates. For templates with multiple days we set
  // start_date from input; end_date is start_date + last day_offset.
  // For the "blank" template the dates stay null.
  const startDate = body.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
    ? body.startDate
    : null
  const lastOffset = template.days.reduce((m, d) => Math.max(m, d.day_offset), 0)
  const endDate = startDate && lastOffset > 0
    ? addDays(startDate, lastOffset)
    : startDate

  // 5. Create itinerary
  const title = (body.title ?? '').trim() || template.name
  const { data: itin, error: itinErr } = await sb
    .from('itineraries')
    .insert({
      owner_id: user.id,
      title: title.slice(0, 200),
      destination: 'Da Nang',
      start_date: startDate,
      end_date: endDate,
      notes: template.summary,
      status: 'planning',
      last_editor_id: user.id,
    })
    .select()
    .single()
  if (itinErr || !itin) {
    return NextResponse.json(
      { error: `Could not create itinerary: ${itinErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  if (template.days.length === 0) {
    return NextResponse.json({ itinerary: itin }, { status: 201 })
  }

  // 6. Create day lists (one per template day, ordered by day_offset)
  const dayRows = template.days.map((d, idx) => ({
    itinerary_id: itin.id,
    day_order: idx + 1,
    title: d.title,
    date: startDate ? addDays(startDate, d.day_offset) : null,
    start_time: d.start_time,
    end_time: d.end_time,
  }))
  const { data: insertedDays, error: daysErr } = await sb
    .from('itinerary_days')
    .insert(dayRows)
    .select()
  if (daysErr || !insertedDays) {
    await sb.from('itineraries').delete().eq('id', itin.id)
    return NextResponse.json(
      { error: `Could not create day lists: ${daysErr?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  // 7. Create cards, one per template card, mapped to the day
  // by its title (template days are unique by title within a template).
  const dayByTitle = new Map<string, string>()
  for (let i = 0; i < template.days.length; i += 1) {
    dayByTitle.set(template.days[i].title, insertedDays[i].id)
  }
  const cardRows: Array<Record<string, unknown>> = []
  let cardOrder = 0
  for (const d of template.days) {
    const dayId = dayByTitle.get(d.title)
    if (!dayId) continue
    for (const c of d.cards) {
      cardOrder += 1
      cardRows.push({
        itinerary_id: itin.id,
        day_id: dayId,
        stop_order: cardOrder,
        name: c.name.slice(0, 200),
        address: c.address ?? null,
        category: c.category,
        start_time: c.start_time,
        duration_minutes: c.duration_minutes,
        transport: c.transport || null,
        est_cost_cents: c.est_cost_vnd ? Math.round(c.est_cost_vnd * 100) : null,
        notes: c.notes ?? null,
        added_by: user.id,
      })
    }
  }
  if (cardRows.length > 0) {
    const { error: cardsErr } = await sb.from('itinerary_stops').insert(cardRows)
    if (cardsErr) {
      await sb.from('itineraries').delete().eq('id', itin.id)
      return NextResponse.json(
        { error: `Could not create cards: ${cardsErr.message}` },
        { status: 500 },
      )
    }
  }

  return NextResponse.json({ itinerary: itin }, { status: 201 })
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
