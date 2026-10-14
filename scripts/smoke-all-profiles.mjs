#!/usr/bin/env node
/**
 * Verify EVERY public profile route returns 200 on production.
 *
 * Run after any change to the buddies/tourists profile fallback. A single
 * 404 here means someone still cannot open their own profile — the exact
 * bug reported on 2026-10-10.
 */
import { Client } from 'pg'

const ORIGIN = 'https://localit-vn.vercel.app'

const pg = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD || 'that1arlecchino',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await pg.connect()
const { rows: people } = await pg.query(
  `SELECT p.id, p.full_name, p.role,
          (b.latitude IS NOT NULL AND b.longitude IS NOT NULL) AS has_gps
   FROM public.profiles p
   LEFT JOIN public.buddies b ON b.id = p.id
   ORDER BY p.role, p.full_name`,
)
await pg.end()

let pass = 0
let fail = 0

console.log(`\nChecking ${people.length} profile pages on ${ORIGIN}\n`)

for (const p of people) {
  const seg = p.role === 'buddy' ? 'buddies' : 'tourists'
  const url = `${ORIGIN}/${seg}/${p.id}`
  let status = 0
  try {
    const res = await fetch(url, { redirect: 'manual' })
    status = res.status
    await res.text()
  } catch (e) {
    status = -1
  }
  const ok = status === 200
  ok ? pass++ : fail++
  const gps = p.role === 'buddy' ? (p.has_gps ? 'GPS' : 'no GPS') : ''
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${String(status).padEnd(4)} ${p.role.padEnd(8)} ${p.full_name.padEnd(18)} ${gps}`,
  )
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail > 0 ? 1 : 0)