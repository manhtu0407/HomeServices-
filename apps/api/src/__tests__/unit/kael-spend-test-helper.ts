import type { KaelSpendGate } from '../../../../../supabase/functions/mobile-api/_shared/kael/spend-gate'

export function allowKaelSpendForTest(actorId = 'test-actor'): KaelSpendGate {
  let reservationId = 0
  return {
    actorId,
    client: {
      rpc: async (fn) => ({
        data: fn === 'reserve_kael_ai_spend'
          ? [{
            allowed: true,
            blocked_scope: null,
            reservation_id: ++reservationId,
          }]
          : null,
        error: null,
      }),
    },
  }
}
