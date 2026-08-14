import { vi } from 'vitest'

// `makeSequenceClient` short-circuits the four spend RPCs to a fixed allowed reservation and does
// not record them, so it cannot be used to observe spend accounting. This double keeps real state
// instead: reservations accumulate against a cap, and finalisation replaces the estimate with the
// actual, which is what makes over-reservation and double-charging visible.

export type LedgerRpc = ReturnType<typeof vi.fn> &
  ((fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>)

// Structurally a SpendGateClient, so it can be passed straight to reserveAiSpend/finalizeAiSpend
// without a cast at every call site.
export type LedgerClient = {
  rpc: LedgerRpc
  getTotal: () => number
  reservationCount: () => number
}

export function makeLedgerClient(capUsd: number): LedgerClient {
  const rows = new Map<number, number>()
  let nextId = 1
  const sum = () => [...rows.values()].reduce((total, value) => total + value, 0)

  const rpc = vi.fn(async (fn: string, args: Record<string, unknown> = {}) => {
    if (fn === 'reserve_kael_ai_spend') {
      const estimated = Number(args.p_estimated_usd ?? 0)
      if (sum() + estimated > capUsd) {
        return {
          data: [{ allowed: false, blocked_scope: 'global_daily', reservation_id: null }],
          error: null,
        }
      }
      const id = nextId++
      rows.set(id, estimated)
      return { data: [{ allowed: true, blocked_scope: null, reservation_id: id }], error: null }
    }
    if (fn === 'finalize_kael_ai_spend') {
      const id = Number(args.p_reservation_id)
      const actual = Number(args.p_actual_usd ?? 0)
      // A zero-cost outcome releases the hold rather than booking a zero row, so a failed attempt
      // does not permanently consume headroom.
      if (actual <= 0) rows.delete(id)
      else rows.set(id, actual)
      return { data: null, error: null }
    }
    if (fn === 'record_kael_ai_spend') {
      rows.set(nextId++, Number(args.p_cost_usd ?? 0))
      return { data: null, error: null }
    }
    return { data: null, error: null }
  })

  return { rpc: rpc as LedgerRpc, getTotal: sum, reservationCount: () => rows.size }
}
