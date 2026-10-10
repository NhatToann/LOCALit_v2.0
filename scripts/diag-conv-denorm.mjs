import pg from 'pg'
const {Client} = pg
const c = new Client({
  connectionString:'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl:{rejectUnauthorized:false}
})
c.connect().then(async () => {
  const r = await c.query(`
    SELECT c.id,
           c.tourist_id, c.buddy_id,
           c.last_message_at,
           c.last_message_preview,
           c.updated_at,
           (SELECT COUNT(*) FROM public.messages m WHERE m.conversation_id = c.id) AS msg_count,
           (SELECT MAX(m.created_at) FROM public.messages m WHERE m.conversation_id = c.id) AS true_last_msg
    FROM public.conversations c
    ORDER BY c.created_at
  `)
  console.log('conv_id      | real_msgs | last_message_at (denorm)      | true last msg')
  console.log('-------------|-----------|-------------------------------|-------------')
  for (const row of r.rows) {
    const denorm = row.last_message_at ? new Date(row.last_message_at).toISOString() : 'NULL  <<<<'
    const truth  = row.true_last_msg ? new Date(row.true_last_msg).toISOString() : 'NULL'
    const flag = String(row.msg_count) !== '0' && !row.last_message_at ? '  <<< STALE!' : ''
    console.log(`${row.id.slice(0,10)} | ${String(row.msg_count).padStart(9)} | ${denorm.padEnd(29)} | ${truth}${flag}`)
  }
  await c.end()
}).catch(e => { console.error(e.message); process.exit(1) })