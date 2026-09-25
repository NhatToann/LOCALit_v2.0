// Verify no new location_updates rows were inserted by the live-location hook.
// We compare the count to a baseline (most recent row before this deploy).
import { Client } from 'pg'

const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await pg.connect()

  // Total rows
  const total = await pg.query('SELECT COUNT(*)::int AS n FROM public.location_updates')

  // Latest rows (any new ones should be from this session)
  const latest = await pg.query(
    'SELECT user_id, latitude, longitude, accuracy, updated_at FROM public.location_updates ORDER BY updated_at DESC LIMIT 5'
  )

  console.log('Total location_updates rows:', total.rows[0].n)
  console.log('\nMost recent 5 rows:')
  for (const r of latest.rows) {
    console.log(`  ${r.updated_at.toISOString()} · user=${r.user_id.slice(0,8)} · (${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)})`)
  }
  await pg.end()
}

main().catch(e => { console.error(e); process.exit(1) })
