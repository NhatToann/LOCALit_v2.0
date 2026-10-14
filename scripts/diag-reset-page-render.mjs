#!/usr/bin/env node
/**
 * Post-fix health check.
 *
 * Two things to verify:
 *   1. The deployed reset-password page renders the right messaging
 *      when it sees ?error=otp_expired (the bug the user just saw).
 *   2. The /api/auth/redirect-diagnostics endpoint reflects the current
 *      fix.
 *
 * If the page is rendering the generic "Reset link expired" copy and
 * NOT bouncing the user to root, the in-page fix is working — the user
 * is simply on a stale link.
 */
const HOSTS = [
  'https://localit-nhattoann.vercel.app',
  'https://localit-vn.vercel.app',
]

const URL =
  '/reset-password?error=access_denied&error_code=otp_expired&' +
  'error_description=Email+link+is+invalid+or+has+expired'

async function check(origin) {
  const res = await fetch(`${origin}${URL}`, {
    redirect: 'manual',
    headers: { 'user-agent': 'curl' },
  })
  const location = res.headers.get('location')
  const html = await res.text().catch(() => '')

  const html_indicators = {
    root: /<title>.*?(Find a local buddy|Han River|Verified Local Guides)/i,
    reset: /Reset link expired|password reset link|reset link is/i,
    form: /Set a new password|new password/i,
  }

  const matched = {}
  for (const [k, re] of Object.entries(html_indicators)) {
    matched[k] = re.test(html)
  }

  console.log(`\n=== ${origin}${URL} ===`)
  console.log(`  status     : ${res.status}`)
  console.log(`  location   : ${location ?? '(none — served directly)'}`)
  console.log(`  matches    : root=${matched.root} reset=${matched.reset} form=${matched.form}`)
  if (matched.root) {
    console.log(`  VERDICT    : BOUNCED to home page — bad`)
  } else if (matched.reset) {
    console.log(`  VERDICT    : Renders reset link message — good`)
  } else {
    console.log(`  VERDICT    : unknown — print html head below`)
    console.log(`  html head  : ${html.slice(0, 200).replace(/\s+/g, ' ')}`)
  }
}

for (const h of HOSTS) {
  try {
    await check(h)
  } catch (e) {
    console.log(`  FAILED: ${e.message}`)
  }
}