// scripts/smoke-otp-flow.mjs
// Drive the full post-refactor OTP sign-up flow against production.

const PROD = 'https://localit-hh3cfwjsx-nhattoann.vercel.app'
const email = `flowtest.${Date.now()}@gmail.com`
const password = 'FlowTest#OTP2026'
const fullName = 'Flow Test'
const role = 'tourist'

console.log('1) POST /api/auth/signup-admin', email)
const r1 = await fetch(`${PROD}/api/auth/signup-admin`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password, fullName, role }),
})
console.log('  status', r1.status)
const j1 = await r1.json()
console.log('  body', JSON.stringify(j1))
const userId = j1.userId
if (!userId) { console.error('NO userId'); process.exit(1) }

// In production there is no devCode echo (NODE_ENV=production). The OTP was
// emailed (Resend sandbox only sends to owner email — but for non-owner
// emails it just 403s, the userId/auth.users row is still created).
//
// We can't simulate entering the actual code without it. For prod smoke we
// stop here and ask the user to do the rest in the browser. Just confirm:
//   - auth.users has the new row (null confirmed_at)
//   - email_verifications has an unconsumed code
// print and exit.

console.log('\nUser created. Confirming via DB:')
