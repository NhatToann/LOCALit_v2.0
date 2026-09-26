// Full end-to-end probe of the new OTP flow against production.
// Steps:
//   1. signup-admin → get userId
//   2. Read Vercel logs to extract the OTP code
//   3. verify-otp with that code → expect { ok: true }
//   4. create-profile → expect { ok: true }
import { Client } from 'pg'
import { execSync } from 'node:child_process'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const USER = 'postgres'
const DB = 'postgres'
const PW = process.env.DB_PW || 'that1arlecchino'

const BASE = 'https://localit-quxwnmcuu-nhattoann.vercel.app'
const TEST_EMAIL = `dbgotp_${Date.now()}@example.com`
const TEST_PW = 'password123'

function vc(method, path, body) {
  const json = JSON.stringify(body)
  const stdout = execSync(
    `vercel curl ${BASE}${path} -X ${method} -H "Content-Type: application/json" -d ${JSON.stringify(json)}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  // Strip debug lines and grab the JSON line.
  const lines = stdout.split(/\r?\n/).filter(l => l.trim().startsWith('{') || l.trim().startsWith('['))
  return lines[lines.length - 1] ?? ''
}

function extractOtpFromLogs(userId) {
  const stdout = execSync(
    `vercel logs --environment production --limit 5000`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 },
  )
  // Find the last "[email] TO  :" line that matches our test email, then
  // the following "[email] TEXT:" line that has a 6-digit code.
  const lines = stdout.split(/\r?\n/)
  let foundTo = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes('[email] TO  :') && lines[i].includes(TEST_EMAIL)) {
      foundTo = i
      break
    }
  }
  if (foundTo < 0) return null
  // Walk forward looking for the code.
  for (let i = foundTo; i < Math.min(lines.length, foundTo + 30); i++) {
    const m = lines[i].match(/verification code is:\s*(\d{6})/)
    if (m) return m[1]
  }
  return null
}

async function main() {
  console.log('=== Full OTP probe ===')
  const t0 = new Date().toISOString()

  console.log('1) signup-admin')
  const signupOut = vc('POST', '/api/auth/signup-admin', {
    email: TEST_EMAIL,
    password: TEST_PW,
    fullName: 'OTP Tourist',
    role: 'tourist',
  })
  console.log('   ', signupOut)
  const parsed = JSON.parse(signupOut)
  if (!parsed.userId) {
    console.log('No userId, aborting.')
    return
  }
  const userId = parsed.userId

  // Wait briefly for the log to land.
  await new Promise(r => setTimeout(r, 3000))

  console.log('2) extracting OTP from Vercel logs')
  const code = extractOtpFromLogs(userId)
  console.log('   code =', code)
  if (!code) {
    console.log('Could not find code in logs. Aborting.')
    return
  }

  console.log('3) verify-otp')
  const verifyOut = vc('POST', '/api/auth/verify-otp', {
    userId,
    email: TEST_EMAIL,
    code,
  })
  console.log('   ', verifyOut)

  if (!verifyOut.includes('"ok":true')) {
    console.log('verify-otp failed.')
    return
  }

  console.log('4) create-profile')
  const profileOut = vc('POST', '/api/auth/create-profile', {
    userId,
    role: 'tourist',
    payload: {
      nationality: 'United States',
      travel_style: 'solo',
      interests: ['food'],
      languages: ['English'],
      budget_range: '50-100',
      destination: 'Da Nang',
      is_visible: true,
    },
    autoConfirm: true,
  })
  console.log('   ', profileOut)

  // Cleanup: delete the test user from auth.users so it doesn't pollute.
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PW, database: DB, ssl: { rejectUnauthorized: false } })
  await c.connect()
  await c.query(`DELETE FROM auth.users WHERE email = $1`, [TEST_EMAIL])
  await c.end()
  console.log('5) cleanup: deleted test user')
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })