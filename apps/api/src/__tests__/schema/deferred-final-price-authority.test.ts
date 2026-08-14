import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(new URL(
  '../../../../../supabase/migrations/20260814103000_defer_final_price_until_bilateral_approval.sql',
  import.meta.url,
), 'utf8')
const autonomy = readFileSync(new URL(
  '../../../../../supabase/functions/mobile-api/_shared/domains/job/create/autonomy.ts',
  import.meta.url,
), 'utf8')
const broadcastStart = readFileSync(new URL(
  '../../../../../supabase/functions/mobile-api/_shared/domains/job/create/broadcast-start.ts',
  import.meta.url,
), 'utf8')
const matchingFlow = readFileSync(new URL(
  '../../../../../supabase/functions/mobile-api/_shared/domains/matching/flow.ts',
  import.meta.url,
), 'utf8')
const referenceConfirmSearch = readFileSync(new URL(
  '../../app/api/jobs/[id]/confirm-search/route.ts',
  import.meta.url,
), 'utf8')

describe('deferred final-price authority', () => {
  it('keeps the confirmed estimate ceiling separate from the payable final price', () => {
    expect(autonomy).not.toContain('const lockedFinalPrice = estimate.price_max')
    expect(broadcastStart).not.toMatch(/\.update\(\{[\s\S]*?final_price:\s*(?:lockedFinalPrice|estimate\.price_max)/)
    expect(matchingFlow).not.toMatch(/\.update\(\{[\s\S]*?final_price:\s*(?:lockedFinalPrice|confirmedPriceCap)/)
    expect(referenceConfirmSearch).toContain('final_price: null')
    expect(referenceConfirmSearch).not.toContain('final_price: confirmedPriceCap')
  })

  it('keeps matching atomic while leaving final_price unset', () => {
    expect(migration).toContain('p_final_price is distinct from v_job.kael_price_max')
    expect(migration).toContain("final_price = null")
    expect(migration).not.toContain('final_price = p_final_price')
  })

  it('allows a new payable price only from an exact bilateral scope receipt', () => {
    expect(migration).toContain('guard_bilateral_final_price_lock()')
    expect(migration).toContain('deferrable initially deferred')
    expect(migration).toContain("scope.status = 'approved_by_customer'::public.scope_change_status")
    expect(migration).toContain('scope.kael_computed_min = new.final_price')
    expect(migration).toContain('scope.kael_computed_max = new.final_price')
    expect(migration).toContain("worker_price_confirmation,confirmed")
    expect(migration).toContain('final price requires bilateral verified approval')
  })
})
