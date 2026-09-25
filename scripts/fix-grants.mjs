import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
const TABLES = ['profiles', 'tourists', 'buddies', 'trips', 'connections', 'conversations', 'reviews', 'location_updates', 'test_items']
async function main() {
  await c.connect()
  for (const t of TABLES) {
    const sql = `
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO anon;
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${t} TO authenticated;
    `
    try {
      await c.query(sql)
      console.log(`Granted on ${t}`)
    } catch (err) {
      console.log(`Error on ${t}: ${err.message}`)
    }
  }
  await c.end()
}
main().catch(console.error)
