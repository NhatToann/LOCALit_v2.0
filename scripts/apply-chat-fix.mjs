import { readFileSync, writeFileSync } from 'fs'

const path = 'app/chat/page.tsx'
const src = readFileSync(path, 'utf8')

const NL = '\r\n'
const oldBlock = [
  "      if (myRoleResolved === partnerRole) {",
  "        // Pluralize: 'buddy' → 'buddies', 'tourist' → 'tourists'",
  "        const rolePlural = myRoleResolved === 'buddy' ? 'buddies' : myRoleResolved + 's'",
  "        setError('Could not open conversation: both users are ' + rolePlural + '. Pairing is only allowed across roles.')",
  "        return",
  "      }",
  "      // FK fix round 2 (2026-10-09): an orphan profile (one that has a",
  "      // row in `profiles` with role='tourist'/'buddy' but NO matching",
  "      // row in `tourists`/`buddies`) will pass the same-role check above",
  "      // but fail the insert with 23503 because the id has no row in the",
  "      // role-table. Probe both role-tables before insert and surface a",
  "      // clear error instead.",
  "      const { data: meRow } = await supabase",
  "        .from(myRoleResolved === 'buddy' ? 'buddies' : 'tourists')",
  "        .select('id')",
  "        .eq('id', myId)",
  "        .maybeSingle()",
  "      const { data: partnerRow } = await supabase",
  "        .from(partnerRole === 'buddy' ? 'buddies' : 'tourists')",
  "        .select('id')",
  "        .eq('id', partnerId)",
  "        .maybeSingle()",
  "      if (!meRow) {",
  "        setError('Could not open conversation: your account is missing a ' + myRoleResolved + ' profile row. Please complete your profile and try again.')",
  "        return",
  "      }",
  "      if (!partnerRow) {",
  "        setError('Could not open conversation: the partner is missing a ' + partnerRole + ' profile row. They need to complete their profile before you can chat.')",
  "        return",
  "      }",
].join(NL)

const newBlock = [
  "      // 2026-10-09: same-role chats are now allowed. The conversations",
  "      // FKs were relaxed to point to profiles (not the role-tables),",
  "      // so the role-table probe is no longer required. Focus Mode is",
  "      // the only feature that still requires cross-role pairing, and",
  "      // that gate lives in /api/focus/request.",
].join(NL)

if (!src.includes(oldBlock)) {
  console.error('FAIL: old block not found in', path)
  process.exit(1)
}

const out = src.replace(oldBlock, newBlock)
writeFileSync(path, out, 'utf8')
console.log('OK: replaced same-role guard block.')
console.log('old block length:', oldBlock.length)
console.log('new block length:', newBlock.length)
console.log('file delta:', out.length - src.length, 'bytes')

