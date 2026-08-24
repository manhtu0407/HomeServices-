// Fixture suite for the protocol reachability ratchet.
//
// Each negative case is one defect the gate exists to catch, written so the case fails if the
// check is ever weakened: the assertion names the token the message must carry, not merely
// that some problem was raised.

import assert from 'node:assert/strict'
import test from 'node:test'

import { EXEMPT, routes } from './check-protocol-routes.mjs'

const FILES = ['code-hygiene.md', 'diagnose.md', 'dormant.md', 'test-pillars.md', 'work-router.md']

const CRITICAL = `## 0. Agent Activation Contract

## 1. Quick Protocol Index

| If the task is... | Required protocols |
|---|---|
| Any coding change | \`kael-preflight\`, \`kael-review\` |
| Bug, failing test | \`kael-diagnose\` |
| Writing or reviewing any test | \`protocols/test-pillars.md\` |

### Protocol Source Files

| Protocol(s) | File |
|---|---|
| \`kael-diagnose\` | \`protocols/diagnose.md\` |
| test pillars | \`protocols/test-pillars.md\` |
| dormant protocols | \`protocols/dormant.md\` |
| \`kael-work-router\` | \`protocols/work-router.md\` |

## 2. Task Classification Matrix

## 5. Kael Protocol: \`kael-preflight\`

## 8. Kael Protocol: \`kael-review\`
`

function run(overrides = {}) {
  return routes({ critical: CRITICAL, protocolFiles: FILES, skills: [], claudeMd: '', ...overrides })
}

function messages(report) {
  return report.problems.join('\n')
}

test('a fully routed stack raises nothing', () => {
  const report = run()
  assert.deepEqual(report.problems, [])
  assert.equal(report.protocols, FILES.length)
  assert.equal(report.exempt, Object.keys(EXEMPT).length)
})

test('a protocol file no routing row selects is caught', () => {
  const report = run({ critical: CRITICAL.replace('| Writing or reviewing any test | `protocols/test-pillars.md` |\n', '') })
  assert.match(messages(report), /test-pillars\.md: no row in .* selects it/)
})

test('a protocol file that exists but is in no table is caught', () => {
  const report = run({ protocolFiles: [...FILES, 'fake.md'] })
  assert.match(messages(report), /fake\.md/)
})

test('a source-table row pointing at a file that does not exist is caught', () => {
  const report = run({ protocolFiles: FILES.filter((file) => file !== 'diagnose.md') })
  assert.match(messages(report), /diagnose\.md/)
})

test('a routing-table name that resolves to nothing is caught', () => {
  const report = run({ critical: CRITICAL.replace('`kael-diagnose` |', '`kael-diagnose`, `kael-khong-co-that` |') })
  assert.match(messages(report), /kael-khong-co-that: named in the routing table but resolves to no source file/)
  assert.deepEqual(report.orphans, ['kael-khong-co-that'])
})

test('a routing-table name resolves when a skill of that name exists', () => {
  const withSkill = CRITICAL.replace('`kael-diagnose` |', '`kael-diagnose`, `kael-codebase-memory` |')
  assert.deepEqual(run({ critical: withSkill, skills: ['kael-codebase-memory'] }).problems, [])
  assert.match(messages(run({ critical: withSkill })), /kael-codebase-memory/)
})

test('an exemption that has become routed is caught so the exempt set cannot grow quietly', () => {
  const routedDormant = CRITICAL.replace(
    '| Bug, failing test | `kael-diagnose` |',
    '| Bug, failing test | `kael-diagnose` |\n| Something dormant | `protocols/dormant.md` |',
  )
  assert.match(messages(run({ critical: routedDormant })), /dormant\.md: exempt as .* but a routing row now selects it/)
})

test('an exemption naming a file that no longer exists is caught', () => {
  const report = run({ protocolFiles: FILES.filter((file) => file !== 'code-hygiene.md') })
  assert.match(messages(report), /EXEMPT names code-hygiene\.md .* but no such protocol file exists/)
})

test('a protocol claimed inline without a section in critical.md is caught', () => {
  const report = run({ critical: CRITICAL.replace('## 5. Kael Protocol: `kael-preflight`', '## 5. Preflight') })
  assert.match(messages(report), /kael-preflight: claimed inline .* but it has no protocol section/)
})

test('CLAUDE.md pointing at a protocol file that does not exist is caught', () => {
  const report = run({ claudeMd: 'read `governance/protocols/ghost.md` for this' })
  assert.match(messages(report), /CLAUDE\.md points at governance\/protocols\/ghost\.md, which does not exist/)
})

test('a missing section 1 fails loudly instead of passing empty', () => {
  const report = run({ critical: '# critical\n\n## 2. Task Classification Matrix\n' })
  assert.match(messages(report), /no `## 1\. Quick Protocol Index` section/)
})

test('a missing Protocol Source Files table fails loudly instead of passing empty', () => {
  const report = run({ critical: '## 1. Quick Protocol Index\n\n| a | b |\n\n## 2. Task Classification Matrix\n' })
  assert.match(messages(report), /no `### Protocol Source Files` table/)
})
