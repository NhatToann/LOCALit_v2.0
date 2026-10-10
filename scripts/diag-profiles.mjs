import { Client } from 'pg'
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const r = await c.query(`SELECT id, email, full_name, role FROM public.profiles WHERE email IN ('e2e-real@autotest.dev','sarah.m@example.com','mike.j@example.com','john.doe@example.com','lan.pham@localit.dev','minh.nguyen@localit.dev','linh.tran@localit.dev','huy.nguyen@localit.dev','mai.le@localit.dev','tuan.vu@localit.dev','darklunatv@gmail.com') ORDER BY full_name`)
console.log(JSON.stringify(r.rows, null, 2))
await c.end()
