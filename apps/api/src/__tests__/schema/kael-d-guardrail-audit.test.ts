import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = join(process.cwd(), '../..')

function read(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('Kael Track D guardrail observability wiring', () => {
  // Catches a table rename that updates the migration but leaves the Edge
  // writer pointing at the old name.
  it('writes guardrail trips from the Edge self-check path', () => {
    const selfCheck = read('supabase/functions/mobile-api/_shared/kael/kael-guardrails/self-check.ts')

    expect(selfCheck).toContain('kael_guardrail_trip_audit')
  })
})
