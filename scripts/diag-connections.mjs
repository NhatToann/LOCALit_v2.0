#!/usr/bin/env node
/** Diagnostic: connections shape + grants, to design the review gate. */
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
    WHERE table_schema='public' AND table_name='connections'
    ORDER BY ordinal_position
  `)
  console.log('--- connections columns ---')
  for (const r of cols.rows) console.log(`  ${r.column_name.padEnd(18)} ${r.data_type.padEnd(24)} null=${r.is_nullable}`)

  const st = await client.query(`
    SELECT status, COUNT(*)::int AS c FROM public.connections GROUP BY status ORDER BY c DESC
  `)
  console.log('--- connections by status ---')
  for (const r of st.rows) console.log(`  ${String(r.status).padEnd(12)} ${r.c}`)

  const g = await client.query(`
    SELECT table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('reviews','connections')
      AND grantee IN ('anon','authenticated')
    ORDER BY table_name, privilege_type
  `)
  console.log('--- grants ---')
  for (const r of g.rows) console.log(`  ${r.table_name.padEnd(14)} ${r.privilege_type}`)

  const cp = await client.query(`
    SELECT policyname, cmd FROM pg_policies
    WHERE schemaname='public' AND tablename='connections'
  `)
  console.log('--- connections policies ---')
  for (const r of cp.rows) console.log(`  [${r.cmd}] ${r.policyname}`)

  const revCols = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name='reviews'
  `)
  console.log('--- reviews column names ---')
  console.log('  ' + revCols.rows.map((r) => r.column_name).join(', '))

  const uniq = await client.query(`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename='reviews'
  `)
  console.log('--- reviews indexes ---')
  for (const r of uniq.rows) console.log(`  ${r.indexdef}`)
} finally {
  await client.end()
}