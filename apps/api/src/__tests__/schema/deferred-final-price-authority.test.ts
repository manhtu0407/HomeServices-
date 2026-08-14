import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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
})
