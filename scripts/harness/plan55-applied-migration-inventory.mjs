import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { isAbsolute, resolve, sep } from 'node:path'

import { assertReleaseTarget } from './release-safety.mjs'
import { validateMigrationEquivalences } from './migration-history.mjs'

export function buildPlan55AppliedMigrationInventory({
  root,
  sourceInventory,
  hostedState,
  expectedProjectRef,
  expectedProductionBase,
} = {}) {
  if (!root || !sourceInventory || !hostedState || !expectedProjectRef || !expectedProductionBase) {
    throw new Error('Plan 55 applied migration inventory inputs are incomplete')
  }
  const repoRoot = resolve(root)
  const target = assertReleaseTarget({
    environment: hostedState.environment,
    projectRef: hostedState.projectRef,
    projectUrl: `https://${hostedState.projectRef}.supabase.co`,
  })
  if (target.projectRef !== expectedProjectRef) {
    throw new Error('Plan 55 applied migrations require the exact Production target')
  }
  if (!/^[0-9a-f]{40}$/u.test(expectedProductionBase.sha ?? '') ||
      !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(expectedProductionBase.releaseId ?? '') ||
      hostedState.gitSha !== expectedProductionBase.sha ||
      hostedState.releaseId !== expectedProductionBase.releaseId) {
    throw new Error('hosted state does not match the exact Production release base')
  }

  const sourceEntries = validateSourceInventory(repoRoot, sourceInventory)
  if (!Array.isArray(hostedState.migrations) || hostedState.migrations.length === 0) {
    throw new Error('hosted applied Production migrations are missing')
  }
  const hostedVersions = hostedState.migrations.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
        !/^\d{14}$/u.test(String(row.version ?? '')) ||
        !/^[a-z0-9_]+$/u.test(String(row.name ?? ''))) {
      throw new Error('hosted applied Production migration identity is invalid')
    }
    return { version: String(row.version), name: String(row.name) }
  })
  const versions = hostedVersions.map(({ version }) => version)
  if (new Set(versions).size !== versions.length) {
    throw new Error('duplicate applied Production migration')
  }
  if (versions.join('\n') !== [...versions].sort().join('\n')) {
    throw new Error('applied Production migrations are not ordered')
  }

  const sourceByVersion = new Map(sourceEntries.map((entry) => [entry.version, entry]))
  const entries = hostedVersions.map(({ version, name }) => {
    const entry = sourceByVersion.get(version)
    if (!entry) throw new Error(`unknown applied Production migration: ${version}`)
    if (entry.name !== name) {
      throw new Error(`applied Production migration name mismatch: ${version}`)
    }
    return entry
  })
  const result = {
    version: sourceInventory.version,
    historicalBaseline: sourceInventory.historicalBaseline,
    migrationCount: entries.length,
    migrationEquivalences: { version: '1.0.0', groups: [] },
    migrationsSha256: sha256(entries.map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join('')),
    databaseTypes: sourceInventory.databaseTypes,
    entries,
  }
  return result
}

function validateSourceInventory(root, inventory) {
  if (inventory.version !== '1.1.0' || !Array.isArray(inventory.entries) ||
      inventory.migrationCount !== inventory.entries.length ||
      !/^[0-9a-f]{64}$/u.test(inventory.migrationsSha256 ?? '') ||
      !inventory.historicalBaseline ||
      !/^[0-9a-f]{64}$/u.test(inventory.historicalBaseline.sha256 ?? '') ||
      !/^[0-9a-f]{64}$/u.test(inventory.databaseTypes?.sha256 ?? '')) {
    throw new Error('source migration inventory is invalid')
  }
  const versions = inventory.entries.map((entry) => String(entry?.version ?? ''))
  if (versions.some((version) => !/^\d{14}$/u.test(version)) ||
      new Set(versions).size !== versions.length ||
      versions.join('\n') !== [...versions].sort().join('\n')) {
    throw new Error('source migration inventory is not unique and ordered')
  }
  const equivalenceProblems = validateMigrationEquivalences(inventory.migrationEquivalences, inventory.entries)
  if (equivalenceProblems.length) throw new Error('source migration equivalence registry is invalid')

  for (const entry of inventory.entries) {
    if (!/^[a-z0-9_]+$/u.test(entry.name ?? '') ||
        entry.file !== `supabase/migrations/${entry.version}_${entry.name}.sql` ||
        !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '') ||
        !Number.isSafeInteger(entry.bytes) || entry.bytes < 0) {
      throw new Error(`source migration entry is invalid: ${entry.file ?? 'unknown'}`)
    }
    const path = resolve(root, entry.file)
    const relative = path.slice(root.length).replaceAll('\\', '/')
    if (isAbsolute(entry.file) || relative.startsWith('/../') || relative.startsWith('/..') ||
        !path.startsWith(`${root}${sep}`)) {
      throw new Error('source migration path escapes repository root')
    }
    const bytes = Buffer.from(readFileSync(path, 'utf8').replace(/\r\n/gu, '\n'), 'utf8')
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) {
      throw new Error(`source migration digest mismatch: ${entry.version}`)
    }
  }
  const aggregate = sha256(inventory.entries
    .map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join(''))
  if (aggregate !== inventory.migrationsSha256) {
    throw new Error('source migration inventory checksum mismatch')
  }
  return inventory.entries
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
