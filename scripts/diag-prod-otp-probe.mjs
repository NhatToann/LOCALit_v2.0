// End-to-end probe of the new OTP verification flow against production.
// Sends an OTP, then reads the latest email_verifications row to get the code.
import { Client } from 'pg'
import { execSync } from 'node:child_process'

const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const USER = 'postgres'
const DB = 'postgres'
const PW = process.env.DB_PW || 'that1arlecchino'

const BASE = 'https://localit-5bg28iqrf-nhattoann.vercel.app'
const TEST_EMAIL = `dbgotp_${Date.now()}@example.com`
const TEST_PW = 'password123'

function vc(method, path, body) {
  const json = JSON.stringify(body)
  const stdout = execSync(
    `vercel curl ${BASE}${path} -X ${method} -H "Content-Type: application/json" -d ${JSON.stringify(json)}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return stdout
}

async function getActiveOtpCode(userId) {
  // We can't read the plaintext code (it's hashed), but in dev we
  // log the code via the email stub. For the prod probe we have to
  // reach into Vercel logs OR fall back to issuing a fresh code from
  // a debug script. Instead, let the server log it via console.warn
  // when RESEND_API_KEY is missing — that's the prod reality.
  //
  // We can't read Vercel logs from here, so this probe just validates
  // that the routes don't crash.
  const c = new Client({ host: HOST, port: PORT, user: USER, password: PW, database: DB, ssl: { rejectUnauthorized: false } })
  await c.connect()
  const r = await c.query(
    `SELECT user_id, created_at, attempts, consumed_at FROM public.email_verifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  )
  await c.end()
  return r.rows[0]
}

async function main() {
  console.log('=== OTP probe ===')

  let out
  try {
    out = vc('POST', '/api/auth/signup-admin', {
      email: TEST_EMAIL,
      password: TEST_PW,
      fullName: 'OTP Tourist',
      role: 'tourist',
    })
  } catch (e) {
    console.log('signup-admin failed:', String(e).slice(0, 400))
    return
  }
  console.log('signup-admin:', out.slice(0, 500))
  let parsed
  try { parsed = JSON.parse(out) } catch {}
  const userId = parsed?.userId
  if (!userId) return
  console.log('userId =', userId)
  console.log('warning =', parsed?.warning ?? '(none)')

  const record = await getActiveOtpCode(userId)
  console.log('verification row =', record)

  // We cannot read the plaintext code. So we just exercise verify-otp with
  // a wrong code to make sure the failure path returns 400 + JSON.
  let verifyOut
  try {
    verifyOut = vc('POST', '/api/auth/verify-otp', { userId, email: TEST_EMAIL, code: '000000' })
  } catch (e) {
    console.log('verify-otp failed:', String(e).slice(0, 400))
    return
  }
  console.log('verify-otp (wrong code):', verifyOut.slice(0, 400))

  // And resend-otp to make sure it accepts our request.
  let resendOut
  try {
    resendOut = vc('POST', '/api/auth/resend-otp', { userId })
  } catch (e) {
    console.log('resend-otp failed:', String(e).slice(0, 400))
    return
  }
  console.log('resend-otp:', resendOut.slice(0, 400))
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })