export type QueryResult =
  | { data: unknown; error: { code?: string; message?: string } | null; count?: number | null }
  | { reject: unknown }
export type QueryCall = { table: string; operations: unknown[][] }

export function makeSequenceClient(
  results: QueryResult[],
  rpcResults: Record<string, QueryResult[]> = {},
  tableResults: Record<string, QueryResult[]> = {},
) {
  const calls: QueryCall[] = []
  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, operations: [] }
      calls.push(call)
      const override = tableResults[table]?.shift()
      if (override) {
        return makeQuery(call, [override])
      }
      if (table === 'worker_service_quality_status') {
        return makeQuery(call, [{ data: [], error: null }])
      }
      return makeQuery(call, results)
    },
    rpc(name: string, args?: Record<string, unknown>) {
      const override = rpcResults[name]?.shift()
      if (override) {
        const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
        calls.push(call)
        return makeQuery(call, [override])
      }
      // S4 (§38): the AI-spend gate reads/writes its own ledger via these RPCs,
      // orthogonal to the .from() result sequence. Return a valid reservation so
      // test callers exercise the durable fail-closed contract without consuming
      // sequenced query results. Other RPC names still draw from the sequence.
      if (
        name === 'reserve_kael_ai_spend' || name === 'finalize_kael_ai_spend' ||
        name === 'check_kael_ai_spend' || name === 'record_kael_ai_spend'
      ) {
        return Promise.resolve({
          data: name === 'reserve_kael_ai_spend'
            ? [{ allowed: true, blocked_scope: null, reservation_id: 1 }]
            : null,
          error: null,
        })
      }
      if (
        name === 'reserve_harness_idempotency' ||
        name === 'start_harness_idempotency_execution' ||
        name === 'complete_harness_idempotency' ||
        name === 'fail_harness_idempotency' ||
        name === 'mark_harness_idempotency_reconcile_required' ||
        name === 'acquire_harness_dependency_permit' ||
        name === 'record_harness_dependency_result'
      ) {
        return Promise.resolve({
          data: name === 'reserve_harness_idempotency'
            ? [{ state: 'reserved', reservation_id: '550e8400-e29b-41d4-a716-446655440000', response_hash: null }]
            : name === 'acquire_harness_dependency_permit'
            ? [{ allowed: true, state: 'closed', retry_after_ms: 0, probe_token: null }]
            : name === 'record_harness_dependency_result'
            ? 'closed'
            : true,
          error: null,
        })
      }
      if (name === 'consume_job_media_uploads') {
        const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
        calls.push(call)
        const objectPaths = Array.isArray(args?.p_object_paths) ? args.p_object_paths : []
        return Promise.resolve({
          data: [{ consumed_count: new Set(objectPaths).size, ok: true, reason: null }],
          error: null,
        })
      }
      if (name === 'get_worker_current_commission_tier') {
        const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
        calls.push(call)
        return Promise.resolve({
          data: [{ commission_level: 1, commission_rate_bps: 1500 }],
          error: null,
        })
      }
      if (name === 'claim_job_broadcast_retry_atomic' || name === 'release_job_broadcast_retry_claim_atomic') {
        const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
        calls.push(call)
        return Promise.resolve({
          data: name === 'claim_job_broadcast_retry_atomic'
            ? [{ claimed: true, error_code: null }]
            : [{ released: true }],
          error: null,
        })
      }
      const call: QueryCall = { table: `rpc:${name}`, operations: [['rpc', name, args]] }
      calls.push(call)
      return makeQuery(call, results)
    },
  }
}

export function attachDefaultJobMediaStorage<T extends object>(client: T) {
  const bytes = new Uint8Array(1234)
  bytes.set([0xff, 0xd8, 0xff, 0xe0], 0)
  bytes.set([0xff, 0xd9], bytes.length - 2)

  Object.assign(client, {
    storage: {
      from(bucket: string) {
        return {
          async download() {
            return {
              data: new Blob([bytes], { type: 'image/jpeg' }),
              error: bucket === 'job-media' ? null : { message: 'unexpected bucket' },
            }
          },
          async remove(paths: string[]) {
            return { data: paths.map((name) => ({ name })), error: null }
          },
        }
      },
    },
  })
}

function makeQuery(call: QueryCall, results: QueryResult[]) {
  const query = {
    select(columns?: string, options?: unknown) {
      call.operations.push(options === undefined ? ['select', columns] : ['select', columns, options])
      return query
    },
    insert(value: unknown) {
      call.operations.push(['insert', value])
      return query
    },
    update(value: unknown) {
      call.operations.push(['update', value])
      return query
    },
    upsert(value: unknown) {
      call.operations.push(['upsert', value])
      return query
    },
    eq(column: string, value: unknown) {
      call.operations.push(['eq', column, value])
      return query
    },
    is(column: string, value: unknown) {
      call.operations.push(['is', column, value])
      return query
    },
    neq(column: string, value: unknown) {
      call.operations.push(['neq', column, value])
      return query
    },
    gt(column: string, value: unknown) {
      call.operations.push(['gt', column, value])
      return query
    },
    gte(column: string, value: unknown) {
      call.operations.push(['gte', column, value])
      return query
    },
    lte(column: string, value: unknown) {
      call.operations.push(['lte', column, value])
      return query
    },
    in(column: string, value: unknown[]) {
      call.operations.push(['in', column, value])
      return query
    },
    contains(column: string, value: unknown[]) {
      call.operations.push(['contains', column, value])
      return query
    },
    or(filter: string) {
      call.operations.push(['or', filter])
      return query
    },
    order(column: string, options?: unknown) {
      call.operations.push(['order', column, options])
      return query
    },
    range(from: number, to: number) {
      call.operations.push(['range', from, to])
      return query
    },
    limit(count: number) {
      call.operations.push(['limit', count])
      return query
    },
    single() {
      call.operations.push(['single'])
      return query
    },
    maybeSingle() {
      call.operations.push(['maybeSingle'])
      return query
    },
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      if (isKaelProgressUpdate(call)) {
        return Promise.resolve({ data: { id: 'kael-progress-ok' }, error: null }).then(onfulfilled, onrejected)
      }
      const next = results.shift() ?? { data: null, error: null }
      if ('reject' in next) {
        return Promise.reject(next.reject).then(onfulfilled, onrejected)
      }
      return Promise.resolve(next).then(onfulfilled, onrejected)
    },
  }
  return query
}

function isKaelProgressUpdate(call: QueryCall) {
  return call.operations.some((op) => {
    const value = op[1] as { kael_progress?: unknown } | undefined
    return op[0] === 'update' && value?.kael_progress !== undefined
  })
}
