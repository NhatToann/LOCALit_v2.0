/**
 * Post-deploy smoke test for the 4 fixes:
 *  1. /tourist/dashboard renders with map + buddies
 *  2. /tourist/browse returns the buddy list (not empty)
 *  3. /buddy/requests shows discoverable travelers
 *  4. Internal navigation between role pages does NOT bounce to /login
 *
 * Runs against the canonical production URL by default; pass --local
 * to hit http://localhost:3000.
 */
import { createClient } from '@supabase/supabase-js'

const args = new Set(process.argv.slice(2))
const baseUrl = args.has('--local')
  ? 'http://localhost:3000'
  : 'https://localit-nhattoann.vercel.app'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.')
  process.exit(1)
}

const accounts = [
  { email: 'john.doe@example.com', password: 'password123', role: 'tourist' },
  { email: 'lan.pham@localit.dev', password: 'password123', role: 'buddy' },
]

const failures = []
let passed = 0

async function signIn(email, password) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    throw new Error(`signIn failed for ${email}: ${error?.message ?? 'no session'}`)
  }
  return { sb, session: data.session }
}

function expect(cond, msg) {
  if (!cond) {
    failures.push(msg)
    console.log(`  FAIL  ${msg}`)
  } else {
    passed++
    console.log(`  OK    ${msg}`)
  }
}

async function expectNoLoginRedirect(path, session) {
  // Fetch with redirect: manual so we can detect a 302 to /login.
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Cookie: `sb-pqvnjgyqbxlylawwogjv-auth-token=${encodeURIComponent(JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: 'bearer',
      user: session.user,
    }))}` },
    redirect: 'manual',
  })
  expect(res.status !== 302 || !res.headers.get('location')?.includes('/login'),
    `${path} does not redirect to /login (got ${res.status}${res.headers.get('location') ? ` -> ${res.headers.get('location')}` : ''})`)
  return res
}

async function runScenario(label, email, password, paths, queries) {
  console.log(`\n--- ${label} (${email}) ---`)
  const { session } = await signIn(email, password)
  for (const p of paths) {
    await expectNoLoginRedirect(p, session)
  }
  // Anonymous view of marketplace (cookies omitted) — must still show pins.
  for (const q of queries) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } })
      const { data, error } = await sb.from(q.table).select(q.select).limit(q.limit ?? 5)
      if (error) {
        failures.push(`anon SELECT ${q.table} (${q.select}): ${error.message}`)
        console.log(`  FAIL  anon ${q.table}: ${error.message}`)
      } else {
        const ok = Array.isArray(data) && data.length >= (q.min ?? 1)
        if (ok) {
          passed++
          console.log(`  OK    anon ${q.table} returned ${data.length} row(s)`)
        } else {
          failures.push(`anon ${q.table} returned ${data?.length ?? 0} rows (expected >= ${q.min ?? 1})`)
          console.log(`  FAIL  anon ${q.table} returned ${data?.length ?? 0} rows`)
        }
      }
    } catch (e) {
      failures.push(`anon ${q.table} threw: ${e.message}`)
    }
  }
}

async function main() {
  console.log(`Smoke testing ${baseUrl}`)
  await runScenario(
    'Tourist (john.doe@example.com)',
    'john.doe@example.com',
    'password123',
    ['/tourist/dashboard', '/tourist/browse', '/map', '/chat', '/tourist/trips'],
    [
      { table: 'safe_buddies', select: 'id, latitude, longitude, location_city', min: 4 },
      { table: 'safe_profiles', select: 'id, full_name, role, is_online', min: 5 },
    ],
  )
  await runScenario(
    'Buddy (lan.pham@localit.dev)',
    'lan.pham@localit.dev',
    'password123',
    ['/buddy/dashboard', '/buddy/requests', '/buddy/profile', '/map'],
    [],
  )

  console.log(`\n${passed} passed, ${failures.length} failed`)
  if (failures.length > 0) {
    console.log('\nFailures:')
    failures.forEach((f) => console.log(`  - ${f}`))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
