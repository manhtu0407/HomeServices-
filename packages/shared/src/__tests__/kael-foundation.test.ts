import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import {
  KAEL_ACTIONS,
  KAEL_PERMISSION_MATRIX_VERSION,
  KAEL_PERMISSION_RULES,
  KAEL_PURPOSES,
  KAEL_TOPICS,
  type PermissionRule,
} from '../../kael/permissions'

const SHARED_ROOT = resolve(__dirname, '../..')
const CHARTER_ROOT = resolve(SHARED_ROOT, 'kael/charter')

const readCharter = (file: string) =>
  readFileSync(resolve(CHARTER_ROOT, file), 'utf-8')

describe('Kael foundation charter and permissions', () => {
  const charterFiles = [
    'identity.md',
    'persona.md',
    'mission-values.md',
    'tone-matrix.yaml',
    'language-rules.md',
    'forbidden-language.json',
    'style-guidelines.md',
    'version.json',
  ]

  it.each(charterFiles)('ships charter file %s with version metadata', (file) => {
    expect(existsSync(resolve(CHARTER_ROOT, file))).toBe(true)
    expect(readCharter(file)).toContain('2026-05-25.p8')
  })

  it('keeps locked charter files explicit', () => {
    for (const file of ['identity.md', 'persona.md', 'mission-values.md']) {
      expect(readCharter(file)).toContain('status: LOCKED')
      expect(readCharter(file)).toContain('Tu approval required')
    }
  })

  it('defines the 11 locked Kael purposes for the future permission matrix', () => {
    expect(KAEL_PURPOSES).toEqual([
      'intent_classification',
      'vision_analysis',
      'clarification',
      'problem_synthesis',
      'market_lookup',
      'price_synthesis',
      'advisory_generation',
      'worker_brief',
      'scope_change',
      'post_job_learning',
      'educational_response',
    ])
  })

  it('keeps permission rules typed after P5 activation', () => {
    const exampleRule: PermissionRule = {
      purpose: 'educational_response',
      actor: 'customer',
      jobRelation: 'none',
      decision: 'allow',
      allowedActions: ['read_context'],
      allowedTopics: ['electrical_repair'],
      deniedTopics: ['out_of_scope_services_anything'],
      auditLevel: 'decision',
      reasonCode: 'P1_TYPE_CHECK_ONLY',
    }

    expect(KAEL_PERMISSION_MATRIX_VERSION).toBe('2026-05-25.p5')
    expect(KAEL_PERMISSION_RULES.length).toBeGreaterThan(0)
    expect(KAEL_ACTIONS).toContain(exampleRule.allowedActions[0])
    expect(KAEL_TOPICS).toContain(exampleRule.allowedTopics[0])
  })
})
