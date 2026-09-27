// scripts/test-otp-flow-e2e.mjs
// End-to-end test of the new signup → OTP → complete flow.
// Run against the deployed Vercel production.

const PROD = 'https://localit-nhattoann.vercel.app'
const TEST_EMAIL = `test-otp-${Date.now()}@localit-test.dev`

async function req(path, opts = {}) {
  const res = await fetch(`${PROD}${path}`, {
    method: opts.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(opts.headers ?? {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

function expect(cond, msg) {
  if (!cond) {
    console.error('❌', msg)
    process.exit(1)
  }
  console.log('✓', msg)
}

console.log('\n=== Test 1: signup/start returns 200 + signupId ===')
const start = await req('/api/auth/signup/start', {
  method: 'POST',
  body: {
    email: TEST_EMAIL,
    password: 'Password123!',
    fullName: 'OTP Tester',
    phone: '+84 901 234 567',
  },
})
console.log('  status:', start.status)
console.log('  body:', JSON.stringify(start.body))
expect(start.status === 200, 'start returns 200')
expect(typeof start.body.signupId === 'string', 'start returns signupId')
const signupId = start.body.signupId

console.log('\n=== Test 2: signup/start rejects bad email ===')
const badEmail = await req('/api/auth/signup/start', {
  method: 'POST',
  body: { email: 'not-an-email', password: 'Password123!', fullName: 'X' },
})
console.log('  status:', badEmail.status, 'body:', JSON.stringify(badEmail.body))
expect(badEmail.status === 400, 'bad email returns 400')

console.log('\n=== Test 3: signup/start rejects weak password ===')
const weakPw = await req('/api/auth/signup/start', {
  method: 'POST',
  body: { email: `weak-${Date.now()}@x.dev`, password: 'short', fullName: 'X' },
})
console.log('  status:', weakPw.status, 'body:', JSON.stringify(weakPw.body))
expect(weakPw.status === 400, 'weak password returns 400')

console.log('\n=== Test 4: signup/start rejects already-registered email ===')
const existing = await req('/api/auth/signup/start', {
  method: 'POST',
  body: { email: 'lan.pham@localit.dev', password: 'Password123!', fullName: 'X' },
})
console.log('  status:', existing.status, 'body:', JSON.stringify(existing.body))
expect(existing.status === 400, 'existing email returns 400')

console.log('\n=== Test 5: verify-otp with wrong code returns 400 ===')
const wrong = await req('/api/auth/signup/verify-otp', {
  method: 'POST',
  body: { signupId, code: '000000' },
})
console.log('  status:', wrong.status, 'body:', JSON.stringify(wrong.body))
expect(wrong.status === 400 || wrong.status === 410, 'wrong code returns 4xx')

console.log('\n=== Test 6: verify-otp with malformed code returns 400 ===')
const malformed = await req('/api/auth/signup/verify-otp', {
  method: 'POST',
  body: { signupId, code: 'abc123' },
})
console.log('  status:', malformed.status, 'body:', JSON.stringify(malformed.body))
expect(malformed.status === 400, 'malformed code returns 400')

console.log('\n=== Test 7: complete without verified_at returns 403 ===')
// We can't actually verify the OTP without the code in the email,
// but we CAN verify that /complete refuses if verified_at is null.
const noVerify = await req('/api/auth/signup/complete', {
  method: 'POST',
  body: { signupId, role: 'tourist', profilePayload: {} },
})
console.log('  status:', noVerify.status, 'body:', JSON.stringify(noVerify.body))
expect(noVerify.status === 403, 'unverified signup returns 403')

console.log('\n=== Test 8: resend-otp returns new signupId ===')
const resend = await req('/api/auth/signup/resend-otp', {
  method: 'POST',
  body: { signupId },
})
console.log('  status:', resend.status, 'body:', JSON.stringify(resend.body))
expect(resend.status === 200, 'resend returns 200')
expect(typeof resend.body.signupId === 'string', 'resend returns new signupId')

console.log('\n=== Test 9: complete with unknown signupId returns 404 ===')
const ghost = await req('/api/auth/signup/complete', {
  method: 'POST',
  body: { signupId: '00000000-0000-0000-0000-000000000000', role: 'tourist', profilePayload: {} },
})
console.log('  status:', ghost.status, 'body:', JSON.stringify(ghost.body))
expect(ghost.status === 404, 'unknown signupId returns 404')

console.log('\n=== Test 10: GET /register loads with new step labels ===')
const html = await (await fetch(`${PROD}/register`)).text()
expect(html.includes('Send verification code'), 'register page has new CTA')
expect(html.includes('Check your inbox'), 'register page has verify-email step header')
expect(html.includes('Verify and continue'), 'register page has verify button')

console.log('\n=== All tests passed ===')
console.log(`\nNote: signupId ${signupId} remains pending in DB (will auto-expire in 15 min).`)
console.log(`Test email: ${TEST_EMAIL}`)
