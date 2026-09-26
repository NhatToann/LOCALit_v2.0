// Check which deployment the canonical domain resolves to and compare with the
// newest production deploy. We query the Vercel REST API directly.

const TOKEN = process.env.VERCEL_TOKEN || ''

async function api(path) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

async function main() {
  // 1. Which deployment does localit-vn.vercel.app resolve to?
  const canonical = await api('/v13/deployments/localit-vn.vercel.app')
  console.log('Canonical domain → deployment:')
  console.log(`  uid:      ${canonical.uid}`)
  console.log(`  url:      ${canonical.url}`)
  console.log(`  name:     ${canonical.name}`)
  console.log(`  created:  ${canonical.createdAt}`)
  console.log(`  alias:    ${canonical.aliasAssigned ? canonical.aliasAssigned : '(none)'}`)
  console.log(`  meta:     ${JSON.stringify(canonical.meta || {})}`)

  // 2. Find the most recent production deploy for the project
  const project = canonical.projectId
  const list = await api(`/v6/deployments?projectId=${project}&target=production&limit=5`)
  console.log('\nLast 5 prod deploys:')
  for (const d of list.deployments) {
    console.log(`  ${d.createdAt}  ${d.url}  ${d.meta?.githubCommitSha?.slice(0,7) || 'no-sha'}`)
  }

  const newest = list.deployments[0]
  console.log(`\nNewest: ${newest.url}`)
  console.log(`Canonical: ${canonical.url}`)
  if (newest.uid === canonical.uid) {
    console.log('✓ ALREADY UP TO DATE — canonical domain points to newest deploy.')
  } else {
    console.log('✗ OUT OF DATE — canonical is behind by some number of deploys.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
