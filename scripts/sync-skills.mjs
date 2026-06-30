// Single-source the project skills. Canonical = .claude/skills; mirror = .agents/skills.
// Claude Code reads .claude/skills, Codex reads .agents/skills. Edit ONLY .claude/skills,
// then run `pnpm skills:sync`. `pnpm skills:check` fails CI if the two drift.
import { existsSync, rmSync, cpSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const canonical = resolve(root, '.claude/skills')
const mirror = resolve(root, '.agents/skills')

if (!existsSync(canonical)) {
  console.error(`canonical skills dir missing: ${canonical}`)
  process.exit(1)
}

rmSync(mirror, { recursive: true, force: true })
cpSync(canonical, mirror, { recursive: true })
console.log('skills synced: .claude/skills -> .agents/skills')
