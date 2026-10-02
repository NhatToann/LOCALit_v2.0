/**
 * Seed public.popular_stops from lib/popular-stops.ts.
 *
 * Idempotent: ON CONFLICT (slug) DO UPDATE. Safe to re-run.
 *
 * Usage:
 *   $env:SUPABASE_DB_PASSWORD="..."; node scripts/seed-popular-stops.mjs
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const password = process.env.SUPABASE_DB_PASSWORD || process.env.DB_PW
if (!password) {
  console.error('Missing SUPABASE_DB_PASSWORD env var.')
  process.exit(1)
}

const source = readFileSync('lib/popular-stops.ts', 'utf8')

// Find POPULAR_DA_NANG_STOPS, then walk to the FIRST `[` after `=`.
const anchor = 'POPULAR_DA_NANG_STOPS'
const startIdx = source.indexOf(anchor)
if (startIdx < 0) {
  console.error('POPULAR_DA_NANG_STOPS not found in lib/popular-stops.ts')
  process.exit(2)
}
const equalIdx = source.indexOf('=', startIdx)
const bracketStart = source.indexOf('[', equalIdx)
if (bracketStart < 0) {
  console.error('Array opening bracket not found')
  process.exit(2)
}

let depth = 0
let bracketEnd = -1
for (let i = bracketStart; i < source.length; i++) {
  const ch = source[i]
  if (ch === '[') depth += 1
  else if (ch === ']') {
    depth -= 1
    if (depth === 0) {
      bracketEnd = i
      break
    }
  }
}
if (bracketEnd < 0) {
  console.error('Array closing bracket not found')
  process.exit(2)
}
const arrayLiteral = source.slice(bracketStart, bracketEnd + 1)

// Quote unquoted object keys: `id:` -> `"id":`, but only when at the
// start of a token (after `{`, `,`, or newline + whitespace). Leave
// string literals untouched. The transform is a single pass that
// respects string boundaries.
let out = ''
let inString = false
let stringQuote = ''
let i = 0
while (i < arrayLiteral.length) {
  const ch = arrayLiteral[i]
  if (inString) {
    out += ch
    if (ch === '\\' && i + 1 < arrayLiteral.length) {
      out += arrayLiteral[i + 1]
      i += 2
      continue
    }
    if (ch === stringQuote) inString = false
    i += 1
    continue
  }
  if (ch === "'" || ch === '"' || ch === '`') {
    inString = true
    stringQuote = ch
    out += ch
    i += 1
    continue
  }
  // Match identifier followed by `:` at object-key position. Look back
  // for a non-whitespace char that is `{` or `,`.
  if (/[A-Za-z_$]/.test(ch)) {
    let j = i
    while (j < arrayLiteral.length && /[A-Za-z0-9_$]/.test(arrayLiteral[j])) j += 1
    // Skip whitespace
    let k = j
    while (k < arrayLiteral.length && /\s/.test(arrayLiteral[k])) k += 1
    if (arrayLiteral[k] === ':') {
      // Confirm object-key position: previous non-whitespace char is
      // `{` or `,`.
      let back = out.length - 1
      while (back >= 0 && /\s/.test(out[back])) back -= 1
      if (back >= 0 && (out[back] === '{' || out[back] === ',')) {
        out += `"${arrayLiteral.slice(i, j)}":`
        i = k + 1
        continue
      }
    }
    out += arrayLiteral.slice(i, j)
    i = j
    continue
  }
  out += ch
  i += 1
}
const jsLiteral = out

let entries
try {
  // eslint-disable-next-line no-new-func
  entries = new Function(`return (${jsLiteral});`)()
} catch (err) {
  console.error('Failed to parse array literal:', err.message)
  console.error('First 1200 chars of parsed literal:')
  console.error(jsLiteral.slice(0, 1200))
  process.exit(3)
}
if (!Array.isArray(entries) || entries.length === 0) {
  console.error('Parsed empty array; aborting.')
  console.error('First 1200 chars of parsed literal:')
  console.error(jsLiteral.slice(0, 1200))
  process.exit(3)
}

const client = new Client({
  connectionString: `postgresql://postgres:${password}@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
})

await client.connect()
try {
  for (const e of entries) {
    if (!e.id || !e.name || typeof e.lat !== 'number' || typeof e.lng !== 'number' || !e.category) {
      console.warn('Skipping malformed entry:', e)
      continue
    }
    await client.query(
      `INSERT INTO public.popular_stops (slug, name, address, lat, lng, category)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name,
             address = EXCLUDED.address,
             lat = EXCLUDED.lat,
             lng = EXCLUDED.lng,
             category = EXCLUDED.category`,
      [e.id, e.name, e.address ?? null, e.lat, e.lng, e.category],
    )
  }
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM public.popular_stops')
  console.log(`OK — ${rows[0].n} rows in public.popular_stops`)
} catch (err) {
  console.error('FAILED:', err.message)
  process.exit(4)
} finally {
  await client.end()
}
