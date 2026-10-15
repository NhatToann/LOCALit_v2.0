/**
 * Enable local testing of the new password-reset OTP flow.
 *
 * Three things .env.local needs, none of which the repo ships:
 *   1. POSTGRES_* — the DB password, so utils/db-pg.ts can store codes and
 *      write the password hash. Without it every route 500s on
 *      "pg client not configured".
 *   2. OTP_PREVIEW=true — echoes the code as __devCode so the flow is
 *      testable without an inbox.
 *
 * SMTP/Resend are left alone: with no mail transport configured,
 * utils/email.ts logs the code to the dev server console instead of
 * sending. OTP_PREVIEW short-circuits before that.
 *
 * This only touches .env.local, which is gitignored. Values come from
 * AGENTS.md's credentials block.
 */
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'

const FILE = '.env.local'
const before = readFileSync(FILE, 'utf8')
copyFileSync(FILE, `${FILE}.bak`)

const set = (text, key, value) => {
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(text)) return text.replace(re, line)
  return `${text.replace(/\n*$/, '')}\n${line}\n`
}

let out = before
// pg connection — read directly by utils/db-pg.ts
out = set(out, 'POSTGRES_HOST', 'db.pqvnjgyqbxlylawwogjv.supabase.co')
out = set(out, 'POSTGRES_PORT', '5432')
out = set(out, 'POSTGRES_USER', 'postgres')
out = set(out, 'POSTGRES_DATABASE', 'postgres')
out = set(out, 'POSTGRES_PASSWORD', 'that1arlecchino')
// Drop the redacted pooler URL so it cannot win over the host/password path.
out = set(out, 'POSTGRES_URL', '')
// Echo the code so no inbox is needed.
out = set(out, 'OTP_PREVIEW', 'true')

writeFileSync(FILE, out)

console.log('wrote .env.local (backup at .env.local.bak)')
console.log('')
console.log('POSTGRES_HOST     = db.pqvnjgyqbxlylawwogjv.supabase.co')
console.log('POSTGRES_PASSWORD = <set from AGENTS.md>')
console.log('POSTGRES_URL      = "" (cleared — redacted value was unusable)')
console.log('OTP_PREVIEW       = true  (code echoed as __devCode)')
console.log('')
console.log('NOT set: SMTP_* / RESEND_API_KEY (still [SENSITIVE]).')
console.log('With OTP_PREVIEW=true the mailer is never reached, so this is fine')
console.log('for local testing. Production has the real values in Vercel.')