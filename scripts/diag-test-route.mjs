// Test signup-admin WITH cookie session by signing in via UI route first.
// 1) Read Vercel logs from CLI for any error message.
import { execSync } from 'node:child_process'
;(async () => {
  // Pull last 100 lines of logs
  try {
    const out = execSync('vercel logs localit-i4r7k0ccm-nhattoann.vercel.app --token=$(vercel token ls 2>/dev/null | head -3) 2>&1', { encoding: 'utf8', shell: 'powershell.exe' })
    console.log(out.substring(0, 3000))
  } catch (e) {
    console.log('logs failed:', e.message.substring(0, 500))
  }
})()
