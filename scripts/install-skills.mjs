import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = process.cwd()

const PAIRS = [
  {
    skill: 'web-ai-slop',
    canonical: '.agents/skills/web-ai-slop/SKILL.md',
    mirrors: [
      '.claude/skills/web-ai-slop/SKILL.md',
      '.claude/skills/web-ai-slop.md',
      'agent/skills/web-ai-slop/SKILL.md',
    ],
  },
  {
    skill: 'aeo-geo-writing',
    canonical: '.agents/skills/aeo-geo-writing/SKILL.md',
    mirrors: [
      '.claude/skills/aeo-geo-writing/SKILL.md',
      '.claude/skills/aeo-geo-writing.md',
      'agent/skills/aeo-geo-writing/SKILL.md',
    ],
  },
]

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch (_err) {
    return false
  }
}

async function installOne(skill, canonical, mirrors) {
  const src = path.join(ROOT, canonical)
  if (!(await pathExists(src))) {
    console.error('[install-skills] Missing canonical: ' + canonical)
    console.error('  Fetch from https://github.com/sahilkargutkar/web-ai-slop and place it there.')
    return false
  }
  const buf = await fs.readFile(src, 'utf8')
  for (const rel of mirrors) {
    const dst = path.join(ROOT, rel)
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.writeFile(dst, buf, 'utf8')
    console.log('[install-skills] ' + skill + ' -> ' + rel)
  }
  return true
}

let ok = true
for (const p of PAIRS) {
  const result = await installOne(p.skill, p.canonical, p.mirrors)
  if (!result) ok = false
}
process.exit(ok ? 0 : 1)
