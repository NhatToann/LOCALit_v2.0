import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// John Doe mapping
const r1 = await c.query(`
  SELECT p.id as profile_id, p.email, t.id as tourist_id, b.id as buddy_id
  FROM public.profiles p
  LEFT JOIN public.tourists t ON t.id = p.id
  LEFT JOIN public.buddies b ON b.id = p.id
  WHERE p.email = 'john.doe@example.com'
`);
console.log('John:', r1.rows[0]);

// Conversation 347f782e
const r2 = await c.query(`
  SELECT id, tourist_id, buddy_id FROM public.conversations WHERE id = '347f782e-0000-0000-0000-000000000000' OR id::text LIKE '347f782e%'
`);
console.log('Conv:', r2.rows);
for (const row of r2.rows) {
  const r3 = await c.query(`SELECT id, user_id FROM public.tourists WHERE id = $1`, [row.tourist_id]);
  const r4 = await c.query(`SELECT id, user_id FROM public.buddies WHERE id = $1`, [row.buddy_id]);
  console.log(`  tourist_id=${row.tourist_id?.slice(0,8)} → ${r3.rows[0]?.user_id?.slice(0,8) || 'null'}`);
  console.log(`  buddy_id=${row.buddy_id?.slice(0,8)} → ${r4.rows[0]?.user_id?.slice(0,8) || 'null'}`);
}
await c.end();
