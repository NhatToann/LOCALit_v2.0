import fs from 'node:fs'
const html = fs.readFileSync('scripts/screenshots/lan-no-bubble.html', 'utf8')
const i1 = html.indexOf('Xin ch')
const i2 = html.indexOf('aria-label="Message draft"')
const i3 = html.indexOf('No messages yet')
console.log({ xinChaoAt: i1, inputAt: i2, noMessagesAt: i3, htmlLen: html.length })
if (i2 > 0) {
  console.log('--- around input ---')
  console.log(html.slice(Math.max(0, i2 - 200), i2 + 2000))
}
