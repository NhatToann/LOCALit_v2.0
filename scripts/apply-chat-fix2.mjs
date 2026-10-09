import { readFileSync, writeFileSync } from 'fs'

const path = 'app/chat/page.tsx'
const src = readFileSync(path, 'utf8')

const NL = '\r\n'
// From "FK fix (2026-10-02): the `conversations` table enforces"
// up to and including the `myId : buddy_id, partner in tourist_id` block end.
// The new block uses lex-ordered tourist_id/buddy_id.
const oldBlock = [
  "      // FK fix (2026-10-02): the `conversations` table enforces",
  "      // `tourist_id REFERENCES public.tourists(id)` AND",
  "      // `buddy_id REFERENCES public.buddies(id)`. If the current",
  "      // user is a buddy (role='buddy'), inserting them as",
  "      // `tourist_id` fails the FK because their id has no row in",
  "      // the `tourists` table (one profile ↔ one role-type row).",
  "      //",
  "      // We now branch on `myRole` so the current user always lands",
  "      // in the column whose target table actually has their row.",
  "      // - I'm a tourist → tourist_id = myId, buddy_id = partner",
  "      // - I'm a buddy   → buddy_id   = myId, tourist_id = partner",
  "      //",
  "      // Both `tourists` and `buddies` have a row keyed by profile.id,",
  "      // so the partner must also be on the OPPOSITE side. If we end",
  "      // up here because the partner is on the same side as me (e.g.",
  "      // I'm a buddy and clicked another buddy), the partner still",
  "      // gets resolved to a row in `tourists` for the tourist column",
  "      // and in `buddies` for the buddy column — *every* profile has",
  "      // a matching row in one of the two role tables. So this is",
  "      // safe across the whole user base.",
  "      const partnerId = otherBuddyId",
  "      // Resolve partner's actual role from profiles — the URL param ?buddy=",
  "      // historically meant \"the buddy I'm chatting with\" but the marketplace",
  "      // now lists both tourists + buddies (see safe_buddies + safe_tourists",
  "      // in /browse). The partner may actually be a tourist OR a buddy.",
  "      // The `conversations` table has hard FKs:",
  "      //   tourist_id REFERENCES tourists(id)",
  "      //   buddy_id   REFERENCES buddies(id)",
  "      // So each id MUST land in the column whose target table contains it.",
  "      // Resolve partner's role and pick the column assignment dynamically.",
  "      const { data: partnerProfile } = await supabase",
  "        .from('profiles')",
  "        .select('role')",
  "        .eq('id', partnerId)",
  "        .maybeSingle()",
  "      const partnerRole = partnerProfile?.role",
  "",
  "      // Determine each side's column by querying the actual role-tables.",
  "      // If both ends are the same role (e.g. both buddies), the partner",
  "      // still has a row in their role-table and so does the current user —",
  "      // we surface a clear error instead of letting the DB throw 23503.",
  "      const { data: meProfile } = await supabase",
  "        .from('profiles')",
  "        .select('role')",
  "        .eq('id', myId)",
  "        .maybeSingle()",
  "      const myRoleResolved = (myRole ?? meProfile?.role) as 'tourist' | 'buddy' | null",
  "",
  "      if (!myRoleResolved || !partnerRole) {",
  "        setError('Could not open conversation: unable to resolve roles. Please try again.')",
  "        return",
  "      }",
  "      // 2026-10-09: same-role chats are now allowed. The conversations",
  "      // FKs were relaxed to point to profiles (not the role-tables),",
  "      // so the role-table probe is no longer required. Focus Mode is",
  "      // the only feature that still requires cross-role pairing, and",
  "      // that gate lives in /api/focus/request.",
  "      // I'm the tourist → myId in tourist_id, partner in buddy_id",
  "      // I'm the buddy   → myId in buddy_id,   partner in tourist_id",
  "      const insertPayload =",
  "        myRoleResolved === 'buddy'",
  "          ? { tourist_id: partnerId, buddy_id: myId }",
  "          : { tourist_id: myId, buddy_id: partnerId }",
].join(NL)

const newBlock = [
  "      // 2026-10-09: same-role chats are now allowed. The conversations",
  "      // FKs were relaxed to point to profiles (not the role-tables), so",
  "      // we no longer have to branch on role when picking the column.",
  "      // Use a canonical lex order so the UNIQUE (tourist_id, buddy_id)",
  "      // constraint can't collide on the same pair in different",
  "      // orientations.",
  "      const a = myId < otherBuddyId ? myId : otherBuddyId",
  "      const b = myId < otherBuddyId ? otherBuddyId : myId",
  "      const insertPayload = { tourist_id: a, buddy_id: b }",
].join(NL)

if (!src.includes(oldBlock)) {
  console.error('FAIL: old block not found in', path)
  // find closest anchor
  const a = src.indexOf("      const partnerId = otherBuddyId")
  console.log('partnerId anchor:', a)
  if (a > 0) console.log(src.slice(a - 100, a + 100))
  process.exit(1)
}

const out = src.replace(oldBlock, newBlock)
writeFileSync(path, out, 'utf8')
console.log('OK: replaced role-resolution block.')
console.log('old block length:', oldBlock.length)
console.log('new block length:', newBlock.length)
console.log('file delta:', out.length - src.length, 'bytes')
