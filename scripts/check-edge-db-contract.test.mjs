import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import ts from 'typescript'
import { createRpcExpressionResolver } from './lib/edge-db-rpc-expression.mjs'

const ROOT = process.cwd()
const SCRIPT = resolve(ROOT, 'scripts/check-edge-db-contract.mjs')

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

function run(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  })
}

test('RPC resolver distinguishes direct static choices from nested dynamic expressions', () => {
  const direct = sourceFile('direct.ts', 'client.rpc(input.mode ? "rpc_left" : "rpc_right", {});')
  const nested = sourceFile('nested.ts', 'client.rpc(selectRpc(input.mode ? "rpc_left" : "rpc_right"), {});')
  assert.deepEqual(
    createRpcExpressionResolver([direct])(firstRpcArgument([direct])),
    ['rpc_left', 'rpc_right'],
  )
  assert.equal(createRpcExpressionResolver([nested])(firstRpcArgument([nested])), null)
})

test('RPC parameter resolution requires complete direct, immutable call sites', () => {
  const definition = sourceFile('shared.ts', [
    'export function forward(client: any, name: string) {',
    '  return client.rpc(name, {});',
    '}',
  ].join(String.fromCharCode(10)))
  const callers = sourceFile('callers.ts', [
    "import { forward } from './shared.ts';",
    "forward(client, 'rpc_first');",
    "forward(client, 'rpc_second');",
  ].join(String.fromCharCode(10)))
  assert.deepEqual(
    createRpcExpressionResolver([definition, callers])(firstRpcArgument([definition])),
    ['rpc_first', 'rpc_second'],
  )

  const dynamic = sourceFile('dynamic.ts', [
    "import { forward } from './shared.ts';",
    'forward(client, getRpcName());',
  ].join(String.fromCharCode(10)))
  assert.equal(
    createRpcExpressionResolver([definition, callers, dynamic])(firstRpcArgument([definition])),
    null,
  )
})
test('the emitted database inventory is consumable by the RPC comparison', () => {
  const query = run(['--emit-sql'])
  assert.equal(query.status, 0, query.stderr)
  assert.match(query.stdout, /select c\.name as name/u)
  assert.match(query.stdout, /where exists \(/u)
  assert.doesNotMatch(query.stdout, /missing_in_database|where not exists/u)

  const match = /unnest\(array\[(.*?)\]::text\[\]\)/su.exec(query.stdout)
  assert.ok(match)
  const available = [...match[1].matchAll(/'([a-z][a-z0-9_]*)'/gu)].map((entry) => entry[1])
  const directory = mkdtempSync(resolve(tmpdir(), 'edge-db-contract-'))
  const functionsPath = resolve(directory, 'functions.json')
  try {
    writeFileSync(functionsPath, JSON.stringify(available))
    const result = run(['--functions', functionsPath, '--json'])
    assert.equal(result.status, 0, result.stderr)
    const comparison = JSON.parse(result.stdout)
    assert.deepEqual(comparison.missing, [])
    assert.deepEqual(comparison.unresolved, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an empty target inventory is a complete result, not a malformed response', () => {
  const query = run(['--emit-sql'])
  assert.equal(query.status, 0, query.stderr)
  const directory = mkdtempSync(resolve(tmpdir(), 'edge-db-empty-'))
  const functionsPath = resolve(directory, 'functions.json')
  try {
    writeFileSync(functionsPath, '[]')
    const result = run(['--functions', functionsPath, '--json'])
    assert.equal(result.status, 1)
    const report = JSON.parse(result.stdout)
    assert.ok(report.called.length > 0)
    assert.deepEqual(report.missing, report.called)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
