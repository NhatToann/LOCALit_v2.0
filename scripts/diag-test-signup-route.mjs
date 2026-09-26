// Direct test of /api/auth/signup-admin
const URL = 'https://localit-i4r7k0ccm-nhattoann.vercel.app'
const BODY = {
  email: `direct-api-${Date.now()}@localit-test.dev`,
  password: 'TestPass-1234',
  fullName: 'Direct API',
  role: 'tourist',
}
;(async () => {
  console.log('Body:', BODY)
  const res = await fetch(`${URL}/api/auth/signup-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(BODY),
  })
  console.log('status:', res.status)
  const text = await res.text()
  console.log('body:', text.substring(0, 800))
})()
