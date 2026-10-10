const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: 'postgresql://postgres:' + process.env.DB_PW + '@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(
    "SELECT p.id, p.full_name, p.role, p.is_online, au.email, au.created_at FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE p.id = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'"
  );
  console.log('f2df98b0 PROFILE:');
  console.log(JSON.stringify(r.rows, null, 2));

  // Check all conversations for this user
  const convs = await c.query(
    "SELECT id, tourist_id, buddy_id FROM public.conversations WHERE tourist_id = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01' OR buddy_id = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'"
  );
  console.log('CONVS for f2df98b0:');
  console.log(JSON.stringify(convs.rows, null, 2));

  await c.end();
})();
