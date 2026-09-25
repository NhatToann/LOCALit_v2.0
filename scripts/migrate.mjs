// Apply schema.sql + seed.sql to Supabase (idempotent)
// Usage: $env:DB_PW="..."; node scripts/migrate.mjs
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

if (!process.env.DB_PW) {
  console.error('❌ DB_PW env var not set.')
  process.exit(1)
}

const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

async function execSafe(sql, name) {
  try {
    await client.query(sql)
    console.log(`✅ ${name}`)
  } catch (e) {
    if (e.code === '42710' || e.code === '42P07' || e.code === '42P06' || e.message.includes('already exists')) {
      console.log(`⏭️  ${name} (already exists, skipped)`)
    } else {
      console.error(`❌ ${name}:`, e.message)
      throw e
    }
  }
}

async function runSqlFile(filename, label) {
  const filePath = path.join(__dirname, '..', 'supabase', filename)
  const sql = fs.readFileSync(filePath, 'utf-8')
  console.log(`\n📄 Running ${filename}...`)
  // Use DO $$ BEGIN ... END $$ to wrap, but for simplicity split on semicolons cautiously
  // Better: use the pg query which can handle multi-statement
  await execSafe(sql, `${label} applied`)
}

async function main() {
  try {
    await client.connect()
    console.log('✅ Connected to Supabase Postgres')

    await runSqlFile('schema.sql', 'Schema migration')
    await runSqlFile('seed.sql', 'Seed data')

    // Verify
    const tables = ['profiles', 'tourists', 'buddies', 'connections', 'trips', 'conversations', 'messages', 'location_updates', 'reviews']
    console.log('\n📊 Data summary:')
    for (const t of tables) {
      try {
        const { rows } = await client.query(`SELECT COUNT(*) FROM public.${t}`)
        console.log(`   ${t.padEnd(20)} ${rows[0].count}`)
      } catch (e) {
        console.log(`   ${t.padEnd(20)} (error)`)
      }
    }
  } catch (e) {
    console.error('❌ Error:', e.message)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

main()
