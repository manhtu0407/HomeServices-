import { describe, expect, it } from 'vitest'
import {
  loadActiveJobRowsByWorker,
  loadActiveReservationRowsByWorker,
  loadWorkerAvailabilityRows,
  loadWorkerMemoryRowsByWorker,
} from '../../../../../supabase/functions/mobile-api/_shared/services/broadcast-query-batches'

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

  it('starts independent availability reads together instead of stacking staging latency', async () => {
    const startedTables: string[] = []
    const resolvers = new Map<string, (value: { data: unknown[]; error: null }) => void>()
    const client = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {}
        const returnChain = () => chain
        Object.assign(chain, {
          select: returnChain,
          eq: returnChain,
          gt: returnChain,
          limit: returnChain,
          in: returnChain,
          then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown) => {
            startedTables.push(table)
            return new Promise<{ data: unknown[]; error: null }>((resolve) => {
              resolvers.set(table, resolve)
            }).then(onFulfilled)
          },
        })
        return chain
      },
    }

    const pending = loadWorkerAvailabilityRows(
      client as never,
      ['worker-1'],
      ['worker_matched'],
      '2026-07-19T00:00:00.000Z',
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(startedTables).toEqual(['jobs', 'job_worker_candidates', 'worker_kael_memory'])
    for (const resolve of resolvers.values()) resolve({ data: [], error: null })
    await expect(pending).resolves.toHaveLength(3)
  })
})
