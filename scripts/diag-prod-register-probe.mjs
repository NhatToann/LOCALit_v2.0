// Probe production register flow through vercel curl's protection bypass.
// We shell out to vercel curl because direct fetch hits Vercel SSO gate.
import { execSync } from 'node:child_process'

const BASE = 'https://localit-5bg28iqrf-nhattoann.vercel.app'
const TEST_EMAIL = `dbg_${Date.now()}@example.com`
const TEST_PW = 'password123'

function vc(method, path, body) {
  const json = JSON.stringify(body)
  // vercel curl takes curl args after the URL; we use -X to set method and -d for body.
  const stdout = execSync(
    `vercel curl ${BASE}${path} -X ${method} -H "Content-Type: application/json" -d ${JSON.stringify(json)}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return stdout
}

async function main() {
  console.log('=== Production register flow probe ===')

  let signupOut
  try {
    signupOut = vc('POST', '/api/auth/signup-admin', {
      email: TEST_EMAIL,
      password: TEST_PW,
      fullName: 'Debug Tourist',
      role: 'tourist',
    })
  } catch (e) {
    console.log('signup-admin threw:', e.message?.slice(0, 600))
    return
  }
  console.log('signup-admin output:')
  console.log(signupOut.slice(0, 600))
  let parsed
  try { parsed = JSON.parse(signupOut) } catch {}
  const userId = parsed?.userId
  if (!userId) {
    console.log('No userId returned, stopping.')
    return
  }
  console.log('userId =', userId)
  console.log('---')

  let profileOut
  try {
    profileOut = vc('POST', '/api/auth/create-profile', {
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
  } catch (e) {
    console.log('create-profile threw:', e.message?.slice(0, 600))
    return
  }
  console.log('create-profile output:')
  console.log(profileOut.slice(0, 1500))
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })