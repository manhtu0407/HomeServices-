import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../../')
const harnessPath = resolve(repoRoot, 'apps/api/scripts/kael-p15-staging-e2e.mjs')

describe('P15 staging E2E harness contract', () => {
  it('defines the 5-case matrix and acceptance limits from Plan.md P15', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('P15_CASE_MATRIX')
    expect(source).toContain('normal_transaction')
    expect(source).toContain('demanding_customer')
    expect(source).toContain('worker_cancellation')
    expect(source).toContain('customer_cancellation')
    expect(source).toContain('dispute')
    expect(source).toContain('intakeP95Ms: 12_000')
    expect(source).toContain('worstTransactionCostUsd: 0.30')
  })

  it('requires real staging execution, cleanup verification, and /log report fields', () => {
    const source = readFileSync(harnessPath, 'utf8')

    expect(source).toContain('P15_RUN_LIVE')
    expect(source).toContain('xyylanuyflrjzbjzhqfl')
    expect(source).toContain('verifyCleanup')
    expect(source).toContain('Document type:')
    expect(source).toContain('Facts captured:')
    expect(source).toContain('Verification:')
    expect(source).toContain('Limitations:')
  })
})
