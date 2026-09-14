import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflowPath = new URL(
  '../../../../../.github/workflows/integration.yml',
  import.meta.url,
)

describe('local integration workflow', () => {
  it('targets the isolated local stack without hosted Staging secrets', () => {
    const workflow = readFileSync(workflowPath, 'utf8')

    expect(workflow).toContain('node-version: 22')
    // The flag keeps a future collection regression red instead of reporting a zero-test pass.
    expect(workflow).toContain('pnpm --filter @nestscout/api exec vitest run --passWithNoTests=false src/__tests__/integration')
    expect(workflow).not.toContain('@home-services/api')
    expect(workflow).toContain('Start isolated local Supabase')
    expect(workflow).toContain('Prepare canonical empty-reset migration workdir')
    expect(workflow).toContain('scripts/harness/prepare-migration-workdir.mjs')
    expect(workflow).toContain('--empty-reset')
    expect(workflow).toContain('--workdir .scratch/integration-migrations')
    expect(workflow).toContain('Replay migrations from empty state')
    expect(workflow).toContain('NESTSCOUT_ENVIRONMENT: local')
    expect(workflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.')
    expect(workflow).not.toContain('xyylanuyflrjzbjzhqfl')
  })
})
