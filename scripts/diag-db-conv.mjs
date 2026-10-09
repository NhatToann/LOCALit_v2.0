// diag-db-conv.mjs
import pg from 'pg'
const {Client}=pg
const c=new Client({
  connectionString:`postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl:{rejectUnauthorized:false}
})
await c.connect()
const r=await c.query(`SELECT c.id, c.tourist_id, c.buddy_id, c.created_at
  FROM public.conversations c
  ORDER BY c.created_at DESC`)
console.log('conversations:',JSON.stringify(r.rows,null,2))
const t=await c.query(`SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  WHERE p.full_name ILIKE '%lan%' OR p.email ILIKE '%lan%'`)
console.log('lan:',JSON.stringify(t.rows,null,2))
await c.end()
