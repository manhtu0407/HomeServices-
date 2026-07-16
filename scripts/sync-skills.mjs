// Single-source the project skills. Canonical = .claude/skills; mirror = .agents/skills.
// Claude Code reads .claude/skills, Codex reads .agents/skills. Edit ONLY .claude/skills,
// then run `pnpm skills:sync`. `pnpm skills:check` fails CI if the two drift.
import { cpSync, existsSync, renameSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const canonical = resolve(root, '.claude/skills')
const mirror = resolve(root, '.agents/skills')

export function syncSkills(source, destination, operations = {}) {
  const copy = operations.copy ?? cpSync
  const exists = operations.exists ?? existsSync
  const remove = operations.remove ?? rmSync
  const rename = operations.rename ?? renameSync
  if (!exists(source)) throw new Error(`canonical skills dir missing: ${source}`)

  const suffix = `${process.pid}-${randomUUID()}`
  const staging = resolve(dirname(destination), `.skills-sync-${suffix}`)
  const backup = resolve(dirname(destination), `.skills-backup-${suffix}`)
  let previousMoved = false
  let installed = false

  try {
    copy(source, staging, { recursive: true, errorOnExist: true, force: false })
    if (exists(destination)) {
      rename(destination, backup)
      previousMoved = true
    }
    try {
      rename(staging, destination)
      installed = true
    } catch (error) {
      if (previousMoved && exists(backup) && !exists(destination)) {
        rename(backup, destination)
        previousMoved = false
      }
      throw error
    }
    if (previousMoved) {
      remove(backup, { recursive: true, force: true })
      previousMoved = false
    }
  } finally {
    if (exists(staging)) remove(staging, { recursive: true, force: true })
    if (!installed && previousMoved && exists(backup) && !exists(destination)) {
      rename(backup, destination)
    }
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    syncSkills(canonical, mirror)
    console.log('skills synced: .claude/skills -> .agents/skills')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
