import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('worker service preference matching contract', () => {
  it('uses worker selections plus quality status in Edge matching and exposes a self-scoped route', () => {
    const broadcasts = [
      'supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts',
      'supabase/functions/mobile-api/_shared/domains/matching/broadcast-support.ts',
      'supabase/functions/mobile-api/_shared/domains/matching/broadcast-workers.ts',
    ].map(read).join('\n')
    const workerRoutes = read('supabase/functions/mobile-api/_shared/http/routes/worker.ts')
    const workers = read('supabase/functions/mobile-api/_shared/domains/worker/service-settings.ts')

    expect(broadcasts).toContain('selected_service_types')
    expect(broadcasts).toContain('worker_service_quality_status')
    expect(broadcasts).toContain('workerAcceptsService(worker, serviceType)')
    expect(workerRoutes).toContain('/workers/me/service-preferences')
    expect(workers).toContain('.eq("id", ctx.user.id)')
    expect(workers).toContain('selected_service_types: input.selected_service_types')
  })
})
