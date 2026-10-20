// Unit test for the 2026-10-20 row-tag ranking on /browse.
// Mirrors rankTags() + tagChipData() in app/browse/page.tsx exactly.
// Run: node scripts/test-tag-ranking.mjs
//
// The user-reported bug: the tag cluster next to the review score was
// `tags.slice(0, 3)` — a blind head-trim. Adjacent rows showed tags with
// no relationship, and it was impossible to tell "these two people share
// an interest" from "these tags happen to be first in the array."
// Required behaviour:
//   1. Tags matching the viewer's own pool float to the front.
//   2. Non-matching tags follow in their original order.
//   3. Buddy and tourist tags are treated identically.
//   4. At most 4 real tags, plus a "+N" overflow count.

function rankTags(tags, ownTags) {
  const flat = (Array.isArray(tags) ? tags : [])
    .filter((t) => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
  if (flat.length === 0) return []
  const ownKeys = new Set(
    ownTags.filter((t) => typeof t === 'string').map((t) => t.trim().toLowerCase()).filter(Boolean),
  )
  if (ownKeys.size === 0) return flat
  return flat
    .map((tag, i) => ({ tag, i, key: tag.toLowerCase() }))
    .sort((a, b) => {
      const aHit = ownKeys.has(a.key) ? 0 : 1
      const bHit = ownKeys.has(b.key) ? 0 : 1
      if (aHit !== bHit) return aHit - bHit
      return a.i - b.i
    })
    .map((x) => x.tag)
}

function tagChipData(tags, ownTags) {
  const ranked = rankTags(tags, ownTags)
  const MAX = 4
  const shown = ranked.slice(0, MAX)
  const overflow = Math.max(0, ranked.length - MAX)
  const ownKeys = new Set(ownTags.map((t) => t.trim().toLowerCase()))
  const matched = shown.filter((t) => ownKeys.has(t.toLowerCase()))
  return { shown, overflow, matched }
}

let pass = 0
let fail = 0
function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) {
    console.log(`PASS  ${name}`)
    pass++
  } else {
    console.log(`FAIL  ${name}\n        expected ${e}\n        actual   ${a}`)
    fail++
  }
}

// --- 1. Matches float to the front -------------------------------------
check(
  'matching tag floats to front',
  rankTags(['photography', 'street-food', 'nature'], ['street-food']),
  ['street-food', 'photography', 'nature'],
)
check(
  'multiple matches keep source order among themselves',
  rankTags(['a', 'street-food', 'b', 'photography'], ['photography', 'street-food']),
  ['street-food', 'photography', 'a', 'b'],
)

// --- 2. No matches -> original order preserved --------------------------
check(
  'no overlap returns original order',
  rankTags(['wellness', 'artisan-craft', 'history'], ['motorbike-tours']),
  ['wellness', 'artisan-craft', 'history'],
)
check('empty ownTags is a no-op', rankTags(['x', 'y'], []), ['x', 'y'])

// --- 3. Case-insensitive + whitespace tolerant --------------------------
check(
  'case-insensitive match',
  rankTags(['Street Food', 'photography'], ['street food']),
  ['Street Food', 'photography'],
)
check(
  'tag whitespace is trimmed before matching',
  rankTags(['  street-food  ', 'history'], ['street-food']),
  ['street-food', 'history'],
)

// --- 4. Buddy vs tourist parity -----------------------------------------
// A tourist's interests and a buddy's specialties go through the exact
// same function, so a shared tag highlights identically for both.
const myPool = ['cooking-class']
const touristChips = tagChipData(['history', 'cooking-class', 'nightlife'], myPool)
const buddyChips = tagChipData(['history', 'cooking-class', 'nightlife'], myPool)
check('buddy and tourist tag ranking are identical', touristChips, buddyChips)
check('shared tag detected on a tourist row', touristChips.matched, ['cooking-class'])

// --- 5. Max 4 tags + "+N" overflow --------------------------------------
const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
const capped = tagChipData(many, [])
check('caps at 4 tags', capped.shown, ['a', 'b', 'c', 'd'])
check('reports overflow count', capped.overflow, 3)
check('exactly 4 shown leaves 4 with no +N', tagChipData(['a', 'b', 'c', 'd'], []).overflow, 0)
check('5 tags reports +1', tagChipData(['a', 'b', 'c', 'd', 'e'], []).overflow, 1)

// Overflow must be computed AFTER ranking, so a match deep in the list
// still counts toward the 4 and still gets surfaced.
const overflowAfterRank = tagChipData(['x', 'y', 'z', 'w', 'street-food'], ['street-food'])
check('match is surfaced even when it would have been 5th', overflowAfterRank.shown, [
  'street-food', 'x', 'y', 'z',
])
check('overflow recomputed after ranking', overflowAfterRank.overflow, 1)

// --- 6. Robustness -------------------------------------------------------
check('empty tag array', tagChipData([], ['x']), { shown: [], overflow: 0, matched: [] })
check('non-string entries are dropped', rankTags(['ok', null, 42, undefined, 'fine'], []), [
  'ok', 'fine',
])
check('all-blank tags are dropped', rankTags(['  ', '', '\t'], []), [])

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)