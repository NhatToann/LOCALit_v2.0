// Get the build ID and load the actual CSS file
const r = await fetch('https://localit-6zov170sf-nhattoann.vercel.app/dashboard', {
  headers: { 'cache-control': 'no-cache' },
})
const t = await r.text()
// The build ID is exposed in __NEXT_DATA__ or in _next/static/<BUILD_ID>
// Strip the CSS paths and probe with the absolute base + chunks directly.
const m = [...t.matchAll(/href="(\/_next\/[^"]+\.css[^"]*)"/g)]
const cssPath = m[0][1]
console.log('CSS path:', cssPath)
// fetch with explicit Accept: text/css (some Vercel routers only treat the
// request as CSS if Accept matches).
const cr = await fetch('https://localit-6zov170sf-nhattoann.vercel.app' + cssPath, {
  headers: { 'accept': 'text/css,*/*;q=0.1', 'cache-control': 'no-cache' },
})
const ct = await cr.text()
console.log('status:', cr.status)
console.log('Content-Type:', cr.headers.get('content-type'))
console.log('First 200 chars:', JSON.stringify(ct.slice(0, 200)))

const idx = ct.indexOf('text-page-title')
console.log('\ntext-page-title idx:', idx)
if (idx > 0) console.log('Preview:\n', ct.slice(idx, idx + 350))
console.log('rgba white:', /rgba\(255,\s*255,\s*255,\s*0\.96\)/.test(ct))
console.log('bg-paper h1 override:', /\.bg-paper h1/.test(ct))
console.log('text-page-title base:', /\.text-page-title\s*\{/.test(ct))