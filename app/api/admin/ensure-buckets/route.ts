import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * POST /api/admin/ensure-buckets — idempotent. Safe to call repeatedly.
 *
 * Uses the SERVICE_ROLE_KEY (server-only) to create the `avatars` bucket if it
 * doesn't exist. Public access (so avatar URLs work in <img src=...>).
 *
 * Body: { buckets?: string[] }   defaults to ['avatars'].
 */
export async function POST(req: Request) {
  // Lightweight gate — only admins can hit this. The route is meant to be
  // called from deployment scripts, not by users, but we also require an
  // internal cron token to avoid anon tampering.
  const internalToken = process.env.INTERNAL_API_TOKEN
  const provided = req.headers.get('x-internal-token')
  if (!internalToken || provided !== internalToken) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return NextResponse.json({ error: 'server-misconfigured' }, { status: 500 })
  }
  const body = (await req.json().catch(() => ({}))) as { buckets?: string[] }
  const wanted = body.buckets || ['avatars']

  const admin = createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existing, error: listErr } = await admin.storage.listBuckets()
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 502 })
  }
  const existingNames = new Set((existing || []).map((b) => b.name))

  const created: string[] = []
  for (const name of wanted) {
    if (existingNames.has(name)) continue
    const { error } = await admin.storage.createBucket(name, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: name === 'avatars' ? ['image/png', 'image/jpeg', 'image/webp'] : undefined,
    })
    if (error) {
      return NextResponse.json({ error: error.message, created }, { status: 502 })
    }
    created.push(name)
  }

  return NextResponse.json({ ok: true, created, existing: Array.from(existingNames) })
}
