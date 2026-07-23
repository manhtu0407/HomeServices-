import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(__dirname, '../../../../..')
const read = (path: string) => readFileSync(resolve(repoRoot, path), 'utf8')

describe('worker service preference schema and matching contract', () => {
  it('stores worker selections and derives a temporary service-specific quality lock', () => {
    const migration = read('supabase/migrations/20260723143000_worker_service_selection_quality_gate.sql')

    expect(migration).toContain('selected_service_types public.service_type[]')
    expect(migration).toContain('public.worker_service_quality_status')
    expect(migration).toContain('count(*) >= 3')
    expect(migration).toContain('avg(r.rating) < 4')
    expect(migration).toContain("interval '14 days'")
    expect(migration).toContain('v_worker.selected_service_types')
    expect(migration).toContain('quality.is_locked')
    expect(migration).toContain('grant execute on function public.accept_broadcast_atomic(uuid, uuid) to service_role')
  })

  it('uses worker selections plus quality status in Edge matching and exposes a self-scoped route', () => {
    const broadcasts = read('supabase/functions/mobile-api/_shared/services/broadcasts.service.ts')
    const routes = read('supabase/functions/mobile-api/_shared/router/routes.ts')
    const workers = read('supabase/functions/mobile-api/_shared/services/workers.service.ts')

    expect(broadcasts).toContain('selected_service_types')
    expect(broadcasts).toContain('worker_service_quality_status')
    expect(broadcasts).toContain('workerAcceptsService(worker, serviceType)')
    expect(routes).toContain('/workers/me/service-preferences')
    expect(workers).toContain('.eq("id", ctx.user.id)')
    expect(workers).toContain('selected_service_types: input.selected_service_types')
  })
})
