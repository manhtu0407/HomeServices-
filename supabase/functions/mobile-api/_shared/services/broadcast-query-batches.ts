// Bounds worker-id PostgREST filters used by matching. Large `in(...)` lists
// otherwise overflow proxy/request-line limits after candidate pagination.

import {
  dbQuery,
  type DbClient,
  type DbResult,
  type QueryLike,
} from './db.ts'

const WORKER_ID_FILTER_BATCH_SIZE = 100

async function loadRowsInWorkerIdBatches(
  workerIds: string[],
  buildQuery: (workerIdBatch: string[]) => QueryLike,
): Promise<DbResult<Array<Record<string, unknown>>>> {
  const rows: Array<Record<string, unknown>> = []
  for (let offset = 0; offset < workerIds.length; offset += WORKER_ID_FILTER_BATCH_SIZE) {
    const workerIdBatch = workerIds.slice(offset, offset + WORKER_ID_FILTER_BATCH_SIZE)
    const result = await dbQuery<Array<Record<string, unknown>>>(buildQuery(workerIdBatch))
    if (result.error) return { data: null, error: result.error }
    rows.push(...(result.data ?? []))
  }
  return { data: rows, error: null }
}

export function loadActiveJobRowsByWorker(
  client: DbClient,
  workerIds: string[],
  activeStatuses: readonly string[],
) {
  return loadRowsInWorkerIdBatches(workerIds, (workerIdBatch) =>
    client
      .from('jobs')
      .select('worker_id')
      .in('worker_id', workerIdBatch)
      .in('status', [...activeStatuses])
      .limit(workerIdBatch.length)
  )
}

export function loadActiveReservationRowsByWorker(
  client: DbClient,
  workerIds: string[],
  nowIso: string,
) {
  return loadRowsInWorkerIdBatches(workerIds, (workerIdBatch) =>
    client
      .from('job_worker_candidates')
      .select('worker_id')
      .in('worker_id', workerIdBatch)
      .eq('status', 'proposed')
      .gt('expires_at', nowIso)
      .limit(workerIdBatch.length)
  )
}

export function loadWorkerMemoryRowsByWorker(
  client: DbClient,
  workerIds: string[],
) {
  return loadRowsInWorkerIdBatches(workerIds, (workerIdBatch) =>
    client
      .from('worker_kael_memory')
      .select('worker_id, red_flags')
      .in('worker_id', workerIdBatch)
      .limit(workerIdBatch.length)
  )
}
