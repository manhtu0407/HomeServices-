import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../../')
const harnessPath = resolve(repoRoot, 'apps/api/scripts/kael-eval.mjs')
const fixturePath = resolve(repoRoot, 'apps/api/fixtures/kael-eval/golden-cases.json')
const knowledgeFixturePath = resolve(repoRoot, 'apps/api/fixtures/kael-eval/knowledge-cases.json')

type EvalFixture = {
  id: string
  category: string
  input: {
    service_type: 'electrical' | 'plumbing' | 'cleaning' | 'hvac' | 'upholstery' | 'handyman'
    description: string
    problem_chips: string[]
    district?: string
  }
  expected: {
    service_type: 'electrical' | 'plumbing' | 'cleaning' | 'hvac' | 'upholstery' | 'handyman' | 'unsupported'
    problem_slug: string
    complexity: 'small' | 'medium' | 'large' | null
    price_band: { min: number; max: number } | null
    decline: boolean
  }
}

const read = (path: string) => readFileSync(path, 'utf8')

describe('Kael A5 offline evaluation harness', () => {
  it('ships a golden dataset with service balance and adversarial coverage', () => {
    expect(existsSync(fixturePath)).toBe(true)
    const fixtures = JSON.parse(read(fixturePath)) as EvalFixture[]
    const ids = new Set(fixtures.map((item) => item.id))

    expect(fixtures.length).toBeGreaterThanOrEqual(75)
    expect(ids.size).toBe(fixtures.length)
    for (const service of ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'] as const) {
      expect(fixtures.filter((item) => item.input.service_type === service && item.expected.decline === false).length)
        .toBeGreaterThanOrEqual(6)
    }
    expect(fixtures.filter((item) => item.expected.decline).length).toBeGreaterThanOrEqual(15)
    expect(new Set(fixtures.filter((item) => item.expected.decline).map((item) => item.category))).toEqual(
      new Set(['out_of_scope', 'injection', 'service_mismatch']),
    )
  })

  it('ships B6 knowledge ON/OFF cases for safety and legal boundary measurement', () => {
    expect(existsSync(knowledgeFixturePath)).toBe(true)
    const fixtures = JSON.parse(read(knowledgeFixturePath)) as Array<{
      id: string
      expected: { kind: string; required_terms: string[]; citation_prefix: string }
    }>

    expect(fixtures.length).toBeGreaterThanOrEqual(6)
    expect(fixtures.filter((item) => item.expected.kind === 'safety').length).toBeGreaterThanOrEqual(3)
    expect(fixtures.filter((item) => item.expected.kind === 'legal').length).toBeGreaterThanOrEqual(3)
    for (const fixture of fixtures) {
      expect(fixture.expected.required_terms.length).toBeGreaterThanOrEqual(2)
      expect(['worker_safety_patterns:', 'legal_awareness_patterns:']).toContain(fixture.expected.citation_prefix)
    }
  })

  it('defines deterministic and live modes with explicit regression thresholds and reports', () => {
    expect(existsSync(harnessPath)).toBe(true)
    const source = read(harnessPath)
    const pkg = JSON.parse(read(resolve(repoRoot, 'apps/api/package.json'))) as { scripts: Record<string, string> }

    expect(source).toContain('KAEL_EVAL_MODE')
    expect(source).toContain('deterministic')
    expect(source).toContain('live')
    expect(source).toContain('serviceAccuracy')
    expect(source).toContain('complexityAccuracy')
    expect(source).toContain('priceBandHitRate')
    expect(source).toContain('declinePrecision')
    expect(source).toContain('declineRecall')
    expect(source).toContain('B6 Knowledge Retrieval A/B')
    expect(source).toContain('KAEL_EVAL_KNOWLEDGE_FIXTURE_PATH')
    expect(source).toContain('safetyMentionRate')
    expect(source).toContain('legalBoundaryRate')
    expect(source).toContain('docs/test-logs')
    expect(source).toContain('KAEL_EVAL_MOBILE_API_URL')
    expect(source).toContain('KAEL_EVAL_BEARER_TOKEN')
    expect(source).toContain('KAEL_EVAL_RUN_LIVE')
    expect(source).toContain('assertProductionOrLocalUrl')
    expect(source).toContain('AbortController')
    expect(source).toContain("hvac: {")
    expect(source).toContain("upholstery: {")
    expect(source).toContain("handyman: {")
    expect(pkg.scripts['kael:eval']).toBe('node scripts/kael-eval.mjs')
  })
})
