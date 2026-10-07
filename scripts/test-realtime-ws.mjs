// Get real JWT for our test users and test broadcast
import WebSocket from 'ws'

const SUPABASE_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.msg || 'signin failed')
  return json.access_token
}

function makeClient(label, accessToken) {
  const ws = new WebSocket(
    `wss://pqvnjgyqbxlylawwogjv.supabase.co/realtime/v1/websocket?apikey=${ANON_KEY}&vsn=1.0.0`
  )
  let ref = 0
  function send(topic, event, payload) {
    ref++
    ws.send(JSON.stringify({ topic, event, payload, ref: String(ref) }))
    console.log(`[${label}] SEND ${event} ref=${ref}`)
  }
  ws.on('open', () => {
    console.log(`[${label}] OPEN`)
    send('realtime:da-nang-live-locations', 'phx_join', {
      config: { broadcast: { self: false }, presence: { key: '' } },
      access_token: accessToken,
    })
  })
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    const summary = JSON.stringify(msg.payload).slice(0, 200)
    console.log(`[${label}] RECV ${msg.event} ref=${msg.ref} ${summary}`)
  })
  ws.on('error', (e) => console.log(`[${label}] ERROR: ${e.message}`))
  ws.on('close', (c, r) => console.log(`[${label}] CLOSE ${c} ${r}`))
  return { ws, send }
}

const tokenA = await signIn('lan.pham@localit.dev', 'password123')
const tokenB = await signIn('john.doe@example.com', 'password123')
console.log('tokenA:', tokenA.slice(0, 30))
console.log('tokenB:', tokenB.slice(0, 30))

const a = makeClient('A', tokenA)
setTimeout(() => {
  const b = makeClient('B', tokenB)
  setTimeout(() => {
    a.send('realtime:da-nang-live-locations', 'broadcast', {
      type: 'broadcast',
      event: 'loc:update',
      payload: { userId: '11111111-1111-1111-1111-111111111111', name: 'Lan', lat: 16.0544, lng: 108.2023, ts: Date.now() },
    })
  }, 3000)
}, 1000)

setTimeout(() => process.exit(0), 10000)