import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  // 1) Check RLS policies on messages for SELECT
  const rls = await c.query(`
    SELECT policyname, cmd, roles::text, qual
    FROM pg_policies
    WHERE tablename = 'messages' AND schemaname = 'public'
  `)
  console.log('messages RLS policies:')
  rls.rows.forEach(r => {
    console.log(`  ${r.policyname} | cmd=${r.cmd} | roles=${r.roles} | qual=${r.qual}`)
  })

  // 2) Check RLS on conversations
  const rlsC = await c.query(`
    SELECT policyname, cmd, roles::text, qual
    FROM pg_policies
    WHERE tablename = 'conversations' AND schemaname = 'public'
  `)
  console.log('\nconversations RLS policies:')
  rlsC.rows.forEach(r => {
    console.log(`  ${r.policyname} | cmd=${r.cmd} | roles=${r.roles} | qual=${r.qual}`)
  })

  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })