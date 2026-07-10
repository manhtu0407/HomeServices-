import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflowPath = new URL(
  '../../../../../.github/workflows/integration.yml',
  import.meta.url,
)

describe('staging integration workflow', () => {
  it('targets the real API workspace and fails before tests when a staging secret is absent', () => {
    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('pnpm --filter @nestscout/api exec vitest run src/__tests__/integration')
    expect(workflow).not.toContain('@home-services/api')
    expect(workflow).toContain('test -n "$NEXT_PUBLIC_SUPABASE_URL"')
    expect(workflow).toContain('test -n "$SUPABASE_SERVICE_ROLE_KEY"')
    expect(workflow).toContain('test -n "$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"')
  })
})
