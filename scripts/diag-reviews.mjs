#!/usr/bin/env node
/**
 * One-off diagnostic: what does public.reviews look like right now?
 * The unified-itinerary migration dropped public.trips CASCADE, which
 * would have dropped the reviews.trip_id FK too. We need the live
 * shape before writing the profile-review migration.
 */
import { Client } from 'pg'

const PROJECT_REF = 'pqvnjgyqbxlylawwogjv'

const client = new Client({
  host: `db.${PROJECT_REF}.supabase.co`,
  port: 5432,
  user: 'postgres',
  password: process.env.DB_PW || process.env.SUPABASE_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
})

await client.connect()

try {
  const cols = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews'
    ORDER BY ordinal_position
  `)
  console.log('--- reviews columns ---')
  for (const r of cols.rows) {
    console.log(`  ${r.column_name.padEnd(16)} ${r.data_type.padEnd(28)} null=${r.is_nullable}`)
  }

  const fks = await client.query(`
    SELECT tc.constraint_name, kcu.column_name, ccu.table_name AS ref_table
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_schema = 'public' AND tc.table_name = 'reviews'
      AND tc.constraint_type = 'FOREIGN KEY'
  `)
  console.log('--- reviews FKs ---')
  for (const r of fks.rows) console.log(`  ${r.column_name} -> ${r.ref_table}`)

  const pols = await client.query(`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reviews'
  `)
  console.log('--- reviews policies ---')
  for (const r of pols.rows) console.log(`  [${r.cmd}] ${r.policyname}`)

  const cnt = await client.query('SELECT COUNT(*)::int AS c FROM public.reviews')
  console.log('--- rows ---')
  console.log(`  reviews: ${cnt.rows[0].c}`)

  const itins = await client.query(`
    SELECT COUNT(*)::int AS c FROM information_schema.tables
    WHERE table_schema='public' AND table_name='itineraries'
  `)
  console.log(`  itineraries table exists: ${itins.rows[0].c > 0}`)
} finally {
  await client.end()
}