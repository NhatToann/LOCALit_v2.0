// scripts/diag-focus-same-role.mjs
// Test /api/focus/request directly:
// 1. Cross-role focus (tourist → buddy) — expect 201
// 2. Same-role focus (tourist → tourist) — expect 400 with new message
//
// Hits the deployed API at localit-nhattoann.vercel.app. Runs against
// current production. The new same-role gate is gated on a successful
// deploy, so this script is meant to be run AFTER `vercel --prod` lands.

import pg from 'pg'
const { Client } = pg
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const t = await c.query(`
  SELECT p.id, p.full_name FROM public.profiles p
  JOIN public.tourists tt ON tt.id = p.id
  WHERE p.role = 'tourist'
  ORDER BY p.full_name LIMIT 2
`)
await c.end()
if (t.rows.length < 2) {
  console.error('need 2 tourists, have', t.rows.length)
  process.exit(1)
}

const sbUrl = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const sbKey = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

// Sign in as john.doe (buddy on profiles but tourist-style — actually he's
// a buddy per profiles.role). Use a real tourist: 'sarah.m@example.com'.
const candidate = [
  { email: 'sarah.m@example.com', pw: 'password123' },
  { email: 'lan.pham@localit.dev', pw: 'password123' },
]
let sbSession = null
let email = ''
for (const c of candidate) {
  const r = await fetch(`${sbUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: sbKey },
    body: JSON.stringify({ email: c.email, password: c.pw }),
  })
  if (r.ok) {
    sbSession = await r.json()
    email = c.email
    break
  }
}
if (!sbSession) {
  console.error('no seed account could sign in')
  process.exit(1)
}
console.log('signed in as', email, 'id=', sbSession.user.id)

// Find the recipient that has the OPPOSITE role of the signed-in user
import('pg').then(async (pg) => {
  const db = new pg.default.Client({
    connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await db.connect()
  const me = await db.query(`SELECT role FROM public.profiles WHERE id = $1`, [sbSession.user.id])
  const myRole = me.rows[0]?.role
  console.log('my role:', myRole)
  const opposite = myRole === 'tourist' ? 'buddy' : 'tourist'
  const op = await db.query(
    `SELECT p.id, p.full_name FROM public.profiles p
     JOIN public.${opposite === 'buddy' ? 'buddies' : 'tourists'} t ON t.id = p.id
     WHERE p.role = $1 AND p.id <> $2
     ORDER BY p.full_name LIMIT 1`,
    [opposite, sbSession.user.id],
  )
  const same = await db.query(
    `SELECT p.id, p.full_name FROM public.profiles p
     JOIN public.${myRole === 'tourist' ? 'tourists' : 'buddies'} t ON t.id = p.id
     WHERE p.role = $1 AND p.id <> $2
     ORDER BY p.full_name LIMIT 1`,
    [myRole, sbSession.user.id],
  )
  await db.end()
  if (!op.rows[0] || !same.rows[0]) {
    console.error('need one of each role, have opposite=', op.rows.length, 'same=', same.rows.length)
    process.exit(1)
  }
  const oppId = op.rows[0].id
  const sameId = same.rows[0].id
  console.log('cross-role recipient:', op.rows[0].full_name, oppId)
  console.log('same-role recipient:', same.rows[0].full_name, sameId)

  // Build cookies in the @supabase/ssr chunked format
  const projectRef = 'pqvnjgyqbxlylawwogjv'
  const cookieName = `sb-${projectRef}-auth-token`
  const payload = JSON.stringify({
    access_token: sbSession.access_token,
    refresh_token: sbSession.refresh_token,
    expires_in: sbSession.expires_in,
    expires_at: sbSession.expires_at ?? Math.floor(Date.now() / 1000) + (sbSession.expires_in ?? 3600),
    token_type: sbSession.token_type ?? 'bearer',
    user: sbSession.user,
  })
  const b64 = Buffer.from(payload, 'utf8').toString('base64')
  const CHUNK = 2000
  const chunks = Math.ceil(b64.length / CHUNK)
  const cookieParts = []
  for (let i = 0; i < chunks; i++) {
    cookieParts.push(`${cookieName}.${i}=${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`)
  }
  const cookieHeader = cookieParts.join('; ')

  async function callFocus(recipient) {
    const r = await fetch('https://localit-nhattoann.vercel.app/api/focus/request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: cookieHeader,
        'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
      },
      body: JSON.stringify({ recipient_id: recipient }),
    })
    const body = await r.json().catch(() => ({}))
    return { status: r.status, body }
  }

  console.log('\nA) Cross-role focus (expect 201):')
  const cross = await callFocus(oppId)
  console.log('  ', cross.status, JSON.stringify(cross.body).slice(0, 200))

  console.log('\nB) Same-role focus (expect 400 + new message):')
  const sameR = await callFocus(sameId)
  console.log('  ', sameR.status, JSON.stringify(sameR.body).slice(0, 300))

  const expectedMessage = 'đối với người có cùng role không thể dùng chức năng focus'
  const ok =
    sameR.status === 400 &&
    sameR.body?.error === 'same_role_focus_not_allowed' &&
    sameR.body?.message === expectedMessage

  console.log('\nVERDICT:', ok ? 'PASS' : 'FAIL')
  process.exit(ok ? 0 : 1)
})
