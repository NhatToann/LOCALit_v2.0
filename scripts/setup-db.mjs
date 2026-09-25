import { Client } from 'pg'

const client = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const sql = `
  CREATE TABLE IF NOT EXISTS public.test_items (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  ALTER TABLE public.test_items ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Allow public read" ON public.test_items;
  CREATE POLICY "Allow public read" ON public.test_items FOR SELECT USING (true);

  INSERT INTO public.test_items (name) VALUES
    ('Welcome to LOCALit'),
    ('Connecting tourists with local buddies'),
    ('Discover Da Nang'),
    ('Authentic local experiences'),
    ('Your journey starts here')
  ON CONFLICT DO NOTHING;
`

async function main() {
  try {
    await client.connect()
    console.log('✅ Connected to Supabase Postgres')
    await client.query(sql)
    console.log('✅ Schema applied and sample data inserted')
    const res = await client.query('SELECT id, name, created_at FROM public.test_items ORDER BY id')
    console.log(`\n📋 Current rows (${res.rowCount}):`)
    res.rows.forEach((r) => console.log(`   #${r.id} - ${r.name}`))
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
