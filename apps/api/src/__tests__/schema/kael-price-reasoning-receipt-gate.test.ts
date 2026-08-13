import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

describe('Kael price reasoning receipt confirmation gate', () => {
  // The receipt-bound overload is the only one callers should be able to reach.
  // Generated types are produced from the live database, so this fails if the
  // parameter is ever dropped from the deployed signature.
  it('exposes the receipt-bound confirmation parameter in the generated RPC surface', () => {
    expect(readGeneratedDatabaseTypes()).toContain('p_price_reasoning_receipt_id: string')
  })
})
