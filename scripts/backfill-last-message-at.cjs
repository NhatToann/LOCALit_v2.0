const { Client } = require('pg');

(async () => {
  const c = new Client({
    connectionString: 'postgresql://postgres:' + process.env.DB_PW + '@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  // Backfill last_message_at for every conversation that has messages
  // but a null last_message_at column.
  const r = await c.query(`
    UPDATE public.conversations c
    SET last_message_at = sub.last_at,
        last_message_preview = sub.last_preview
    FROM (
      SELECT DISTINCT ON (m.conversation_id)
        m.conversation_id,
        m.created_at AS last_at,
        m.content AS last_preview
      FROM public.messages m
      WHERE m.deleted_at IS NULL
      ORDER BY m.conversation_id, m.created_at DESC
    ) AS sub
    WHERE c.id = sub.conversation_id
      AND c.last_message_at IS NULL
    RETURNING c.id, c.last_message_at, c.last_message_preview
  `);
  console.log('Backfilled', r.rowCount, 'conversations');
  console.log(JSON.stringify(r.rows, null, 2));

  await c.end();
})();
