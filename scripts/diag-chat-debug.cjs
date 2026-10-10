const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: 'postgresql://postgres:' + process.env.DB_PW + '@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const r = await c.query(
    "SELECT id, full_name, role FROM public.profiles WHERE full_name ILIKE '%nh%E1%BA%ADt%' OR full_name ILIKE '%lan%' OR full_name ILIKE '%minh%' ORDER BY full_name"
  );
  console.log('PROFILES:');
  console.log(JSON.stringify(r.rows, null, 2));

  const ids = r.rows.map((x) => x.id);
  if (ids.length === 0) {
    console.log('No matching profiles');
    await c.end();
    return;
  }

  const convs = await c.query(
    "SELECT id, tourist_id, buddy_id, last_message_preview, last_message_at FROM public.conversations WHERE tourist_id = ANY($1) OR buddy_id = ANY($1) ORDER BY last_message_at DESC NULLS LAST",
    [ids],
  );
  console.log('CONVS:');
  console.log(JSON.stringify(convs.rows, null, 2));

  const msgs = await c.query(
    "SELECT id, conversation_id, sender_id, content, created_at, deleted_at FROM public.messages WHERE conversation_id = ANY($1) ORDER BY created_at DESC LIMIT 30",
    [convs.rows.map((x) => x.id)],
  );
  console.log('MSGS:');
  console.log(JSON.stringify(msgs.rows, null, 2));

  await c.end();
})();
