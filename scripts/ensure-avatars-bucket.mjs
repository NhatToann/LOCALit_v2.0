import { readFileSync, existsSync } from 'node:fs'
import { Client } from 'pg'
import { createClient } from '@supabase/supabase-js'

// Force-load service role via explicit read
function load(file) {
  if (!existsSync(file)) return
  const txt = readFileSync(file, 'utf8')
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"([^"]*)"\s*$/)
    if (m) {
      process.env[m[1]] = process.env[m[1]] ?? m[2]
    }
  }
}
load('.env.secrets')
load('.env.local')

const url = process.env.SUPABASE_URL || 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const sk = process.env.SUPABASE_SERVICE_ROLE_KEY
console.log('URL prefix:', url?.slice(0, 30))
console.log('Service key prefix:', sk?.slice(0, 20))
console.log('Service key length:', sk?.length)
if (!sk) {
  console.error('No service key loaded')
  process.exit(1)
}

const admin = createClient(url, sk, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data, error } = await admin.storage.listBuckets()
if (error) {
  console.error('listBuckets error:', error.message, 'name=', error.name)
  process.exit(2)
}
console.log('Buckets:', data?.map((b) => b.name))
