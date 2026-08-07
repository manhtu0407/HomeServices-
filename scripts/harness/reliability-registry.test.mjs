import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { checkReliabilityConfig, renderReliabilityRegistry } from './reliability-registry.mjs'

const config = JSON.parse(readFileSync(new URL('../../config/harness/reliability.json', import.meta.url), 'utf8'))
const capabilities = JSON.parse(readFileSync(new URL('../../config/harness/capabilities.json', import.meta.url), 'utf8'))

test('accepts the complete operation, retry, budget, and circuit contract', () => {
  assert.deepEqual(checkReliabilityConfig(config, capabilities), [])
  assert.match(renderReliabilityRegistry(config), /HARNESS_RELIABILITY_CONFIG/u)
})

test('rejects money retries and missing confirmation', () => {
  const broken = structuredClone(config)
  broken.operation_classes.money_impacting.max_attempts = 2
  broken.operation_classes.money_impacting.confirmation = false
  const problems = checkReliabilityConfig(broken, capabilities)
  assert.ok(problems.includes('money_impacting must be idempotent, confirmed, and single-attempt'))
})

test('rejects provider operation without a budget reservation', () => {
  const broken = structuredClone(config)
  broken.operation_classes.provider_call.budget = false
  assert.ok(checkReliabilityConfig(broken, capabilities).includes('provider_call must reserve budget'))
})

test('rejects undeclared route operation classes', () => {
  const brokenCapabilities = structuredClone(capabilities)
  brokenCapabilities.entries[0].operationClass = 'unknown'
  assert.ok(checkReliabilityConfig(config, brokenCapabilities).some((problem) => problem.includes('undeclared operation class')))
})
