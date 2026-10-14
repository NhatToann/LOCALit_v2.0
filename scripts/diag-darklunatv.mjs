#!/usr/bin/env node
/** Which localit profile owns darklunatv@gmail.com? */
import { Client } from 'pg'

const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await client.connect()
try {
  const r = await client.query(`
    SELECT p.id, p.full_name, p.email, p.role,
           CASE WHEN b.id IS NOT NULL THEN 'buddy' ELSE '' END AS has_buddy,
           CASE WHEN t.id IS NOT NULL THEN 'tourist' ELSE '' END AS has_tourist
    FROM public.profiles p
    LEFT JOIN public.buddies b ON b.id = p.id
    LEFT JOIN public.tourists t ON t.id = p.id
    WHERE lower(p.email) = lower($1)
  `, ['darklunatv@gmail.com'])
  console.log('--- profiles with darklunatv@gmail.com ---')
  console.log(JSON.stringify(r.rows, null, 2))

  const all = await client.query(`
    SELECT full_name, email, role FROM public.profiles ORDER BY full_name
  `)
  console.log('--- all profiles ---')
  for (const row of all.rows) console.log(`  ${row.full_name.padEnd(20)} ${row.email}`)

  const authEmail = await client.query(`
    SELECT email, email_confirmed_at IS NOT NULL AS confirmed
    FROM auth.users WHERE lower(email) = lower($1)
  `, ['darklunatv@gmail.com'])
  console.log('--- auth.users match ---')
  console.log(JSON.stringify(authEmail.rows, null, 2))
} finally {
  await client.end()
}