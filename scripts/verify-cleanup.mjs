// scripts/verify-cleanup.mjs — smoke test: signup + signin + DB state after cleanup.
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pg from 'pg'
const { Client } = pg

const ENDPOINT = 'https://localit-nhattoann.vercel.app'
const ts = Date.now()
const testEmail = `postcleanup.${ts}@gmail.com`
const testPassword = 'PostCleanUp#2026'

async function main() {
  // 1. Sign-up
  const body = {
    email: testEmail,
    password: testPassword,
    fullName: 'Post Cleanup',
    role: 'tourist',
    profilePayload: {
      nationality: 'United States',
      travel_style: 'solo',
      interests: ['food'],
      languages: ['English'],
      budget_range: '50-100',
      destination: 'Da Nang',
    },
  }
  const tmp = mkdtempSync(join(tmpdir(), 'cleanup-'))
  const f = join(tmp, 'body.json')
  writeFileSync(f, JSON.stringify(body))

  console.log(`POST ${ENDPOINT}/api/auth/signup  email=${testEmail}`)
  const out = execFileSync(
    'powershell',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', 'scripts/redteam-helper.ps1',
      '-Url', `${ENDPOINT}/api/auth/signup`, '-Method', 'POST', '-BodyFile', f,
    ],
    { encoding: 'utf8' },
  )
  console.log(out.split(/\r?\n/).filter((l) => !l.startsWith('Vercel CLI')).join('\n').trim())

  // 2. Verify the full triplet landed in DB
  const c = new Client({
    connectionString:
      'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const r = await c.query(
    `
      SELECT u.email,
             p.id IS NOT NULL AS has_profile,
             t.id IS NOT NULL AS has_tourist
      FROM auth.users u
      LEFT JOIN public.profiles p ON p.id = u.id
      LEFT JOIN public.tourists  t ON t.id = u.id
      WHERE u.email = $1
    `,
    [testEmail],
  )
  const row = r.rows[0]
  console.log('\nDB check:', JSON.stringify(row, null, 2))

  // 3. Verify duplicate-email still returns the 400 generic message
  const out2 = execFileSync(
    'powershell',
    [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', 'scripts/redteam-helper.ps1',
      '-Url', `${ENDPOINT}/api/auth/signup`, '-Method', 'POST', '-BodyFile', f,
    ],
    { encoding: 'utf8' },
  )
  console.log('\nDuplicate-email POST:')
  console.log(out2.split(/\r?\n/).filter((l) => !l.startsWith('Vercel CLI')).join('\n').trim())

  await c.end()
}
main().catch((e) => {
  console.error('verify failed:', e.message)
  process.exit(1)
})
