const { Client } = require('pg')
;(async () => {
  const c = new Client({
    connectionString:
      'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  // Drop and recreate the policies cleanly
  const drops = [
    'DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications',
    'DROP POLICY IF EXISTS notifications_insert_server ON public.notifications',
  ]
  for (const sql of drops) {
    await c.query(sql)
    console.log('Dropped policy')
  }

  // Create a SECURITY DEFINER function to insert notifications.
  // SECURITY DEFINER runs as the definer (postgres) and BYPASSES ALL RLS.
  // This is the reliable pattern for server-side insert when the calling
  // code uses the anon key + user session.
  const rpcSQL = `
    CREATE OR REPLACE FUNCTION public.insert_notification(
      p_user_id    UUID,
      p_type       TEXT,
      p_title      TEXT,
      p_body       TEXT,
      p_actor_id   UUID,
      p_link       TEXT DEFAULT NULL
    )
    RETURNS UUID
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      new_id UUID;
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, body, actor_id, link)
      VALUES (p_user_id, p_type, p_title, p_body, p_actor_id, p_link)
      RETURNING id INTO new_id;
      RETURN new_id;
    END;
    $$;
    GRANT EXECUTE ON FUNCTION public.insert_notification TO authenticated;
    GRANT EXECUTE ON FUNCTION public.insert_notification TO service_role;
  `
  await c.query(rpcSQL)
  console.log('Created insert_notification RPC function')

  // Also grant execute to anon (for any future use)
  await c.query('GRANT EXECUTE ON FUNCTION public.insert_notification TO anon')

  // Verify function exists
  const r = await c.query("SELECT proname, pronargs, prosrc FROM pg_proc WHERE proname = 'insert_notification'")
  console.log('Function:', r.rows)

  await c.end()
  console.log('Done')
})()
