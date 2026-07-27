import { describe, expect, it } from 'vitest'
import { mapConfirmKaelChatError } from '../../../../../supabase/functions/mobile-api/_shared/services/_shared'

function captureConfirmFailure(errorCode: string | null) {
  try {
    mapConfirmKaelChatError(errorCode)
  } catch (error) {
    return error
  }
}

describe('Kael confirmation error mapping', () => {
  it.each([
    ['INVALID_STATUS', 'INVALID_STATUS'],
    ['ALREADY_CONFIRMED', 'ALREADY_CONFIRMED'],
    ['MISSING_ESTIMATE', 'MISSING_ESTIMATE'],
    ['MISSING_SCOPE', 'MISSING_SCOPE'],
  ])('preserves the RPC reason %s for the client', (rpcCode, responseCode) => {
    expect(captureConfirmFailure(rpcCode)).toMatchObject({
      code: responseCode,
      status: 409,
    })
  })
})
