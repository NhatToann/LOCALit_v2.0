// Run each INSERT/UPDATE statement from seed.sql one-by-one
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const client = new Client({
  connectionString: `postgresql://postgres:${process.env.DB_PW}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

const seedPath = path.join(__dirname, '..', 'supabase', 'seed.sql')
let sql = fs.readFileSync(seedPath, 'utf-8')

// Strip SQL comments and dollar-quoted bodies, then split
// This naive split won't handle dollar quoting perfectly — convert DO $$ blocks to a placeholder
const doBlocks = []
let placeholder = sql.replace(/DO\s*\$\$[\s\S]*?\$\s*\$\$/g, (m) => {
  const idx = doBlocks.length
  doBlocks.push(m)
  return `/* DO_BLOCK_${idx} */`
})

// Remove /* */ comments too
placeholder = placeholder.replace(/\/\*[\s\S]*?\*\//g, '')

// Split by semicolons but preserve quoted strings... just simple split
const stmts = placeholder.split(/;\s*$/m).filter(s => s.trim().length > 0)

let okCount = 0
let errCount = 0

try {
  await client.connect()
  console.log('✅ Connected')

  for (let i = 0; i < stmts.length; i++) {
    let stmt = stmts[i].trim()
    if (!stmt) continue
    // Restore DO blocks
    for (let j = 0; j < doBlocks.length; j++) {
      stmt = stmt.replace(`/* DO_BLOCK_${j} */`, doBlocks[j])
    }
    try {
      await client.query(stmt)
      okCount++
      console.log(`✅ [${i}] ${stmt.slice(0, 80).replace(/\s+/g, ' ')}...`)
    } catch (e) {
      errCount++
      console.log(`❌ [${i}] ${e.message}`)
      console.log(`   Statement: ${stmt.slice(0, 200)}`)
    }
  }
  console.log(`\n📊 ${okCount} OK, ${errCount} failed`)
} catch (e) {
  console.error('❌ Connection error:', e.message)
} finally {
  await client.end()
}
