// Fail if .claude/skills and .agents/skills have drifted. Run in CI as a ratchet.
// Fix drift by editing the canonical .claude/skills and running `pnpm skills:sync`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const canonical = resolve(root, '.claude/skills')
const mirror = resolve(root, '.agents/skills')

function walk(dir, base, acc) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, base, acc)
    else acc.set(relative(base, full).split('\\').join('/'), readFileSync(full))
  }
  return acc
}

if (!existsSync(canonical) || !existsSync(mirror)) {
  console.error('skills dirs missing; expected both .claude/skills and .agents/skills')
  process.exit(1)
}

const a = walk(canonical, canonical, new Map())
const b = walk(mirror, mirror, new Map())
const problems = []
for (const [rel, buf] of a) {
  if (!b.has(rel)) problems.push(`only in .claude/skills: ${rel}`)
  else if (!buf.equals(b.get(rel))) problems.push(`content differs: ${rel}`)
}
for (const rel of b.keys()) if (!a.has(rel)) problems.push(`only in .agents/skills: ${rel}`)

if (problems.length) {
  console.error('skills drift detected (run `pnpm skills:sync`):')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('skills in sync: .claude/skills === .agents/skills')
