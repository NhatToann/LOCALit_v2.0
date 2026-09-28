// Standalone JWT signing test for the Stringee access token.
// Verifies that we produce a token Stringee would accept (HS256,
// header.alg=HS256, header.cty=stringee-api;v=1, payload.iss=key-sid,
// payload.userId=user-uuid, signed with the secret).

import { createHmac } from 'node:crypto'

const API_KEY_SID = 'SK.0.xrIw0yUPPlXKDtCjQd8aC3JkpHHHz793'
const API_KEY_SECRET = 'YTZOOVJ3aGIzempFSkxwakQ5WFBKNmtMQ0N6WDNDeGM='
const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function signHs256(header, payload, secret) {
  const h = b64url(JSON.stringify(header))
  const p = b64url(JSON.stringify(payload))
  const data = `${h}.${p}`
  const sig = createHmac('sha256', secret).update(data).digest()
  return `${data}.${b64url(sig)}`
}

const header = { typ: 'JWT', alg: 'HS256', cty: 'stringee-api;v=1' }
const nowSec = Math.floor(Date.now() / 1000)
const payload = {
  jti: `${API_KEY_SID}-${nowSec}`,
  iss: API_KEY_SID,
  exp: nowSec + 3600,
  userId: USER_ID,
}
const token = signHs256(header, payload, API_KEY_SECRET)

console.log('--- Generated Stringee access token ---')
console.log(token)
console.log('\n--- Decoded header ---')
console.log(JSON.stringify(JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString()), null, 2))
console.log('\n--- Decoded payload ---')
console.log(JSON.stringify(JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()), null, 2))

// Sanity check: verify by re-signing
const [h, p, s] = token.split('.')
const expected = createHmac('sha256', API_KEY_SECRET).update(`${h}.${p}`).digest('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
if (expected !== s) {
  console.error('FAIL: signature mismatch')
  process.exit(1)
}
console.log('\nOK: signature verifies with the secret')

// Now try hitting Stringee to see if it accepts
console.log('\n--- Probing Stringee connectivity ---')
const res = await fetch('https://api.stringee.com/v1/user', {
  method: 'GET',
  headers: {
    'X-STRINGEE-AUTH': token,
    Accept: 'application/json',
  },
})
console.log('Status:', res.status)
const body = await res.text()
console.log('Body:', body.slice(0, 400))
