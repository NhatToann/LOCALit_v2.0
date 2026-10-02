// scripts/diag-online-after-fix.mjs — final state check
import { Client } from 'pg'

const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})
await c.connect()

const r = await c.query(`
  SELECT full_name, role, is_online, last_seen
  FROM public.profiles
  ORDER BY is_online DESC, last_seen DESC NULLS LAST
`)
console.log('Final profile state:')
for (const row of r.rows) {
  const tag = row.is_online ? '🟢 ONLINE' : '⚪ offline'
  console.log(`  ${tag} | ${row.full_name.padEnd(20)} | ${row.role.padEnd(8)} | last_seen: ${row.last_seen ?? 'null'}`)
}

// Cleanup any leftover test conv from the FK-fix diagnostic
const r2 = await c.query(`
  DELETE FROM public.conversations
  WHERE tourist_id = 'aaaa1111-1111-1111-1111-111111111111'
    AND buddy_id   = '11111111-1111-1111-1111-111111111111'
  RETURNING id
`)
console.log(`Cleaned up ${r2.rowCount} test conv(s)`)
await c.end()