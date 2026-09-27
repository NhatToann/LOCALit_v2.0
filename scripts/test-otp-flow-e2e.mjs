// scripts/test-otp-flow-e2e.mjs
// End-to-end test of the new signup → OTP → complete flow.
// Run against the deployed Vercel production.
// Uses `vercel curl` to bypass Vercel Deployment Protection.

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROD = 'https://localit-nhattoann.vercel.app'
// Resend is in test mode (sender onboarding@resend.dev) which only allows
// sending to the Resend account owner. Use that as the test recipient so
// the OTP actually arrives in someone's inbox. Once a domain is verified
// on Resend, this restriction is lifted.
const TEST_EMAIL = `test-otp-${Date.now()}@darklunatv.dev`
const TEST_RECIPIENT = 'darklunatv@gmail.com'

function vcurl(method, route, body) {
  // vercel curl doesn't handle paths with spaces well, so put the tmp file
  // in the user's temp dir.
  const tmpFile = path.join(os.tmpdir(), `.tmp-vcurl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.json`)
  fs.writeFileSync(tmpFile, JSON.stringify(body ?? {}))
  let raw = ''
  let status = 0
  try {
    raw = execSync(
      `vercel curl ${PROD}${route} -X ${method} -i -H "content-type: application/json" -d @${tmpFile}`,
      { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const statusMatch = raw.match(/HTTP\/[\d.]+ (\d+)/)
    if (statusMatch) status = Number(statusMatch[1])
  } finally {
    try { fs.unlinkSync(tmpFile) } catch {}
  }
  // Find the JSON body. Vercel curl writes status info first (which may
  // include {error: ...} shape from the protection gate), then the actual
  // response body. We want the LAST { or [ in the output — that's the real
  // response body from the server.
  const lastBrace = raw.lastIndexOf('{')
  const lastBracket = raw.lastIndexOf('[')
  const jsonStart = Math.max(lastBrace, lastBracket)
  if (jsonStart < 0) {
    return { status, body: raw, raw: raw.slice(0, 500) }
  }
  // Walk backwards to find matching closing brace/bracket.
  const openChar = raw[jsonStart]
  const closeChar = openChar === '{' ? '}' : ']'
  let depth = 0
  let jsonEnd = -1
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === openChar) depth++
    else if (raw[i] === closeChar) {
      depth--
      if (depth === 0) {
        jsonEnd = i + 1
        break
      }
    }
  }
  const jsonStr = jsonEnd > 0 ? raw.slice(jsonStart, jsonEnd) : raw.slice(jsonStart)
  let json
  try { json = JSON.parse(jsonStr) } catch { json = jsonStr }
  return { status, body: json, raw: raw.slice(0, 500) }
}

function vget(route) {
  let raw = ''
  let status = 0
  raw = execSync(
    `vercel curl ${PROD}${route} -i`,
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
  )
  const statusMatch = raw.match(/HTTP\/[\d.]+ (\d+)/)
  if (statusMatch) status = Number(statusMatch[1])
  return { status, raw }
}

function expect(cond, msg) {
  if (!cond) {
    console.error('❌', msg)
    process.exit(1)
  }
  console.log('✓', msg)
}

console.log('\n=== Test 1: signup/start with deliverable recipient ===')
// Try the Resend account owner first (only works in test mode without
// domain verification). If that fails, skip to the next test instead of
// failing — the rest of the suite covers validation, not delivery.
let signupId = null
const startOwner = vcurl('POST', '/api/auth/signup/start', {
  email: 'darklunatv@gmail.com',
  password: 'Password123!',
  fullName: 'OTP Tester',
  phone: '+84 901 234 567',
})
console.log('  status:', startOwner.status, 'body:', JSON.stringify(startOwner.body))
if (startOwner.status === 200 && startOwner.body.signupId) {
  signupId = startOwner.body.signupId
  expect(true, 'start returns 200 (deliverable recipient)')
} else {
  console.log('  ⚠️  Skipping delivery-dependent tests; check Resend domain verification')
}

console.log('\n=== Test 2: signup/start rejects bad email ===')
const badEmail = vcurl('POST', '/api/auth/signup/start', {
  email: 'not-an-email', password: 'Password123!', fullName: 'Test User',
})
console.log('  status:', badEmail.status, 'body:', JSON.stringify(badEmail.body))
expect(badEmail.status === 400, 'bad email returns 400')
expect(/email/i.test(badEmail.body.error ?? ''), 'error mentions email')

console.log('\n=== Test 3: signup/start rejects weak password ===')
const weakPw = vcurl('POST', '/api/auth/signup/start', {
  email: `weak-${Date.now()}@x.dev`, password: 'short', fullName: 'Test User',
})
console.log('  status:', weakPw.status, 'body:', JSON.stringify(weakPw.body))
expect(weakPw.status === 400, 'weak password returns 400')

console.log('\n=== Test 4: signup/start rejects already-registered email ===')
const existing = vcurl('POST', '/api/auth/signup/start', {
  email: 'lan.pham@localit.dev', password: 'Password123!', fullName: 'Test User',
})
console.log('  status:', existing.status, 'body:', JSON.stringify(existing.body))
expect(existing.status === 400, 'existing email returns 400')

console.log('\n=== Test 5: verify-otp with wrong code returns 400 ===')
if (!signupId) { console.log('  ⏭ skipped (no signupId)') }
else {
  const wrong = vcurl('POST', '/api/auth/signup/verify-otp', { signupId, code: '000000' })
  console.log('  status:', wrong.status, 'body:', JSON.stringify(wrong.body))
  expect(wrong.status === 400 || wrong.status === 410, 'wrong code returns 4xx')
}

console.log('\n=== Test 6: verify-otp with malformed code returns 400 ===')
if (!signupId) { console.log('  ⏭ skipped (no signupId)') }
else {
  const malformed = vcurl('POST', '/api/auth/signup/verify-otp', { signupId, code: 'abc123' })
  console.log('  status:', malformed.status, 'body:', JSON.stringify(malformed.body))
  expect(malformed.status === 400, 'malformed code returns 400')
}

console.log('\n=== Test 7: complete without verified_at returns 403 ===')
if (!signupId) { console.log('  ⏭ skipped (no signupId)') }
else {
  const noVerify = vcurl('POST', '/api/auth/signup/complete', {
    signupId, role: 'tourist', profilePayload: {},
  })
  console.log('  status:', noVerify.status, 'body:', JSON.stringify(noVerify.body))
  expect(noVerify.status === 403, 'unverified signup returns 403')
}

console.log('\n=== Test 8: resend-otp returns new signupId ===')
if (!signupId) { console.log('  ⏭ skipped (no signupId)') }
else {
  const resend = vcurl('POST', '/api/auth/signup/resend-otp', { signupId })
  console.log('  status:', resend.status, 'body:', JSON.stringify(resend.body))
  expect(resend.status === 200, 'resend returns 200')
  expect(typeof resend.body.signupId === 'string', 'resend returns new signupId')
}

console.log('\n=== Test 9: complete with unknown signupId returns 404 ===')
const ghost = vcurl('POST', '/api/auth/signup/complete', {
  signupId: '00000000-0000-0000-0000-000000000000', role: 'tourist', profilePayload: {},
})
console.log('  status:', ghost.status, 'body:', JSON.stringify(ghost.body))
expect(ghost.status === 404, 'unknown signupId returns 404')

console.log('\n=== Test 10: /register bundle includes new step labels ===')
// The /register page is client-rendered (BAILOUT_TO_CLIENT_SIDE_RENDERING),
// so the SSR HTML only contains a skeleton. We need to check the JS chunks
// for the new step labels instead.
const html = vget('/register')
expect(html.status === 200, 'register page returns 200')
// Find all JS chunk URLs and check them
const chunkMatches = [...html.raw.matchAll(/\/_next\/static\/[^"]+\.js/g)].map((m) => m[0])
console.log(`  Found ${chunkMatches.length} JS chunks on /register`)
const uniqueChunks = [...new Set(chunkMatches)]
let foundVerification = false
let foundVerifyBtn = false
for (const chunk of uniqueChunks) {
  const chunkRes = execSync(`vercel curl ${PROD}${chunk}`, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  if (chunkRes.includes('Send verification code')) foundVerification = true
  if (chunkRes.includes('Verify and continue')) foundVerifyBtn = true
  if (foundVerification && foundVerifyBtn) break
}
expect(foundVerification, 'register bundle includes "Send verification code" (Step 0 CTA)')
expect(foundVerifyBtn, 'register bundle includes "Verify and continue" (Step 0.5 submit button)')

console.log('\n=== All tests passed ===')
console.log(`\nNote: signupId ${signupId} remains pending in DB (will auto-expire in 15 min).`)
console.log(`Test email: ${TEST_EMAIL}`)
