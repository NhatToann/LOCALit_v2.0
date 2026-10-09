import { readFileSync } from 'fs'
const src = readFileSync('app/chat/page.tsx', 'utf8')

// Test each line of the candidate block individually
const candidates = [
  `      if (myRoleResolved === partnerRole) {`,
  `        // Pluralize: 'buddy' → 'buddies', 'tourist' → 'tourists'`,
  `        const rolePlural = myRoleResolved === 'buddy' ? 'buddies' : myRoleResolved + 's'`,
  `        setError('Could not open conversation: both users are ' + rolePlural + '. Pairing is only allowed across roles.')`,
  `        return`,
  `      }`,
  `      // FK fix round 2 (2026-10-09): an orphan profile (one that has a`,
  `      // row in \`profiles\` with role='tourist'/'buddy' but NO matching`,
  `      // row in \`tourists\`/\`buddies\`) will pass the same-role check above`,
  `      // but fail the insert with 23503 because the id has no row in the`,
  `      // role-table. Probe both role-tables before insert and surface a`,
  `      // clear error instead.`,
  `      const { data: meRow } = await supabase`,
  `        .from(myRoleResolved === 'buddy' ? 'buddies' : 'tourists')`,
  `        .select('id')`,
  `        .eq('id', myId)`,
  `        .maybeSingle()`,
  `      const { data: partnerRow } = await supabase`,
  `        .from(partnerRole === 'buddy' ? 'buddies' : 'tourists')`,
  `        .select('id')`,
  `        .eq('id', partnerId)`,
  `        .maybeSingle()`,
  `      if (!meRow) {`,
  `        setError('Could not open conversation: your account is missing a ' + myRoleResolved + ' profile row. Please complete your profile and try again.')`,
  `        return`,
  `      }`,
  `      if (!partnerRow) {`,
  `        setError('Could not open conversation: the partner is missing a ' + partnerRole + ' profile row. They need to complete their profile before you can chat.')`,
  `        return`,
  `      }`,
]
for (const c of candidates) {
  const found = src.includes(c)
  console.log(found ? 'OK ' : 'MISS', c.slice(0, 60))
}
