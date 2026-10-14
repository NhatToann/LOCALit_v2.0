#!/usr/bin/env node
/**
 * Why does the reset link bounce to /?error=access_denied&otp_expired?
 *
 * The redirect landed on the SITE ROOT, not /reset-password. That is the
 * fingerprint of a rejected `redirect_to`: GoTrue refuses to redirect
 * off-allowlist and instead returns an error payload to whatever URL the
 * allowlist DOES contain — the root.
 *
 * So the real question is: does the Supabase project's
 * auth.redirectToUrl / URI allowlist contain this deployment, and does it
 * still contain the *current* deployment hostname after the alias moved?
 */
const URL_BASE = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_KEY) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY to run this probe.')
  process.exit(1)
}

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function get(path) {
  const res = await fetch(`${URL_BASE}${path}`, { headers })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { status: res.status, body: json }
}

// 1. Auth settings — the redirect allowlist lives here.
const settings = await get('/auth/v1/admin/generate_link')
console.log('--- generate_link probe status ---')
console.log(`  ${settings.status} ${JSON.stringify(settings.body).slice(0, 200)}`)

// 2. Explicitly read the config endpoint.
for (const path of [
  '/auth/v1/settings',
  '/auth/v1/admin/settings',
]) {
  const r = await get(path)
  console.log(`--- ${path} ---`)
  console.log(`  ${r.status} ${JSON.stringify(r.body).slice(0, 400)}`)
}

// 3. The decisive test: ask GoTrue for a recovery link with the exact
//    redirect_to the app sends, and see where it actually points.
const redirectTo = 'https://localit-vn.vercel.app/reset-password'
const link = await fetch(`${URL_BASE}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    type: 'recovery',
    email: 'darklunatv@gmail.com',
    options: { redirect_to: redirectTo },
  }),
})
const linkBody = await link.json().catch(() => ({}))
console.log('--- generate_link (recovery, redirect_to=localit-vn) ---')
console.log(`  ${link.status}`)
const actionLink = linkBody.action_link || linkBody.properties?.action_link
if (actionLink) {
  try {
    const u = new URL(actionLink)
    console.log(`  redirect_to seen by GoTrue: ${u.pathname}${u.search}`)
    console.log(`  host: ${u.hostname}`)
  } catch {
    console.log('  (unparseable action_link)')
  }
} else {
  console.log('  ' + JSON.stringify(linkBody).slice(0, 300))
}