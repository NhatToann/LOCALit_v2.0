import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * POST /api/admin/ensure-buckets — idempotent. Safe to call repeatedly.
 *
 * Uses the SERVICE_ROLE_KEY (server-only) to create storage buckets.
 *
 * Body: { buckets?: Array<{name, public?, sizeMB?, mimes?}> }
 *   defaults to: avatars, trip-photos (public, 5MB),
 *                chat-attachments (private, 10MB)
 */
export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => ({}))) as {
    buckets?: Array<{ name: string; public?: boolean; sizeMB?: number; mimes?: string[] }>
  }

  const wanted =
    body.buckets && body.buckets.length > 0
      ? body.buckets
      : [
          { name: 'avatars', public: true, sizeMB: 5, mimes: ['image/png', 'image/jpeg', 'image/webp'] },
          { name: 'trip-photos', public: true, sizeMB: 5, mimes: ['image/png', 'image/jpeg', 'image/webp'] },
          { name: 'chat-attachments', public: false, sizeMB: 10, mimes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'] },
        ]

  const admin = createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: existing, error: listErr } = await admin.storage.listBuckets()
  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 502 })
  }
  const existingNames = new Set((existing || []).map((b) => b.name))

  const created: string[] = []
  const updated: string[] = []
  for (const b of wanted) {
    if (existingNames.has(b.name)) {
      // Update size limit / mime types if they differ
      const cur = (existing || []).find((x) => x.name === b.name)
      const wantSize = (b.sizeMB ?? 5) * 1024 * 1024
      if (cur && cur.file_size_limit !== wantSize) {
        const { error } = await admin.storage.updateBucket(b.name, {
          fileSizeLimit: wantSize,
          allowedMimeTypes: b.mimes,
          public: b.public ?? true,
        })
        if (!error) updated.push(b.name)
      }
      continue
    }
    const { error } = await admin.storage.createBucket(b.name, {
      public: b.public ?? true,
      fileSizeLimit: (b.sizeMB ?? 5) * 1024 * 1024,
      allowedMimeTypes: b.mimes,
    })
    if (error) {
      return NextResponse.json({ error: error.message, created, updated }, { status: 502 })
    }
    created.push(b.name)
  }

  return NextResponse.json({ ok: true, created, updated, existing: Array.from(existingNames) })
}
