// Reduces the real transaction catalog to one reviewed entry and fabricates the runner report that
// passes every assertion bound to it, so receipt and packet tests exercise the real binding shape.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = JSON.parse(readFileSync(resolve('config/harness/transaction-critical-coverage.json'), 'utf8'))

export const clone = (value) => JSON.parse(JSON.stringify(value))

export function transactionBehaviorFixture(status) {
  const value = clone(manifest)
  const entry = value.entries.find((item) => item.id === 'worker.fulfillment.advance')
  const coverage = value.behavioral_contract.bindings[entry.id]
  const binding = coverage.cases[0]
  value.entries = [entry]
  entry.from = [...binding.from]
  entry.to = [...binding.to]
  coverage.status = status
  coverage.gaps = status === 'PARTIAL' ? ['Hosted transaction proof remains open.'] : []
  value.behavioral_contract.bindings = { [entry.id]: coverage }
  const report = {
    success: true,
    testResults: [{
      name: `/ci/workspace/${binding.file}`,
      status: 'passed',
      assertionResults: [...binding.success_tests, ...binding.denial_tests, ...(binding.recovery_tests ?? [])]
        .map((fullName) => ({ fullName, status: 'passed' })),
    }],
  }
  return { value, report }
}
