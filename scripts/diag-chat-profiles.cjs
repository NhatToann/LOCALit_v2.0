const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: 'postgresql://postgres:' + process.env.DB_PW + '@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(
    "SELECT p.id, p.full_name, p.role, p.is_online, au.email FROM public.profiles p LEFT JOIN auth.users au ON au.id = p.id WHERE p.full_name ILIKE '%nh%E1%BA%ADt%' OR p.full_name ILIKE '%lan%' OR p.full_name ILIKE '%minh%' OR p.full_name ILIKE '%tá%' OR p.full_name ILIKE '%b%E1%BA%A3o%' OR p.full_name ILIKE '%pham%' OR p.full_name ILIKE '%toan%' ORDER BY p.full_name"
  );
  console.log('PROFILES WITH EMAIL:');
  console.log(JSON.stringify(r.rows, null, 2));

  await c.end();
})();
