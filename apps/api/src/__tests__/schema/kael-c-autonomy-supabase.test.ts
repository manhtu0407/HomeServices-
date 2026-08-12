import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(process.cwd(), '../..')

function read(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('Kael Track C autonomy gate contract', () => {
  it('routes narrow autonomy escalations through the existing admin queue vocabulary', () => {
    const gate = read('supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate.ts')

    expect(gate).toContain('queue_type: "autonomy_escalation"')
    expect(gate).toContain('HIGH_STAKES_LOW_CONFIDENCE')
  })

  it('keeps full LLM-proposed autonomy behind the production-off flag', () => {
    const gate = read('supabase/functions/mobile-api/_shared/kael/kael-guardrails/autonomy-gate.ts')

    expect(gate).toContain('KAEL_AUTONOMY_FULL_ENABLED')
    expect(gate).toContain('AUTONOMY_FULL_FLAG_OFF')
    expect(gate).toContain('source === "llm_proposed"')
  })
})
