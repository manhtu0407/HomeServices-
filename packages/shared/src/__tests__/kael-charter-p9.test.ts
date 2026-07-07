import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const CHARTER_ROOT = resolve(__dirname, '../../kael/charter')

function readCharter(file: string) {
  return readFileSync(resolve(CHARTER_ROOT, file), 'utf-8')
}

describe('Kael P9 charter source files', () => {
  it('tracks the charter version in the version.json manifest', () => {
    const manifest = readCharter('version.json')
    expect(manifest).toContain('"charter_version": "2026-07-06.p9"')
    expect(manifest).toContain('"last_modified": "2026-07-06"')
  })

  it('records the locked charter files and lock policy in the manifest', () => {
    const manifest = JSON.parse(readCharter('version.json')) as {
      locked_files: string[]
      governance: { locked_change_policy: string }
    }
    expect(manifest.locked_files).toEqual(['identity.md', 'persona.md', 'mission-values.md'])
    expect(manifest.governance.locked_change_policy).toBe('Tu approval required')
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
      forbidden_phrases: Record<string, string[]>
      forbidden_patterns: string[]
    }

    expect(parsed.forbidden_phrases.fear_language).toContain('nguy hiem chet nguoi')
    expect(parsed.forbidden_phrases.ai_self_reference).toContain('As an AI')
    expect(parsed.forbidden_phrases.accusatory_in_dispute).toContain('Ban dang lua Kael')
    expect(parsed.forbidden_patterns).toContain('\\b\\d{1,3}(?:[.,]\\d{3})*\\s*(?:VND|d|dong)\\b')
  })
})
