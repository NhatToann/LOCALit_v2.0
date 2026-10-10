const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: 'postgresql://postgres:' + process.env.DB_PW + '@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(
    "SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS using_clause, pg_get_expr(polwithcheck, polrelid) AS with_check FROM pg_policy WHERE polrelid = 'public.messages'::regclass ORDER BY polname"
  );
  console.log('messages policies:');
  console.log(JSON.stringify(r.rows, null, 2));

  const r2 = await c.query(
    "SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS using_clause, pg_get_expr(polwithcheck, polrelid) AS with_check FROM pg_policy WHERE polrelid = 'public.conversations'::regclass ORDER BY polname"
  );
  console.log('conversations policies:');
  console.log(JSON.stringify(r2.rows, null, 2));

  const r3 = await c.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'messages' AND table_schema = 'public' ORDER BY ordinal_position"
  );
  console.log('messages columns:');
  console.log(JSON.stringify(r3.rows, null, 2));

  await c.end();
})();
