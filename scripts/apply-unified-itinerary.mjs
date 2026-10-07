#!/usr/bin/env node
// Applies PART-A (drop + tables) then PART-B (RLS + grants).
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

const DB_PW = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PW
if (!DB_PW) { console.error('Missing DB_PW'); process.exit(1) }
const client = new Client({
  host: 'db.pqvnjgyqbxlylawwogjv.supabase.co',
  port: 5432,
  user: 'postgres',
  password: DB_PW,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

;(async () => {
  await client.connect()
  for (const file of [
    'supabase/migrations/2026-10-07-unified-itinerary-PART-A-drop-and-tables.sql',
    'supabase/migrations/2026-10-07-unified-itinerary-PART-B-rls-and-grants.sql',
  ]) {
    const sql = fs.readFileSync(path.join(process.cwd(), file), 'utf8')
    console.log('→', file)
    await client.query(sql)
  }
  console.log('OK')
  await client.end()
})().catch((e) => { console.error('FAIL', e.message); process.exit(1) })
