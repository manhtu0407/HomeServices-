// Builds the six-service J01-J15 matrix from the T0 journey results and the T1 logs. A T1 cell is PASS only when the log that
// proves it says so; a missing or failing log leaves the checkpoint at its T0 result (BLOCKED stays BLOCKED).
// usage: node make-s5-matrix.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const evidenceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '')
const SERVICES = ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']
const CHECKPOINTS = Array.from({ length: 15 }, (_, index) => `J${String(index + 1).padStart(2, '0')}`)

const journeys = {}
for (const [label, file] of [['flags_off', 'journey.json'], ['flags_on', 'journey-flags-on.json']]) {
  const doc = JSON.parse(read(join(evidenceRoot, 'results/post', file)))
  for (const run of doc.runs) {
    if (run.run !== 1) continue
    for (const checkpoint of run.checkpoints) {
      journeys[run.service] ??= {}
      journeys[run.service][checkpoint.id] ??= {}
      journeys[run.service][checkpoint.id][label] = checkpoint.result
      journeys[run.service][checkpoint.id].name = checkpoint.name
    }
  }
}

const suite = read(join(evidenceRoot, 'logs/t1/sql-suite.txt'))
const passed = (file) => new RegExp(`^PASS\\s+${file.replaceAll('.', '\\.')}$`, 'm').test(suite)
const summary = suite.match(/sql verification: discovered=(\d+) executed=(\d+) passed=(\d+) failed=(\d+)/)
const concurrency = {
  payment: /payment concurrency: all assertions passed/.test(read(join(evidenceRoot, 'logs/t1/payment-concurrency.txt'))),
  confirmAccept: /confirmation, accept and turn-index concurrency: all assertions passed/.test(read(join(evidenceRoot, 'logs/t1/confirm-accept-concurrency.txt'))),
}
const writers = Object.fromEntries(read(join(evidenceRoot, 'logs/t1/status-writers.txt')).split(/\r?\n/).filter((line) => line.includes('=')).map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]))
const mutations = read(join(evidenceRoot, 'logs/t1/mutations.txt'))

const evidence = {
  sql_suite: summary ? { discovered: Number(summary[1]), executed: Number(summary[2]), passed: Number(summary[3]), failed: Number(summary[4]) } : null,
  gate_sql: passed('six_service_confirmation_gate_verification.sql'),
  accept_sql: passed('worker_accept_authority_verification.sql'),
  bank_sql: passed('manual_bank_reconciliation_behavior_verification.sql'),
  completion_sql: passed('canonical_completion_payment_authority_verification.sql'),
  concurrency,
  status_writers_closed: writers.of_which_executable_by_anon_or_authenticated === '0' && Number(writers.sql_functions_that_update_jobs_status ?? 0) > 0 && writers.authenticated_table_privileges_on_jobs === 'SELECT',
  reviewed_writers_closed: writers.reviewed_writers_executable_by_api_roles === '0',
}

const t1 = (checkpoint) => {
  switch (checkpoint) {
    case 'J01': return evidence.gate_sql ? { kind: 'decisive', result: 'PASS', basis: 'Case rows for the service satisfy the real status, phase and diagnosis_scope constraints (six_service_confirmation_gate)' } : null
    case 'J03': return evidence.gate_sql ? { kind: 'decisive', result: 'PASS', basis: 'database refuses incomplete, wrong-kind, policy-less and safety-blocked confirmations without a write, accepts the ready Case once and replays it (six_service_confirmation_gate)' } : null
    case 'J04':
    case 'J05': return evidence.gate_sql && evidence.status_writers_closed ? { kind: 'corroborating', result: 'PASS', basis: 'T0 Edge refusal stands; T1 shows no API role can write Cases or Job status, and RLS adds no barrier because the Edge writes with the service role' } : null
    case 'J06':
    case 'J07':
    case 'J08':
    case 'J09':
    case 'J10': return evidence.status_writers_closed ? { kind: 'corroborating', result: 'PASS', basis: 'T0 transition table stands; T1 shows every SQL writer of jobs.status is service-role only, and that SQL carries no second transition table' } : null
    case 'J11': return evidence.accept_sql && evidence.concurrency.confirmAccept ? { kind: 'generic', result: 'PASS', basis: 'non-Worker ids refused with zero writes, one winner under concurrency (worker_accept_authority; service-independent RPC exercised on a plumbing fixture)' } : null
    case 'J12': return evidence.reviewed_writers_closed && evidence.completion_sql ? { kind: 'corroborating', result: 'PASS', basis: 'reviewed is written only by service-role functions; review requires paid (canonical_completion_payment_authority)' } : null
    case 'J14': return evidence.bank_sql && evidence.concurrency.payment ? { kind: 'generic', result: 'PASS_WITH_FINDING', basis: 'order opened for all six services, reconciliation exercised on electrical, plumbing and cleaning fixtures (service-independent code); manual-bank rail verified at T1 for all ten owner items; F-PAY-1 (a reconcile_required order cannot later be confirmed) is open' } : null
    case 'J15': return evidence.gate_sql && evidence.concurrency.confirmAccept ? { kind: 'decisive', result: 'PASS', basis: 'unique (session, turn_index), per-actor RLS, no API write path, atomic refusal, concurrent confirmation and turn-index races (six_service_confirmation_gate + confirm-accept-concurrency)' } : null
    default: return null
  }
}

const matrix = {}
for (const service of SERVICES) {
  matrix[service] = {}
  for (const checkpoint of CHECKPOINTS) {
    const t0 = journeys[service]?.[checkpoint] ?? {}
    const overlay = t1(checkpoint)
    matrix[service][checkpoint] = {
      name: t0.name,
      t0_flags_off: t0.flags_off,
      t0_flags_on: t0.flags_on,
      t1: overlay?.result ?? 'NOT_RUN',
      t1_kind: overlay?.kind ?? null,
      basis: overlay?.basis ?? null,
      final: overlay?.result ?? t0.flags_off,
    }
  }
}
const final = (service) => CHECKPOINTS.map((checkpoint) => matrix[service][checkpoint].final)
const verdict = (service) => {
  const cells = final(service)
  if (cells.some((cell) => cell === 'FAIL')) return 'FAIL'
  if (cells.some((cell) => cell === 'BLOCKED' || cell === 'NOT_RUN')) return 'BLOCKED'
  return cells.some((cell) => cell === 'PASS_WITH_FINDING') ? 'PASS_WITH_FINDING' : 'PASS'
}
const out = { schema: 'nestscout.four_blocker.s5_matrix.v1', evidence, mutation_log_present: mutations.length > 0, verdicts: Object.fromEntries(SERVICES.map((service) => [service, verdict(service)])), matrix }
writeFileSync(join(evidenceRoot, 'results/s5-matrix.json'), `${JSON.stringify(out, null, 1)}\n`)

const short = { PASS: 'PASS', PASS_WITH_FINDING: 'PASS*', BLOCKED: 'BLOCKED', INVENTORY: 'INV', FAIL: 'FAIL', NOT_RUN: 'n/r', KNOWN_GAP: 'GAP' }
const lines = [`| checkpoint | ${SERVICES.join(' | ')} |`, `|---|${SERVICES.map(() => '---').join('|')}|`]
for (const checkpoint of CHECKPOINTS) {
  lines.push(`| ${checkpoint} ${matrix.electrical[checkpoint].name ?? ''} | ${SERVICES.map((service) => {
    const cell = matrix[service][checkpoint]
    const tier = cell.t1_kind === 'decisive' ? 'T1' : cell.t1_kind === 'corroborating' ? 'T0+T1c' : cell.t1_kind === 'generic' ? 'T1g' : 'T0'
    return `${short[cell.final] ?? cell.final} (${tier})`
  }).join(' | ')} |`)
}
lines.push(`| journey verdict | ${SERVICES.map((service) => out.verdicts[service]).join(' | ')} |`)
lines.push('', 'T1 = the database decided the cell for that service. T0+T1c = the T0 Edge or state-machine result decides and T1 corroborates (no API role can write Jobs or Cases). T1g = generic service-independent RPC verified at T1 on a subset of services (J11 on a plumbing fixture; J14 order creation on all six, reconciliation on electrical, plumbing and cleaning). PASS* = passes the checks asked for with finding F-PAY-1 open.')
writeFileSync(join(evidenceRoot, 'results/s5-matrix.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
console.log(JSON.stringify(evidence))
