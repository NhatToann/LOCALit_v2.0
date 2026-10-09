// diag-env-keys.mjs
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const txt = readFileSync('.env.local', 'utf8')
const env = {}
for (const raw of txt.split(/\r?\n/)) {
  const line = raw.trim()
  if (!line || line.startsWith('#')) continue
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/)
  if (m) env[m[1]] = m[2]
}
console.log('Keys present:', Object.keys(env).filter(k => k.includes('SUPABASE') || k.includes('SERVICE') || k.includes('SECRET')))
for (const k of Object.keys(env).filter(k => k.includes('SUPABASE') || k.includes('SERVICE') || k.includes('SECRET'))) {
  const v = env[k]
  console.log(`  ${k}: prefix=${v.slice(0,12)} len=${v.length} startsWithJWS=${v.startsWith('eyJ')}`)
}
const sk = env.SUPABASE_SECRET_KEY
const url = env.NEXT_PUBLIC_SUPABASE_URL
if (!sk) { console.log('no SUPABASE_SECRET_KEY'); process.exit(1) }
if (sk.startsWith('[SENSITIVE]')) { console.log('SUPABASE_SECRET_KEY is still [SENSITIVE]'); process.exit(1) }
const admin = createClient(url, sk, { auth: { persistSession: false } })
const { data, error } = await admin.from('profiles').select('id').limit(1)
console.log('list profiles:', error ? `ERROR: ${error.message}` : `ok, ${data?.length} rows`)
