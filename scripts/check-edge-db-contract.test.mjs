import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createRpcExpressionResolver } from './lib/edge-db-rpc-expression.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = resolve(ROOT, 'scripts/check-edge-db-contract.mjs')
const temporaryDirectories = []

function writeFunctionsResult(value) {
  const directory = mkdtempSync(join(tmpdir(), 'nestscout-edge-db-contract-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'functions.json')
  writeFileSync(path, JSON.stringify(value))
  return path
}

function runScript(...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

function sourceFile(fileName, text) {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

function firstRpcArgument(sourceFiles) {
  let argument = null
  function visit(node) {
    if (!argument && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'rpc') argument = node.arguments[0] ?? null
    if (!argument) ts.forEachChild(node, visit)
  }
  for (const file of sourceFiles) visit(file)
  return argument
}

test.afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an empty missing-functions result is a clean parity pass', () => {
  const path = writeFunctionsResult([])
  const result = runScript('--functions', path, '--json')

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.deepEqual(JSON.parse(result.stdout).missing, [])
})

test('SQL missing-function rows are reported with their Edge call sites', () => {
  const path = writeFunctionsResult([
    { missing_in_database: 'begin_harness_authorized_request' },
  ])
  const result = runScript('--functions', path)

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stderr, /target database does not have/)
  assert.match(result.stderr, /begin_harness_authorized_request/)
  assert.match(result.stderr, /supabase\/functions\/_shared\/harness\/trace\.ts:\d+/)
})

test('JSON output reports the exact RPC names returned by SQL', () => {
  const path = writeFunctionsResult([
    { missing_in_database: 'begin_harness_authorized_request' },
  ])
  const result = runScript('--functions', path, '--json')

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`)
  assert.deepEqual(JSON.parse(result.stdout).missing, ['begin_harness_authorized_request'])
})

test('literal RPC choices in direct ternary branches are resolved instead of reported as residue', () => {
  const path = writeFunctionsResult([])
  const result = runScript('--functions', path, '--json')

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  const ternaryFiles = [
    'domains/kael-chat/confirmation-operation.ts',
    'domains/matching/broadcasts.ts',
    'domains/matching/candidate.ts',
  ]

  assert.ok(report.called.includes('activate_job_broadcast_batch_durable_atomic'))
  assert.ok(report.called.includes('confirm_kael_chat_durable_authorized_v4'))
  assert.ok(report.called.includes('confirm_worker_matching_proposal_atomic'))
  assert.deepEqual(
    report.unresolved.filter(({ site }) => ternaryFiles.some((file) => site.endsWith(file))),
    [],
  )
})

test('direct conditional RPC choices resolve without treating a nested function ternary as direct', () => {
  const direct = sourceFile('direct.ts', `client.rpc(input.mode ? "rpc_left" : "rpc_right", {});`)
  const nested = sourceFile('nested.ts', `client.rpc(selectRpc(input.mode ? "rpc_left" : "rpc_right"), {});`)
  const directResolver = createRpcExpressionResolver([direct])
  const nestedResolver = createRpcExpressionResolver([nested])

  assert.deepEqual(directResolver(firstRpcArgument([direct])), ['rpc_left', 'rpc_right'])
  assert.equal(nestedResolver(firstRpcArgument([nested])), null)
})

test('parameter RPC names resolve only when every direct helper call is static', () => {
  const definition = sourceFile('shared.ts', `
    export function forward(client: any, name: string) {
      return client.rpc(name, {});
    }
  `)
  const completeCallers = sourceFile('callers.ts', `
    import { forward } from './shared.ts';
    forward(client, 'rpc_first');
    forward(client, 'rpc_second');
  `)
  const resolver = createRpcExpressionResolver([definition, completeCallers])
  assert.deepEqual(resolver(firstRpcArgument([definition])), ['rpc_first', 'rpc_second'])

  const dynamicCaller = sourceFile('dynamic.ts', `
    import { forward } from './shared.ts';
    forward(client, getRpcName());
  `)
  const conservativeResolver = createRpcExpressionResolver([definition, completeCallers, dynamicCaller])
  assert.equal(conservativeResolver(firstRpcArgument([definition])), null)

  const reassignedDefinition = sourceFile('reassigned.ts', `
    function forward(client: any, name: string) {
      name = getRpcName();
      return client.rpc(name, {});
    }
    forward(client, 'rpc_initial');
  `)
  const reassignedResolver = createRpcExpressionResolver([reassignedDefinition])
  assert.equal(reassignedResolver(firstRpcArgument([reassignedDefinition])), null)

  const aliasedCaller = sourceFile('aliased.ts', `
    import { forward as invoke } from './shared.ts';
    invoke(client, 'rpc_hidden_behind_alias');
  `)
  const aliasResolver = createRpcExpressionResolver([definition, completeCallers, aliasedCaller])
  assert.equal(aliasResolver(firstRpcArgument([definition])), null)
})

test('parameter RPC names remain unresolved when the helper is passed indirectly', () => {
  const source = sourceFile('indirect.ts', `
    function forward(client: any, name: string) { return client.rpc(name, {}); }
    const alias = forward;
    alias(client, 'rpc_indirect');
  `)
  const resolver = createRpcExpressionResolver([source])
  assert.equal(resolver(firstRpcArgument([source])), null)
})

test('statically passed RPC names resolve while mutable cleanup-plan properties remain residue', () => {
  const path = writeFunctionsResult([])
  const result = runScript('--functions', path, '--json')

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const report = JSON.parse(result.stdout)
  const forwardedFiles = [
    'kael-media-retention/index.ts',
    'domains/admin/finance-reconciliation.ts',
    'domains/admin/policy-governance.ts',
    'domains/job/incident-data.ts',
    'domains/job/scope-change/effects-drain.ts',
    'domains/kael/kael-guardrails/durable-guards.ts',
  ]
  const expectedNames = [
    'admin_claim_payment_reconciliation_atomic',
    'admin_release_payment_reconciliation_atomic',
    'admin_draft_service_intake_policy',
    'admin_transition_service_intake_policy',
    'admin_preview_service_intake_policy_v2',
    'admin_draft_price_baseline',
    'admin_transition_price_baseline',
    'upsert_job_incident_signal_atomic',
    'claim_job_incident_scope_proposal_atomic',
    'claim_job_incident_chat_turn_atomic',
    'apply_job_incident_assistant_turn_atomic',
    'save_job_incident_scope_price_quote_atomic',
    'apply_scope_change_database_effect_atomic',
    'apply_scope_change_learning_effect_atomic',
    'is_circuit_open',
    'record_circuit_failure',
    'record_circuit_success',
    'rate_take',
  ]

  assert.deepEqual(
    report.unresolved
      .filter(({ site }) => forwardedFiles.some((file) =>
        site.slice(0, site.lastIndexOf(':')).endsWith(file)))
      .map(({ expression }) => expression)
      .sort(),
    ['plan.claimRpc', 'plan.completeRpc'],
  )
  for (const name of expectedNames) assert.ok(report.called.includes(name), `missing ${name}`)
})

test('unexpected SQL rows are rejected instead of becoming a parity result', () => {
  const path = writeFunctionsResult([
    { missing_in_database: 'unrelated_database_function' },
  ])
  const result = runScript('--functions', path, '--json')

  assert.equal(result.status, 2)
  assert.match(result.stderr, /invalid or unexpected missing RPC row/)
})
