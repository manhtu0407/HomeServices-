import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const plan = readFileSync(resolve(ROOT, 'Plan.md'), 'utf-8').replace(/\r\n/g, '\n')

const between = (start: string, end: string) => {
  const startIndex = plan.indexOf(start)
  const endIndex = plan.indexOf(end, startIndex + start.length)

  expect(startIndex).toBeGreaterThanOrEqual(0)
  expect(endIndex).toBeGreaterThan(startIndex)

  return plan.slice(startIndex, endIndex)
}

describe('Plan 26 F8 version bump', () => {
  it('bumps sections 23, 24, and 25 to v2.0 in metadata', () => {
    for (const planId of [
      'plan-kael-harness-agentic',
      'plan-cost-optimization-anthropic',
      'plan-source-trust-multi-llm',
    ]) {
      const metadataStart = plan.indexOf(`Plan ID:        ${planId}`)
      const metadata = plan.slice(metadataStart, plan.indexOf('```', metadataStart))

      expect(metadata).toContain('Status:         v2.0 F26 reconciled 2026-05-26')
      expect(metadata).toContain('PR #37-#40 audit gaps closed in §26')
    }
  })

  it('adds v2.0 changelog rows that reference PR #37-#40 and Plan §26', () => {
    for (const section of ['23.24', '24.11', '25.14']) {
      const log = between(`### ${section} Change Log`, `### ${section.split('.')[0]}.${Number(section.split('.')[1]) + 1}`)

      expect(log).toContain('| 2.0 | 2026-05-26 | Tu + Claude + Codex |')
      expect(log).toContain('PR #37-#40')
      expect(log).toContain('Plan.md §26')
    }
  })

  it('keeps phase bodies free of F8 metadata/changelog edits', () => {
    const section23Body = between('### 23.1 Glossary', '### 23.24 Change Log')
    const section24Body = between('### 24.1 Decisions Locked', '### 24.11 Change Log')
    const section25Body = between('### 25.1 Decisions Locked', '### 25.14 Change Log')

    for (const body of [section23Body, section24Body, section25Body]) {
      expect(body).not.toContain('v2.0 F26 reconciled')
      expect(body).not.toContain('| 2.0 | 2026-05-26 |')
    }
  })
})
