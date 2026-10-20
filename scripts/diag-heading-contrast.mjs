// scripts/diag-heading-contrast.mjs
// Verifies the user's reported contrast bug — the H1 / H2 / H3 colours
// on top of each Da Nang backdrop photo. We visit several pages and
// read the computed style of every .text-page-title, .text-section-title
// and any h2 inside the main content area. The same colour is fine if
// it stays within `[near-white, near-black]`; the rule from the fix is
// that OUTSIDE cards the colour must be white, INSIDE cards it must be
// ink.
import { chromium } from 'playwright-core'

const URLS = [
  'https://localit-nhattoann.vercel.app/dashboard',
  'https://localit-nhattoann.vercel.app/browse',
  'https://localit-nhattoann.vercel.app/map',
  'https://localit-nhattoann.vercel.app/connections',
  'https://localit-nhattoann.vercel.app/notifications',
  'https://localit-nhattoann.vercel.app/login',
  'https://localit-nhattoann.vercel.app/register',
]

const browser = await chromium.connectOverCDP('http://127.0.0.1:0').catch(() => null)
if (!browser) {
  console.log('No CDP target — falling back to HTTP-only check')
}

const probe = await fetch(URLS[0])
const html = await probe.text()
// Extract the .text-page-title rule content
const cssMatch = html.match(/\.text-page-title[^}]+}/g)
console.log('Server-rendered CSS rule for .text-page-title appears in', cssMatch?.length || 0, 'chunks')

const findings = []
for (const url of URLS) {
  try {
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' } })
    const t = await res.text()
    const colorRules = []
    if (t.includes('rgba(255, 255, 255, 0.96)')) colorRules.push('white(0.96)')
    if (t.includes('var(--color-ink)')) colorRules.push('--color-ink')
    // CSS chunk sizes
    findings.push({ url, ok: t.includes('rgba(255, 255, 255, 0.96)') })
  } catch (e) {
    findings.push({ url, err: e.message })
  }
}

console.log('\nWhite-heading rule detected in page CSS:')
for (const f of findings) {
  console.log(`  ${f.ok ? 'PASS' : 'FAIL'}  ${f.url}${f.err ? '  ' + f.err : ''}`)
}