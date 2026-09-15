import { createHash } from 'node:crypto'
import {
  canonicalMigrationEntries,
  resolveHostedMigrationState,
} from './migration-history.mjs'

const RELEASE_TARGETS = Object.freeze({
  production: Object.freeze({
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
  }),
})

const DESTRUCTIVE_SQL = Object.freeze([
  { label: 'DROP COLUMN', pattern: /\balter\s+table\b[\s\S]*?\bdrop\s+column\b/giu },
  { label: 'DROP CONSTRAINT', pattern: /\balter\s+table\s+(?:if\s+exists\s+)?(?:[a-z_][a-z0-9_]*\.)?[a-z_][a-z0-9_]*\s+drop\s+constraint\s+(?:if\s+exists\s+)?[a-z_][a-z0-9_]*/giu },
  { label: 'ALTER COLUMN TYPE', pattern: /\balter\s+table\b[\s\S]*?\balter\s+column\b[\s\S]*?\btype\b/giu },
  { label: 'RENAME', pattern: /\balter\s+(?:table|type|view|materialized\s+view)\b[\s\S]*?\brename\b/giu },
  { label: 'DROP OBJECT', pattern: /\bdrop\s+(?:table|schema|view|materialized\s+view|type|function|procedure|index|sequence|extension|trigger|policy)\b/giu },
  { label: 'TRUNCATE', pattern: /\btruncate(?:\s+table)?\b/giu },
  { label: 'DELETE FROM', pattern: /\bdelete\s+from\b/giu },
])

export function assertReleaseTarget(input) {
  if (input?.environment !== 'production') {
    throw new Error('Only the registered Production backend is available; Staging and Preview targets are locked.')
  }
  const expected = RELEASE_TARGETS[input?.environment]
  const projectRef = input?.projectRef?.trim()
  const projectUrl = input?.projectUrl?.trim().replace(/\/+$/u, '')
  if (!expected || projectRef !== expected.projectRef || projectUrl !== expected.projectUrl) {
    throw new Error('environment, project ref, and origin do not match the registered release target')
  }
  return { environment: input.environment, projectRef, projectUrl }
}

export function pendingMigrationEntries(inventory, hostedRows) {
  const entries = canonicalMigrationEntries(inventory)
  const localVersions = entries.map((entry) => String(entry?.version ?? ''))
  if (!entries.length || localVersions.some((version) => !/^\d{14}$/u.test(version))) {
    throw new Error('migration inventory contains an invalid version')
  }
  if (new Set(localVersions).size !== localVersions.length || localVersions.join('\n') !== [...localVersions].sort().join('\n')) {
    throw new Error('migration inventory is not unique and sorted')
  }
  const hosted = resolveHostedMigrationState(inventory, hostedRows)
  return entries.filter((entry) => !hosted.appliedCanonicalVersions.has(entry.version))
}

export function auditExpandOnlyMigration(sql, options = {}) {
  if (typeof sql !== 'string' || !sql.trim()) return ['migration SQL is empty']
  const executable = maskNonExecutableSql(sql)
  const problems = []
  for (const rule of DESTRUCTIVE_SQL) {
    for (const match of executable.matchAll(rule.pattern)) {
      if (rule.label === 'DROP CONSTRAINT' && allowedHostedConstraintRelaxation(
        sql,
        match.index ?? 0,
        options.migrationObjectPreconditions,
      )) continue
      if (rule.label === 'DROP OBJECT' && allowedAbsentRecreatedTrigger(
        executable,
        match.index ?? 0,
        options.migrationObjectPreconditions,
      )) continue
      problems.push(`${rule.label} at line ${lineNumberAt(executable, match.index ?? 0)} is not expand-only`)
    }
  }
  auditDollarQuotedBodies(sql, problems)
  return problems
}

function allowedHostedConstraintRelaxation(source, index, preconditions) {
  const statement = /^alter\s+table\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s+drop\s+constraint\s+if\s+exists\s+([a-z_][a-z0-9_]*)\s*;/iu
    .exec(source.slice(index))
  if (!statement) return false
  const [, schemaName, relationName, objectName] = statement.map((value) => value?.toLowerCase())
  const proof = Array.isArray(preconditions) && preconditions.find((item) =>
    item?.object_kind === 'constraint' && item?.schema_name === schemaName &&
    item?.relation_name === relationName && item?.object_name === objectName &&
    item?.exists === true && typeof item?.definition === 'string')
  if (!proof) return false
  const identifier = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const replacement = new RegExp(
    `\\balter\\s+table\\s+${identifier(schemaName)}\\.${identifier(relationName)}` +
      `\\s+add\\s+constraint\\s+${identifier(objectName)}\\s+check\\s*\\(([^;]+)\\)\\s*;`,
    'iu',
  ).exec(source.slice(index + statement[0].length))
  if (!replacement) return false
  const hosted = parseAllowedCheckValues(proof.definition)
  const proposed = parseAllowedCheckValues(`CHECK (${replacement[1]})`)
  return hosted !== null && proposed !== null &&
    hosted.column === proposed.column && proposed.values.size > hosted.values.size &&
    [...hosted.values].every((value) => proposed.values.has(value))
}

function parseAllowedCheckValues(definition) {
  const column = /check\s*\(\s*([a-z_][a-z0-9_]*)\s*(?:=\s*any\s*\(\s*array\s*\[|in\s*\()/iu.exec(definition)?.[1]?.toLowerCase()
  const values = new Set([...String(definition).matchAll(/'((?:''|[^'])*)'(?:\s*::[a-z_][a-z0-9_]*)?/giu)]
    .map((match) => match[1].replaceAll("''", "'")))
  return column && values.size ? { column, values } : null
}

function allowedAbsentRecreatedTrigger(source, index, preconditions) {
  const statement = /^drop\s+trigger\s+if\s+exists\s+([a-z_][a-z0-9_]*)\s+on\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\s*;/iu
    .exec(source.slice(index))
  if (!statement) return false
  const [, objectName, schemaName, relationName] = statement.map((value) => value?.toLowerCase())
  const exactAbsentProof = Array.isArray(preconditions) && preconditions.some((item) =>
    item?.object_kind === 'trigger' && item?.schema_name === schemaName &&
    item?.relation_name === relationName && item?.object_name === objectName && item?.exists === false)
  if (!exactAbsentProof) return false
  const identifier = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const recreated = new RegExp(
    `\\bcreate(?:\\s+or\\s+replace)?\\s+trigger\\s+${identifier(objectName)}\\b[\\s\\S]*?` +
      `\\bon\\s+${identifier(schemaName)}\\.${identifier(relationName)}\\b`,
    'iu',
  )
  return recreated.test(source)
}

const SYNTHETIC_CLEANUP_TABLES = new Set([
  'api_logs',
  'customer_favorite_workers',
  'customer_payment_methods',
  'disputes',
  'jobs',
  'kael_ab_price_synthesis_cases',
  'kael_admin_queue',
  'kael_chat_sessions',
  'kael_optimization_metrics',
  'worker_payout_methods',
  'worker_withdrawal_requests',
])

function auditDollarQuotedBodies(source, problems) {
  for (const block of source.matchAll(/(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)([\s\S]*?)\1/gu)) {
    const body = maskSqlLiteralsAndComments(block[2])
    const bodyOffset = (block.index ?? 0) + block[1].length
    const header = source.slice(Math.max(0, (block.index ?? 0) - 1200), block.index ?? 0)
    const functions = [...header.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([a-z_][a-z0-9_.]*)/giu)]
    const functionName = functions.at(-1)?.[1]?.toLowerCase() ?? null
    for (const rule of DESTRUCTIVE_SQL) {
      for (const match of body.matchAll(rule.pattern)) {
        if (rule.label === 'DELETE FROM' && allowedSyntheticStoredDelete(
          functionName,
          block[2],
          match.index ?? 0,
        )) {
          continue
        }
        problems.push(`${rule.label} in stored SQL at line ${lineNumberAt(source, bodyOffset + (match.index ?? 0))} is not expand-only`)
      }
    }
  }
}

function allowedSyntheticStoredDelete(functionName, body, index) {
  const source = body.slice(index)
  if (functionName === 'public.cleanup_synthetic_matching_cohort') {
    const statement = /^delete\s+from\s+public\.([a-z_][a-z0-9_]*)\s+where\s+synthetic_cohort_id\s*=\s*p_cohort_id\s*;/iu.exec(source)
    return Boolean(statement && SYNTHETIC_CLEANUP_TABLES.has(statement[1].toLowerCase()))
  }
  if (functionName === 'private.propagate_synthetic_member_scope') {
    return /^delete\s+from\s+public\.(?:worker_stats\s+where\s+worker_id|customer_stats\s+where\s+customer_id)\s*=\s*new\.profile_id\s*;/iu.test(source)
  }
  if (functionName === 'private.recompute_all_actor_stats') {
    return /^delete\s+from\s+public\.(worker_stats|customer_stats)\s+as\s+stats\s+using\s+public\.synthetic_matching_cohort_members\s+as\s+member\s+where\s+stats\.(?:worker_id|customer_id)\s*=\s*member\.profile_id(?:\s+and\s+member\.member_role\s*=\s*'(?:worker|customer)'::public\.user_role)?\s*;/iu.test(source)
  }
  return false
}

export function syntheticCohortId(releaseId, runId) {
  const releaseMatch = /^harness-([0-9a-f]{12})-([0-9a-f]{12})$/u.exec(String(releaseId ?? ''))
  const normalizedRunId = String(runId ?? '').trim()
  if (!releaseMatch || !/^[A-Za-z0-9_-]{1,48}$/u.test(normalizedRunId)) {
    throw new Error('synthetic cohort requires a valid immutable release and bounded run ID')
  }
  return `synthetic-stage1-${releaseMatch[1]}-${releaseMatch[2]}-${normalizedRunId}`
}

export function assertConsecutiveSyntheticSmokes(input) {
  const runs = input?.runs
  if (!Array.isArray(runs) || runs.length !== 3) throw new Error('production promotion requires exactly three synthetic smoke runs')
  for (let index = 0; index < runs.length; index += 1) {
    const run = runs[index]
    if (run?.sequence !== index + 1) throw new Error('synthetic smoke sequence is not consecutive')
    if (run?.cohortId !== input.cohortId || run?.releaseId !== input.releaseId) {
      throw new Error('synthetic smoke evidence is not bound to one cohort and release')
    }
    if (run?.syntheticLeakCount !== 0) throw new Error('synthetic records leaked into a real-user query or analytics surface')
    if (run?.scenarios?.autoQuote !== true || run?.scenarios?.rfqOrInspection !== true || run?.scenarios?.recovery !== true) {
      throw new Error(`synthetic smoke run ${run?.sequence ?? index + 1} did not complete every required scenario`)
    }
  }
  return runs
}

export function buildReleaseFailureReceipt(input) {
  const release = input?.release
  if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(release?.releaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(release?.gitSha ?? '') ||
      !/^[0-9a-f]{64}$/u.test(release?.bundleSha256 ?? '')) {
    throw new Error('failure receipt requires a valid immutable release')
  }
  const phase = String(input?.phase ?? '').trim()
  const reasonCode = String(input?.reasonCode ?? '').trim()
  const runId = String(input?.runId ?? '').trim()
  if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(phase) || !/^[A-Z][A-Z0-9_]{1,63}$/u.test(reasonCode) || !/^[A-Za-z0-9_.:-]{1,120}$/u.test(runId)) {
    throw new Error('failure receipt metadata is invalid')
  }
  const rollbackFunctions = normalizeRollbackFunctions(input.rollbackFunctions)
  const receipt = {
    schemaVersion: '1.1.0',
    status: 'aborted',
    releaseId: release.releaseId,
    releaseBundleSha256: release.bundleSha256,
    gitSha: release.gitSha,
    phase,
    reasonCode,
    runId,
    cohortId: input.cohortId ?? null,
    rollbackFunctions,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  if (receipt.cohortId !== null && !/^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u.test(receipt.cohortId)) {
    throw new Error('failure receipt cohort is invalid')
  }
  receipt.receiptSha256 = releaseFailureReceiptSha256(receipt)
  return receipt
}

function normalizeRollbackFunctions(value) {
  if (value === undefined || value === null) return null
  const names = ['kael-matching-maintainer', 'mobile-api']
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('\n') !== names.join('\n')) {
    throw new Error('failure receipt rollback function inventory is invalid')
  }
  const normalized = {}
  for (const name of names) {
    const item = value[name]
    if (!Number.isSafeInteger(item?.edgeVersion) || item.edgeVersion < 1 ||
        !/^[0-9a-f]{64}$/u.test(item?.hostedDigest ?? '')) {
      throw new Error(`failure receipt rollback evidence is invalid for ${name}`)
    }
    normalized[name] = { edgeVersion: item.edgeVersion, hostedDigest: item.hostedDigest }
  }
  return normalized
}

export function releaseFailureReceiptSha256(receipt) {
  const unsigned = { ...receipt }
  delete unsigned.receiptSha256
  return sha256(JSON.stringify(unsigned))
}

export function verifyReleaseFailureReceiptChecksum(receipt) {
  return typeof receipt?.receiptSha256 === 'string' &&
    receipt.receiptSha256 === releaseFailureReceiptSha256(receipt)
}

function maskNonExecutableSql(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, maskMatch)
    .replace(/--[^\r\n]*/gu, maskMatch)
    .replace(/\$([A-Za-z_][A-Za-z0-9_]*)\$[\s\S]*?\$\1\$/gu, maskMatch)
    .replace(/\$\$[\s\S]*?\$\$/gu, maskMatch)
    .replace(/'(?:''|[^'])*'/gu, maskMatch)
}

function maskSqlLiteralsAndComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, maskMatch)
    .replace(/--[^\r\n]*/gu, maskMatch)
    .replace(/'(?:''|[^'])*'/gu, maskMatch)
}

function maskMatch(value) {
  return value.replace(/[^\r\n]/gu, ' ')
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/u).length
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
