import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT tgname, pg_get_triggerdef(oid) AS d
    FROM pg_trigger
    WHERE tgrelid = 'public.messages'::regclass AND NOT tgisinternal
  `)
  console.log('=== triggers on messages ===')
  if (!r.rows.length) console.log('  (none)')
  r.rows.forEach(x => console.log('  ' + x.tgname + ' :: ' + x.d))

  const f = await c.query(`
    SELECT p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname ILIKE '%conversation%' OR p.proname ILIKE '%last_message%' OR p.proname ILIKE '%touch%')
  `)
  console.log('\n=== related functions ===')
  f.rows.forEach(x => console.log('  ' + x.proname))

  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })