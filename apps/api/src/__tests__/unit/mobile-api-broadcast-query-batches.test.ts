import { describe, expect, it } from 'vitest'
import {
  loadActiveJobRowsByWorker,
  loadActiveReservationRowsByWorker,
  loadWorkerMemoryRowsByWorker,
} from '../../../../../supabase/functions/mobile-api/_shared/services/matching/query-batches'

function makeClient() {
  const workerIdBatches: string[][] = []
  const client = {
    from: () => {
      const chain: Record<string, unknown> = {}
      const returnChain = () => chain
      Object.assign(chain, {
        select: returnChain,
        eq: returnChain,
        gt: returnChain,
        limit: returnChain,
        in: (column: string, values: string[]) => {
          if (column === 'worker_id') workerIdBatches.push(values)
          return chain
        },
        then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(onFulfilled),
      })
      return chain
    },
  }
  return { client: client as never, workerIdBatches }
}

describe('broadcast worker-id query batches', () => {
  it('bounds every PostgREST in-filter to 100 worker ids', async () => {
    const workerIds = Array.from({ length: 250 }, (_, index) => `worker-${index}`)
    const { client, workerIdBatches } = makeClient()

    await loadActiveJobRowsByWorker(client, workerIds, ['worker_matched'])
    await loadActiveReservationRowsByWorker(client, workerIds, '2026-07-14T00:00:00.000Z')
    await loadWorkerMemoryRowsByWorker(client, workerIds)

    expect(workerIdBatches.map((batch) => batch.length)).toEqual([
      100, 100, 50,
      100, 100, 50,
      100, 100, 50,
    ])
    expect(workerIdBatches.every((batch) => batch.length <= 100)).toBe(true)
  })
})
