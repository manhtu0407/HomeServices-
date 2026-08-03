import { describe, expect, it } from 'vitest'

import { notifyBroadcastWorkers } from '../../../../../supabase/functions/mobile-api/_shared/domains/notification/notifications'

describe('broadcast worker notifications', () => {
  it('starts independent push-token reads together after durable notification inserts', async () => {
    const startedWorkers: string[] = []
    const resolvers = new Map<string, (value: { data: unknown[]; error: null }) => void>()
    const client = {
      rpc: () => Promise.resolve({ data: [{ notification_id: 'notification-1' }], error: null }),
      from: () => {
        let workerId = ''
        const chain: Record<string, unknown> = {}
        const returnChain = () => chain
        Object.assign(chain, {
          select: returnChain,
          eq: returnChain,
          in: (_column: string, values: string[]) => {
            workerId = values[0] ?? ''
            return chain
          },
          then: (onFulfilled: (value: { data: unknown[]; error: null }) => unknown) => {
            startedWorkers.push(workerId)
            return new Promise<{ data: unknown[]; error: null }>((resolve) => {
              resolvers.set(workerId, resolve)
            }).then(onFulfilled)
          },
        })
        return chain
      },
    }

    const pending = notifyBroadcastWorkers(
      client as never,
      'job-1',
      'plumbing',
      'q1',
      '2026-07-19T00:01:00.000Z',
      [
        { workerId: 'worker-1', broadcastId: 'broadcast-1' },
        { workerId: 'worker-2', broadcastId: 'broadcast-2' },
      ],
    )
    for (let attempt = 0; attempt < 20 && startedWorkers.length === 0; attempt += 1) {
      await Promise.resolve()
    }

    const workersStartedBeforeAnyPushReadFinished = [...startedWorkers]
    resolvers.get('worker-1')?.({ data: [], error: null })
    for (let attempt = 0; attempt < 20 && startedWorkers.length < 2; attempt += 1) {
      await Promise.resolve()
    }
    resolvers.get('worker-2')?.({ data: [], error: null })
    await pending

    expect(workersStartedBeforeAnyPushReadFinished).toEqual(['worker-1', 'worker-2'])
  })
})
