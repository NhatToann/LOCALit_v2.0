#!/usr/bin/env node
/**
 * Read the ACTUAL Supabase Redirect URL allowlist via the Admin API.
 *
 * The anon key cannot see it (`/auth/v1/settings` omits it), which is why
 * the in-app diagnostics endpoint could only report which URLs are
 * *required*, not which are *present*. With the service role key we can
 * query `auth.config` directly and give a definitive answer.
 *
 * Usage:  node scripts/diag-allowlist-real.mjs
 * Requires: SUPABASE_SERVICE_ROLE_KEY in env (loaded from .env.local by
 * the caller) or pass --key=<jwt>.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadKey() {
  const argKey = process.argv.find((a) => a.startsWith('--key='))?.slice(6)
  if (argKey) return argKey
  const fromEnv = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (fromEnv && fromEnv !== '[SENSITIVE]') return fromEnv

  for (const f of ['.env.local', '.env.production', '.env.real']) {
    const p = resolve(process.cwd(), f)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(
      /^SUPABASE_SERVICE_ROLE_KEY=["']?([^"'\r\n]+)["']?/m,
    )
    if (m && m[1] && m[1] !== '[SENSITIVE]') return m[1]
  }
  return null
}

const KEY = loadKey()
const SUPABASE =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://pqvnjgyqbxlylawwogjv.supabase.co'

if (!KEY) {
  console.error('No service role key available.')
  process.exit(1)
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
}

console.log('=== Supabase auth config (admin) ===')

// The /auth/v1/admin/... endpoints do not expose auth.config, so go
// through the Management API shape exposed by the admin settings route.
for (const path of ['/auth/v1/admin/generate_link']) {
  const res = await fetch(`${SUPABASE}${path}`, { headers })
  const body = await res.text()
  console.log(`GET ${path} -> ${res.status}`)
  console.log(`  ${body.slice(0, 300)}`)
}

// The config lives in Postgres under auth.config (a JSONB column added
// in recent GoTrue). Query it via the SQL endpoint if the pg creds are
// around; otherwise report what the dashboard route offers.
console.log('\n=== fallback: pg direct query ===')
let PW = null
for (const f of ['.env.local', '.env.production', '.env.real']) {
  const p = resolve(process.cwd(), f)
  if (!existsSync(p)) continue
  const m = readFileSync(p, 'utf8').match(/^(?:DB_PW|SUPABASE_DB_PASSWORD|POSTGRES_PASSWORD)=["']?([^"'\r\n]+)["']?/m)
  if (m && m[1] && m[1] !== '[SENSITIVE]') { PW = m[1]; break }
}

if (!PW) {
  console.log('  (no db password available — cannot read auth.config)')
  process.exit(0)
}

const { Client } = await import('pg')
const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await client.connect()
try {
  // auth.config is an internal table in GoTrue schema (quoted, camel).
  const r = await client.query(`SELECT * FROM auth.config LIMIT 1`)
  const cfg = r.rows[0] || {}
  console.log('  columns:', Object.keys(cfg).join(', '))

  const list =
    cfg.redirect_url_urls ||
    cfg.redirectUrls ||
    cfg.uri_allow_list ||
    cfg.uriAllowList ||
    null

  if (Array.isArray(list)) {
    console.log('\n=== Redirect URL allowlist (authoritative) ===')
    for (const u of list) console.log(`  - ${u}`)

    const REQUIRED = [
      'https://localit-nhattoann.vercel.app/reset-password',
      'https://localit-vn.vercel.app/reset-password',
    ]
    console.log('\n=== required-by-app check ===')
    for (const req of REQUIRED) {
      const present = list.includes(req)
      const originOnly = list.includes(req.replace('/reset-password', ''))
      console.log(
        `  ${present ? 'OK      ' : 'MISSING '} ${req}` +
          (originOnly ? '   (origin present but path missing)' : ''),
      )
    }
  } else {
    console.log('  no allowlist column found; keys:', Object.keys(cfg).join(', '))
  }
} catch (e) {
  console.log('  query failed:', e.message)
} finally {
  await client.end()
}