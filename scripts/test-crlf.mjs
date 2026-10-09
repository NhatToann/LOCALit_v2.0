import { readFileSync } from 'fs'
const src = readFileSync('app/chat/page.tsx', 'utf8')

// Check for CRLF
const hasCRLF = src.includes('\r\n')
console.log('CRLF in src:', hasCRLF)

// Try with explicit CRLF
const oldBlock = [
  "      if (myRoleResolved === partnerRole) {",
  "        // Pluralize: 'buddy' → 'buddies', 'tourist' → 'tourists'",
  "        const rolePlural = myRoleResolved === 'buddy' ? 'buddies' : myRoleResolved + 's'",
  "        setError('Could not open conversation: both users are ' + rolePlural + '. Pairing is only allowed across roles.')",
  "        return",
  "      }",
].join('\r\n')

console.log('block found:', src.includes(oldBlock))
