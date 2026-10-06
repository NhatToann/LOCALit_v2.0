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
  {
    skill: 'ui-ux-pro-max',
    canonical: '.claude/skills/ui-ux-pro-max/SKILL.md',
    mirrors: [
      '.agents/skills/ui-ux-pro-max/SKILL.md',
      '.claude/skills/ui-ux-pro-max.md',
      'agent/skills/ui-ux-pro-max/SKILL.md',
    ],
  },
  {
    skill: 'code-reviewer',
    canonical: '.claude/skills/code-reviewer/SKILL.md',
    mirrors: [
      '.agents/skills/code-reviewer/SKILL.md',
      '.claude/skills/code-reviewer.md',
      'agent/skills/code-reviewer/SKILL.md',
    ],
  },
  {
    skill: 'webapp-testing',
    canonical: '.claude/skills/webapp-testing/SKILL.md',
    mirrors: [
      '.agents/skills/webapp-testing/SKILL.md',
      '.claude/skills/webapp-testing.md',
      'agent/skills/webapp-testing/SKILL.md',
    ],
  },
  {
    skill: 'brainstorming',
    canonical: '.claude/skills/brainstorming/SKILL.md',
    mirrors: [
      '.agents/skills/brainstorming/SKILL.md',
      '.claude/skills/brainstorming.md',
      'agent/skills/brainstorming/SKILL.md',
    ],
  },
  {
    skill: 'accessibility-auditor',
    canonical: '.claude/skills/accessibility-auditor/SKILL.md',
    mirrors: [
      '.agents/skills/accessibility-auditor/SKILL.md',
      '.claude/skills/accessibility-auditor.md',
      'agent/skills/accessibility-auditor/SKILL.md',
    ],
  },
  {
    skill: 'systematic-debugging',
    canonical: '.claude/skills/systematic-debugging/SKILL.md',
    mirrors: [
      '.agents/skills/systematic-debugging/SKILL.md',
      '.claude/skills/systematic-debugging.md',
      'agent/skills/systematic-debugging/SKILL.md',
    ],
  },
  {
    skill: 'clean-code',
    canonical: '.claude/skills/clean-code/SKILL.md',
    mirrors: [
      '.agents/skills/clean-code/SKILL.md',
      '.claude/skills/clean-code.md',
      'agent/skills/clean-code/SKILL.md',
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

async function installSkillSubdir(skill, canonicalDir, mirrors) {
  // Mirror entire subdirectories (references/, examples/, scripts/, etc.)
  // from the canonical skill directory into each mirror root.
  const srcDir = path.join(ROOT, canonicalDir)
  if (!(await pathExists(srcDir))) {
    console.error('[install-skills] Missing canonical dir: ' + canonicalDir)
    return false
  }
  // mirrors is an array of SKILL.md file locations; we extract the mirror
  // root (parent of skill folder) and copy srcDir into <mirrorRoot>/<skill>
  for (const mirrorRel of mirrors) {
    const mirrorParts = mirrorRel.split(/[\\/]/)
    // mirrorRel: .agents/skills/code-reviewer/SKILL.md
    //   -> [".agents", "skills", "code-reviewer", "SKILL.md"]
    // mirrorRoot is everything except the last two segments.
    if (mirrorParts.length < 3) {
      console.error('[install-skills] Bad mirror path: ' + mirrorRel)
      return false
    }
    const mirrorRoot = mirrorParts.slice(0, -2).join(path.sep)
    await copyDirRecursive(srcDir, path.join(ROOT, mirrorRoot, skill))
    console.log('[install-skills] ' + skill + ' subdir -> ' + mirrorRoot + path.sep + skill)
  }
  return true
}

async function copyDirRecursive(srcDir, dstDir) {
  await fs.mkdir(dstDir, { recursive: true })
  const entries = await fs.readdir(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const s = path.join(srcDir, entry.name)
    const d = path.join(dstDir, entry.name)
    if (entry.isDirectory()) {
      await copyDirRecursive(s, d)
    } else if (entry.isFile()) {
      await fs.copyFile(s, d)
    }
  }
}

// Skills that have additional sub-files (references/, examples/, scripts/)
// beyond just SKILL.md. Their canonicalDir is where these sub-files live.
const SUBDIR_SKILLS = [
  {
    skill: 'code-reviewer',
    canonicalDir: '.claude/skills/code-reviewer',
  },
  {
    skill: 'webapp-testing',
    canonicalDir: '.claude/skills/webapp-testing',
  },
  {
    skill: 'systematic-debugging',
    canonicalDir: '.claude/skills/systematic-debugging',
  },
]

let ok = true
for (const p of PAIRS) {
  const result = await installOne(p.skill, p.canonical, p.mirrors)
  if (!result) ok = false
}

for (const p of SUBDIR_SKILLS) {
  const mirrors = [
      '.agents/skills/' + p.skill + '/SKILL.md',
      '.claude/skills/' + p.skill + '/SKILL.md',
      'agent/skills/' + p.skill + '/SKILL.md',
    ]
  const result = await installSkillSubdir(p.skill, p.canonicalDir, mirrors)
  if (!result) ok = false
}
process.exit(ok ? 0 : 1)
