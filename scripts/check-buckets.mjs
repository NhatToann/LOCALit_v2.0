import pg from 'pg';
const { Client } = pg;
const c = new Client({
  connectionString: `postgresql://postgres:${process.env.SUPABASE_DB_PASSWORD}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const wanted = [
  { name: 'avatars', public: true, sizeMB: 5, kinds: ['image/png','image/jpeg','image/webp'] },
  { name: 'trip-photos', public: true, sizeMB: 5, kinds: ['image/png','image/jpeg','image/webp'] },
  { name: 'chat-attachments', public: false, sizeMB: 10, kinds: ['image/png','image/jpeg','image/webp','application/pdf','text/plain'] },
];

const r = await c.query(`SELECT id, name, public, file_size_limit FROM storage.buckets`);
console.log('Existing buckets:', r.rows.map(b => `${b.name} (${b.public ? 'public' : 'private'}, ${Math.round((b.file_size_limit||0)/1024/1024)}MB)`));

await c.end();
