import { readFileSync } from 'fs'
const src = readFileSync('app/chat/page.tsx', 'utf8')
const anchor = `      if (myRoleResolved === partnerRole) {`
const idx = src.indexOf(anchor)
console.log('Block from anchor:')
console.log(JSON.stringify(src.slice(idx, idx + 1800)))
