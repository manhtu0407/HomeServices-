import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const HOOK_SOURCE = readFileSync(
  resolve(__dirname, '../../../../../.claude/hooks/verify-frontend-gates.mjs'),
  'utf-8',
)

describe('frontend Stop hook guardrails', () => {
  it('does not let stop_hook_active bypass red frontend gates', () => {
    expect(HOOK_SOURCE).toContain('stop_hook_active')
    expect(HOOK_SOURCE).not.toContain('if (input.stop_hook_active)')
    expect(HOOK_SOURCE).not.toContain('stop_hook_active) allowStop')
  })

  it('treats mobile config and package metadata changes as gate-relevant', () => {
    expect(HOOK_SOURCE).toContain('MOBILE_GATE_PATH_PATTERN')
    expect(HOOK_SOURCE).toContain('package\\.json')
    expect(HOOK_SOURCE).toContain('tsconfig')
    expect(HOOK_SOURCE).toContain('eslint\\.config')
    expect(HOOK_SOURCE).toContain('app\\.json')
    expect(HOOK_SOURCE).toContain('eas\\.json')
  })
})
