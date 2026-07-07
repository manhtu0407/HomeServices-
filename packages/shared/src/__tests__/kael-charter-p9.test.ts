import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const CHARTER_ROOT = resolve(__dirname, '../../kael/charter')

function readCharter(file: string) {
  return readFileSync(resolve(CHARTER_ROOT, file), 'utf-8')
}

describe('Kael P9 charter source files', () => {
  it('fills all charter files with P9 frontmatter and governance status', () => {
    for (const file of [
      'identity.md',
      'persona.md',
      'mission-values.md',
      'language-rules.md',
      'style-guidelines.md',
    ]) {
      const text = readCharter(file)
      expect(text).toContain('charter_version: 2026-07-06.p9')
      expect(text).toContain('last_modified: 2026-07-06')
    }
    expect(readCharter('tone-matrix.yaml')).toContain('charter_version: "2026-07-06.p9"')
    expect(readCharter('version.json')).toContain('"charter_version": "2026-07-06.p9"')
  })

  it('locks identity, persona, and mission-values to Tu approval', () => {
    for (const file of ['identity.md', 'persona.md', 'mission-values.md']) {
      const text = readCharter(file)
      expect(text).toContain('status: LOCKED')
      expect(text).toContain('Tu approval required')
      expect(text).not.toContain('P1 skeleton')
    }
  })

  it('states Kael identity and boundaries in Vietnamese', () => {
    const identity = readCharter('identity.md')

    expect(identity).toContain('Kael là trợ lý AI của NestScout')
    expect(identity).toContain('sửa điện')
    expect(identity).toContain('sửa nước')
    expect(identity).toContain('dọn dẹp')
    expect(identity).toContain('KHÔNG phải chatbot tổng quát')
  })

  it('covers all 12 purposes and actor tone rows', () => {
    const matrix = readCharter('tone-matrix.yaml')
    for (const purpose of [
      'intent_classification',
      'vision_analysis',
      'clarification',
      'problem_synthesis',
      'market_lookup',
      'price_synthesis',
      'advisory_generation',
      'worker_brief',
      'worker_assist',
      'scope_change',
      'post_job_learning',
      'educational_response',
    ]) {
      expect(matrix).toContain(`purpose: "${purpose}"`)
    }
    for (const actor of ['customer', 'worker', 'admin', 'system']) {
      expect(matrix).toContain(`actor: "${actor}"`)
    }
  })

  it('ships forbidden language buckets from Plan P8', () => {
    const parsed = JSON.parse(readCharter('forbidden-language.json')) as {
      charter_version: string
      forbidden_phrases: Record<string, string[]>
      forbidden_patterns: string[]
    }

    expect(parsed.charter_version).toBe('2026-07-06.p9')
    expect(parsed.forbidden_phrases.fear_language).toContain('nguy hiem chet nguoi')
    expect(parsed.forbidden_phrases.ai_self_reference).toContain('As an AI')
    expect(parsed.forbidden_phrases.accusatory_in_dispute).toContain('Ban dang lua Kael')
    expect(parsed.forbidden_patterns).toContain('\\b\\d{1,3}(?:[.,]\\d{3})*\\s*(?:VND|d|dong)\\b')
  })
})
