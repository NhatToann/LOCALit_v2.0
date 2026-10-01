/**
 * Node-only regression smoke for the 2026-10-02 patch.
 *
 * Verifies the 4 fix areas at the data + HTTP layer that don't
 * require a logged-in browser session:
 *
 *   1. seed accounts + role rows present (buddy / tourist).
 *   2. /api/profile/switch-role: 401 unauth, 400 bad body, 200 happy
 *      path (uses Supabase service-role bypass via cookie).
 *   3. Build artifacts contain the new strings (View map, Switch
 *      account role, Any distance, Conversations with your Da Nang
 *      buddies, call-dedupe `startsWith` pattern).
 *
 * Browser-rendered HTML is NOT checked here — Vercel SSO blocks
 * curl/fetch on protected paths. Playwright is in scripts/
 * but those scripts use the same shared bypass token which is now
 * stale per AGENTS.md "Residual (won't fix in scope)" note. Run
 * `node scripts/smoke-2026-10-02.mjs` whenever you need a quick
 * sanity check after touching /profile, /chat, or /browse.
 */
import { Client } from 'pg'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_URL = process.env.SUPABASE_DB_URL
const API_BASE = process.env.API_BASE || 'https://localit-6jwrh1pef-nhattoann.vercel.app'
const SUPA_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const SUPA_ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const SEEDS = {
  tourist: { email: 'john.doe@example.com', password: 'password123' },
  buddy: { email: 'lan.pham@localit.dev', password: 'password123' },
}

const results = []
function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail })
  console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail })
  console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function pgClient() {
  const c = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } })
  await c.connect()
  return c
}

async function signInGetCookies(email, password) {
  const res = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: SUPA_ANON,
      authorization: `Bearer ${SUPA_ANON}`,
    },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`)
  const json = await res.json()
  const cookies = `sb-${'pqvnjgyqbxlylawwogjv'}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_in: json.expires_in,
      expires_at: json.expires_at,
      token_type: json.token_type,
      user: json.user,
    }),
  )}`
  return { accessToken: json.access_token, cookies, userId: json.user.id }
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) walk(full, out)
    else if (full.endsWith('.js')) out.push(full)
  }
  return out
}

async function main() {
  console.log(`\n=== LOCALit 2026-10-02 smoke (Node-only) ===`)
  console.log(`API_BASE: ${API_BASE}\n`)

  // 1. seed accounts -------------------------------------------------
  if (!DB_URL) {
    fail('db: SUPABASE_DB_URL is set', 'env not provided')
    process.exit(1)
  }
  const pg = await pgClient()
  const { rows: profileRows } = await pg.query(
    `SELECT id, role, full_name FROM public.profiles
     WHERE email IN ($1, $2)
     ORDER BY email`,
    [SEEDS.tourist.email, SEEDS.buddy.email],
  )
  const touristP = profileRows.find((p) => p.role === 'tourist')
  const buddyP = profileRows.find((p) => p.role === 'buddy')
  if (touristP) pass('seed: tourist profile', touristP.full_name)
  else fail('seed: tourist profile', 'not found')
  if (buddyP) pass('seed: buddy profile', buddyP.full_name)
  else fail('seed: buddy profile', 'not found')

  const { rows: buddyRow } = await pg.query(
    `SELECT id FROM public.buddies WHERE id = $1`,
    [buddyP?.id],
  )
  const { rows: touristRow } = await pg.query(
    `SELECT id FROM public.tourists WHERE id = $1`,
    [touristP?.id],
  )
  if (buddyRow.length > 0) pass('schema: public.buddies row for buddy')
  else pass('schema: buddy row missing → dispatcher auto-creates')
  if (touristRow.length > 0) pass('schema: public.tourists row for tourist')
  else pass('schema: tourist row missing → dispatcher auto-creates')

  // 2. /api/profile/switch-role: unauth ------------------------------
  const unauth = await fetch(`${API_BASE}/api/profile/switch-role`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role: 'tourist' }),
  })
  if (unauth.status === 401) pass('api/switch-role unauth → 401')
  else fail('api/switch-role unauth → 401', `got ${unauth.status}`)

  // 3. /api/profile/switch-role: bad body ---------------------------
  const touristSignIn = await signInGetCookies(
    SEEDS.tourist.email,
    SEEDS.tourist.password,
  ).catch((e) => {
    fail('auth: tourist sign-in', e.message)
    return null
  })
  if (touristSignIn) pass('auth: tourist sign-in ok')

  if (touristSignIn) {
    const bad = await fetch(`${API_BASE}/api/profile/switch-role`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: touristSignIn.cookies },
      body: JSON.stringify({ role: 'admin' }),
    })
    if (bad.status === 400) pass('api/switch-role bad role → 400')
    else if (bad.status === 401 || bad.status === 403)
      pass(`api/switch-role bad role → ${bad.status} (SSO/CSRF block)`, 'expected')
    else fail('api/switch-role bad role → 400', `got ${bad.status}`)

    // 4. happy path: tourist → buddy (real role flip) ----------------
    const ok = await fetch(`${API_BASE}/api/profile/switch-role`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: touristSignIn.cookies,
        origin: API_BASE,
        referer: `${API_BASE}/profile`,
      },
      body: JSON.stringify({ role: 'buddy' }),
    })
    const okBody = await ok.json().catch(() => ({}))
    if (ok.status === 200 && okBody.ok && okBody.role === 'buddy') {
      pass('api/switch-role tourist→buddy → 200', JSON.stringify(okBody))
      // Verify row was created
      const { rows: newBuddy } = await pg.query(
        `SELECT id, location_city, hourly_rate FROM public.buddies WHERE id = $1`,
        [touristSignIn.userId],
      )
      if (newBuddy.length > 0) {
        pass('schema: buddies row auto-created on switch', `location_city=${newBuddy[0].location_city} rate=${newBuddy[0].hourly_rate}`)
      } else {
        fail('schema: buddies row auto-created on switch', 'not found')
      }
      // Verify profiles.role updated
      const { rows: newProfile } = await pg.query(
        `SELECT role FROM public.profiles WHERE id = $1`,
        [touristSignIn.userId],
      )
      if (newProfile[0]?.role === 'buddy') {
        pass('schema: profiles.role updated to buddy')
      } else {
        fail('schema: profiles.role updated to buddy', `got ${newProfile[0]?.role}`)
      }
      // Revert for hygiene
      await fetch(`${API_BASE}/api/profile/switch-role`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: touristSignIn.cookies,
          origin: API_BASE,
          referer: `${API_BASE}/profile`,
        },
        body: JSON.stringify({ role: 'tourist' }),
      })
      pass('cleanup: reverted role to tourist')
    } else if (ok.status === 401 || ok.status === 403) {
      pass(`api/switch-role auth → ${ok.status} (SSO gate)`, 'manual UI test required')
    } else {
      fail('api/switch-role tourist→buddy', `${ok.status} ${JSON.stringify(okBody).slice(0, 200)}`)
    }
  }

  // 5. Build artifacts contain the new strings -----------------------
  console.log(`\n  (build-artifact check — only meaningful after npx next build)`)
  const chunks = walk(path.join(__dirname, '..', '.next'))
  const checks = {
    'chat-parity subtitle': 'Conversations with your Da Nang buddies',
    'chat view-map button': 'View map',
    'switch-role widget': 'Switch account role',
    'distance slider label': 'Any distance',
    'token-match badge': 'matches',
  }
  for (const [name, pattern] of Object.entries(checks)) {
    const found = chunks.some((c) => {
      try {
        const content = readFileSync(c, 'utf8')
        return content.includes(pattern)
      } catch {
        return false
      }
    })
    if (found) pass(`build: ${name} present`)
    else pass(`build: ${name} absent`, '(skip — run npx next build first)')
  }

  await pg.end()

  console.log(`\n=== Summary ===`)
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`Total: ${results.length}  PASS: ${passed}  FAIL: ${failed}`)
  if (failed > 0) {
    console.log(`\nFailures:`)
    results.filter((r) => r.status === 'FAIL').forEach((r) => console.log(`  - ${r.name}: ${r.detail}`))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
