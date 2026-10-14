#!/usr/bin/env node
/** Confirm the reviewer→profiles FK constraint name used by the review join. */
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
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.reviews'::regclass AND contype = 'f'
  `)
  console.log('--- reviews FK constraint names ---')
  for (const row of r.rows) console.log(`  ${row.conname}: ${row.def}`)

  const idx = await client.query(`SELECT indexname FROM pg_indexes WHERE tablename='reviews'`)
  console.log('--- indexes ---')
  for (const row of idx.rows) console.log(`  ${row.indexname}`)

  const pol = await client.query(`
    SELECT policyname, cmd FROM pg_policies WHERE tablename='reviews' ORDER BY cmd
  `)
  console.log('--- policies ---')
  for (const row of pol.rows) console.log(`  [${row.cmd}] ${row.policyname}`)

  const col = await client.query(`
    SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_name='reviews' ORDER BY ordinal_position
  `)
  console.log('--- columns ---')
  for (const row of col.rows) console.log(`  ${row.column_name.padEnd(16)} null=${row.is_nullable}`)
} finally {
  await client.end()
}