import { readFileSync } from 'fs'
const src = readFileSync('app/chat/page.tsx', 'utf8')
const target = `      // FK fix round 2 (2026-10-09): an orphan profile (one that has a`
const idx = src.indexOf(target)
console.log('target index:', idx)
if (idx > 0) {
  console.log('actual 200 chars from target:')
  console.log(JSON.stringify(src.slice(idx, idx + 200)))
  console.log()
  console.log('expected 200 chars from target:')
  console.log(JSON.stringify(target))
}
