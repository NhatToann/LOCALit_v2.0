#!/usr/bin/env node
/**
 * Run hard-coded verification attacks against the production deployment
 * via `vercel curl` (bypasses Deployment Protection).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const PROD = 'https://localit-p8vc2ofho-nhattoann.vercel.app'

async function vc(url, method, body, extra = []) {
  const args = [url, '--silent', '--show-error', '-X', method]
  args.push('-H', 'content-type: application/json')
  for (const h of extra) args.push('-H', h)
  if (body) args.push('-d', body)
  try {
    const { stdout } = await exec('vercel.cmd', ['curl', ...args], { shell: true, maxBuffer: 16 * 1024 * 1024 })
    // Extract JSON-ish line
    const lines = stdout.split('\n').filter(l => l.trim().length > 0)
    return lines.find(l => l.startsWith('{') || l.startsWith('[') || l.startsWith('"')) ?? stdout.slice(-500)
  } catch (e) {
    return `ERROR: ${e.message.slice(-300)}`
  }
}

function show(label, body) {
  console.log(`\n--- ${label} ---`)
  console.log(typeof body === 'string' ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300))
}

async function main() {
  console.log('=== POST-DEPLOY VERIFICATION via vercel curl ===\n')

  // 1. Signup rate limit
  console.log('\nTEST 1: Signup rate limit (should see 429 after 5 requests)')
  for (let i = 0; i < 7; i++) {
    const r = await vc(`${PROD}/api/auth/signup`, 'POST',
      JSON.stringify({ email: `verify-${Date.now()}-${i}@test.com`, password: 'password123', fullName: `V${i}`, role: 'tourist' }))
    show(`attempt ${i + 1}`, r)
  }

  // 2. CSRF newsletter
  console.log('\nTEST 2: CSRF newsletter with evil origin (should 403)')
  const csrf = await vc(`${PROD}/api/newsletter/subscribe`, 'POST',
    'email=evil@evil.com',
    ['content-type: application/x-www-form-urlencoded', 'origin: https://evil.example.com'])
  show('csrf', csrf)

  // 3. IDOR create-profile (no auth, no signup token)
  console.log('\nTEST 3: IDOR create-profile (no session, no token - should 401)')
  const idor = await vc(`${PROD}/api/auth/create-profile`, 'POST',
    JSON.stringify({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'buddy', payload: { hourly_rate: 1, location_city: 'PWNED', bio: 'evil' } }))
  show('idor', idor)

  // 4. Stale autoConfirm (deprecated)
  console.log('\nTEST 4: autoConfirm deprecated flag (should reject, only signupToken now)')
  const dep = await vc(`${PROD}/api/auth/create-profile`, 'POST',
    JSON.stringify({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'tourist', payload: {}, autoConfirm: true }))
  show('autoConfirm', dep)

  // 5. Type confusion
  console.log('\nTEST 5: Type confusion (object userId)')
  const tc = await vc(`${PROD}/api/auth/create-profile`, 'POST',
    JSON.stringify({ userId: { $ne: null }, role: 'tourist', payload: {} }))
  show('type confusion', tc)

  // 6. Huge payload
  console.log('\nTEST 6: Huge payload (should be bounded, return 4xx)')
  const huge = await vc(`${PROD}/api/auth/create-profile`, 'POST',
    JSON.stringify({ userId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', role: 'tourist', payload: { bio: 'X'.repeat(200_000) } }))
  show('huge', huge)

  console.log('\n=== END ===')
}

main().catch(e => { console.error(e); process.exit(1) })
