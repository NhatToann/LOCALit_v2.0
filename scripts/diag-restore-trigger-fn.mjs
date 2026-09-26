import { Client } from 'pg'
const HOST = 'db.pqvnjgyqbxlylawwogjv.supabase.co'
const PORT = 5432
const DB_USER = 'postgres'
const DB_NAME = 'postgres'
const DB_PW = process.env.DB_PW || 'that1arlecchino'
;(async () => {
  const pg = new Client({ host: HOST, port: PORT, user: DB_USER, password: DB_PW, database: DB_NAME, ssl: { rejectUnauthorized: false } })
  await pg.connect()

  // Restore the original function from schema.sql EXACTLY (no DECLARE block).
  await pg.query(`
    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO public.profiles (id, email, full_name, role)
      VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tourist')
      );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `)
  console.log('handle_new_user replaced with original schema.sql body.')

  // Verify
  const r = await pg.query(`SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'handle_new_user'`)
  console.log(r.rows[0].def)

  await pg.end()
})()
