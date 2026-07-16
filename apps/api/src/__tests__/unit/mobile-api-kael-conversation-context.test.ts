import { describe, expect, it } from 'vitest'

import { buildKaelConversationContext } from '../../../../../supabase/functions/mobile-api/_shared/services/kael-chat-case-work'
import type { DbClient, DbResult } from '../../../../../supabase/functions/mobile-api/_shared/services/db'

describe('Kael conversation-context persistence boundary', () => {
  it('fails closed when turn history cannot be read', async () => {
    const client = makeClient({
      data: null,
      error: { code: 'TURN_HISTORY_READ_FAILED' },
    })

    await expect(buildKaelConversationContext(client, 'session-1')).rejects.toMatchObject({
      code: 'DB_ERROR',
      status: 500,
    })
  })

  it('builds context only from successfully loaded turns', async () => {
    const client = makeClient({
      data: [
        { turn_index: 1, role: 'customer', content_type: 'message', text_content: 'Vòi nước bị rỉ.' },
        { turn_index: 2, role: 'kael', content_type: 'clarification', text_content: 'Nước rỉ liên tục không?' },
      ],
      error: null,
    })

    await expect(buildKaelConversationContext(client, 'session-1')).resolves.toMatchObject({
      clarificationCount: 1,
      context: expect.stringContaining('Vòi nước bị rỉ.'),
    })
  })
})

function makeClient(result: DbResult<unknown>): DbClient {
  const query = {
    select: () => query,
    insert: () => query,
    delete: () => query,
    update: () => query,
    upsert: () => query,
    eq: () => query,
    neq: () => query,
    gt: () => query,
    gte: () => query,
    lte: () => query,
    is: () => query,
    in: () => query,
    contains: () => query,
    or: () => query,
    order: () => query,
    range: () => query,
    limit: () => query,
    single: () => query,
    maybeSingle: () => query,
    then: <TResult1 = DbResult<unknown>, TResult2 = never>(
      onfulfilled?: ((value: DbResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) => Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return {
    from: () => query,
    rpc: () => query,
  }
}
