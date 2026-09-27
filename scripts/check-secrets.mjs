import { readFileSync } from 'node:fs'
const content = readFileSync('.env.secrets', 'utf8')
for (const line of content.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*"([^\n"]+)"\s*$/)
  if (m) {
    console.log(m[1] + '=' + m[2].slice(0, 20) + '...len=' + m[2].length)
  }
}
