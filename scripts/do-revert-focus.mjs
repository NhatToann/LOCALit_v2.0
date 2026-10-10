import { execSync } from 'node:child_process'

const commits = [
  '14a323b',
  'aae25d4',
  '0a3de11',
  '0234b26',
  'ca36e1f',
  '6389ca0',
  '0d69314',
  'b749db0',
  '15e313b',
  'e99383e',
  'f5d487c',
  'bd747c9',
  '09c6464',
]

for (const sha of commits) {
  try {
    console.log(`\n=== Reverting ${sha} ===`)
    execSync(`git revert --no-edit --no-commit ${sha}`, { stdio: 'inherit' })
  } catch (e) {
    console.error(`FAILED on ${sha}`)
    console.error(e.message)
    process.exit(1)
  }
}

console.log('\n=== All reverts staged. Committing... ===')
try {
  execSync(`git commit -m "revert: drop Focus Mode v1 (13 commits)\n\nBackup: backup/focus-mode-v1-pre-revert\n\nReverted commits:\n14a323b, aae25d4, 0a3de11, 0234b26, ca36e1f, 6389ca0,\n0d69314, b749db0, 15e313b, e99383e, f5d487c, bd747c9, 09c6464"`, { stdio: 'inherit' })
} catch (e) {
  console.error('Commit failed')
  console.error(e.message)
  process.exit(1)
}

console.log('\n=== Done ===')
execSync('git log --oneline -3', { stdio: 'inherit' })
