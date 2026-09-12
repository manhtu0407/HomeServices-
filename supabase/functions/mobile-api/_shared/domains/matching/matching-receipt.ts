type BroadcastRow = {
  batch_id: string | null
  broadcast_at: string | null
  expires_at: string | null
  status: string | null
}

type MatchingEventRow = {
  created_at: string | null
  event_type: string | null
  safe_metadata: unknown
}

type MatchingPreferenceRow = {
  strategy: string | null
  auto_general: boolean | null
  fallback_at: string | null
}

export type MatchingReceipt = {
  strategy: 'pending_choice' | 'general' | 'saved_worker_first'
  stage: 'awaiting_choice' | 'saved_worker_search' | 'general_search' | 'candidate_ready' | 'recovery_required' | 'exhausted' | 'stopped'
  checks: Array<{
    kind: 'service_capability' | 'service_area' | 'availability'
    state: 'pending' | 'verified'
  }>
  batch: {
    attempt: number
    recipient_count: number
    deadline_at: string | null
    seconds_remaining: number | null
    strategy: 'saved_worker' | 'general'
  } | null
  event_history: Array<{
    kind:
      | 'awaiting_customer_choice'
      | 'saved_worker_requested'
      | 'saved_worker_no_response'
      | 'saved_worker_declined'
      | 'saved_worker_unavailable'
      | 'search_expanded'
      | 'general_batch_sent'
      | 'matching_recovery_required'
      | 'no_worker_found'
      | 'candidate_ready'
      | 'search_stopped'
    occurred_at: string
    recipient_count?: number
  }>
}

export function buildMatchingReceipt(input: {
  broadcasts: BroadcastRow[]
  events: MatchingEventRow[]
  now?: Date
  operationState?: string | null
  preference: MatchingPreferenceRow | null
  status: string
}): MatchingReceipt {
  const strategy = readStrategy(input.preference?.strategy)
  const batches = groupBatches(input.broadcasts)
  const activeBatch = findActiveBatch(batches, input.now ?? new Date())
  const stage = resolveStage({
    operationState: input.operationState,
    activeBatch,
    batches,
    events: input.events,
    preference: input.preference,
    status: input.status,
    strategy,
  })
  const pendingChecks = stage === 'awaiting_choice'
  return {
    strategy,
    stage,
    checks: [
      { kind: 'service_capability', state: pendingChecks ? 'pending' : 'verified' },
      { kind: 'service_area', state: pendingChecks ? 'pending' : 'verified' },
      { kind: 'availability', state: pendingChecks ? 'pending' : 'verified' },
    ],
    batch: activeBatch
      ? receiptBatch(
        activeBatch,
        batches.findIndex((batch) => batch.batchId === activeBatch.batchId) + 1,
        strategy,
        input.preference,
        input.events,
        input.now ?? new Date(),
      )
      : null,
    event_history: publicEventHistory(input.events, batches, strategy, input.preference),
  }
}

type BroadcastBatch = {
  batchId: string
  broadcastAt: string | null
  expiresAt: string | null
  statuses: string[]
  recipientCount: number
}

function groupBatches(rows: BroadcastRow[]): BroadcastBatch[] {
  const byId = new Map<string, BroadcastBatch>()
  for (const row of rows) {
    if (!row.batch_id) continue
    const current = byId.get(row.batch_id) ?? {
      batchId: row.batch_id,
      broadcastAt: row.broadcast_at,
      expiresAt: row.expires_at,
      statuses: [],
      recipientCount: 0,
    }
    current.recipientCount += 1
    if (row.status) current.statuses.push(row.status)
    if (!current.broadcastAt || (row.broadcast_at && row.broadcast_at < current.broadcastAt)) {
      current.broadcastAt = row.broadcast_at
    }
    if (!current.expiresAt || (row.expires_at && row.expires_at > current.expiresAt)) {
      current.expiresAt = row.expires_at
    }
    byId.set(row.batch_id, current)
  }
  return [...byId.values()].sort((left, right) =>
    (left.broadcastAt ?? '').localeCompare(right.broadcastAt ?? ''))
}

function findActiveBatch(batches: BroadcastBatch[], now: Date) {
  return [...batches].reverse().find((batch) =>
    batch.statuses.some((status) => status === 'sent') &&
    (!batch.expiresAt || Date.parse(batch.expiresAt) > now.getTime())) ?? null
}

function receiptBatch(
  batch: BroadcastBatch,
  attempt: number,
  strategy: MatchingReceipt['strategy'],
  preference: MatchingPreferenceRow | null,
  events: MatchingEventRow[],
  now: Date,
): NonNullable<MatchingReceipt['batch']> {
  const deadline = batch.expiresAt ? Date.parse(batch.expiresAt) : Number.NaN
  return {
    attempt,
    recipient_count: batch.recipientCount,
    deadline_at: batch.expiresAt,
    seconds_remaining: Number.isFinite(deadline)
      ? Math.max(0, Math.ceil((deadline - now.getTime()) / 1000))
      : null,
    strategy: isSavedWorkerBatch(batch, strategy, preference, events) ? 'saved_worker' : 'general',
  }
}

function isSavedWorkerBatch(
  batch: BroadcastBatch,
  strategy: MatchingReceipt['strategy'],
  preference: MatchingPreferenceRow | null,
  events: MatchingEventRow[],
) {
  const eventStrategy = batchEventStrategy(batch.batchId, events)
  if (eventStrategy !== null) return eventStrategy === 'saved_worker'
  const fallbackAt = preference?.fallback_at ? Date.parse(preference.fallback_at) : Number.NaN
  const batchStartedAt = batch.broadcastAt ? Date.parse(batch.broadcastAt) : Number.NaN
  return strategy === 'saved_worker_first' &&
    (Number.isNaN(fallbackAt) || Number.isNaN(batchStartedAt) || batchStartedAt <= fallbackAt)
}

function resolveStage(input: {
  operationState?: string | null
  activeBatch: BroadcastBatch | null
  batches: BroadcastBatch[]
  events: MatchingEventRow[]
  preference: MatchingPreferenceRow | null
  status: string
  strategy: MatchingReceipt['strategy']
}): MatchingReceipt['stage'] {
  if (input.status === 'worker_candidate_pending') return 'candidate_ready'
  if (input.status === 'cancelled') return 'stopped'
  if (input.strategy === 'pending_choice') return 'awaiting_choice'
  if (input.operationState === 'queued') {
    return input.strategy === 'saved_worker_first' && !input.preference?.fallback_at
      ? 'saved_worker_search' : 'general_search'
  }
  if (input.operationState === 'recovery_required') return 'recovery_required'
  if (input.operationState === 'no_reachable_worker') return 'exhausted'
  if (input.operationState === 'stopped') return 'stopped'
  if (input.activeBatch) {
    return receiptBatch(input.activeBatch, input.batches.findIndex((batch) => batch.batchId === input.activeBatch?.batchId) + 1, input.strategy, input.preference, input.events, new Date()).strategy === 'saved_worker'
      ? 'saved_worker_search'
      : 'general_search'
  }
  if (hasPublicEvent(input.events, 'no_worker_found')) return 'exhausted'
  if (hasPublicEvent(input.events, 'matching_recovery_required')) return 'recovery_required'
  if (input.batches.length === 0) return 'recovery_required'
  return 'exhausted'
}

function publicEventHistory(
  events: MatchingEventRow[],
  batches: BroadcastBatch[],
  strategy: MatchingReceipt['strategy'],
  preference: MatchingPreferenceRow | null,
): MatchingReceipt['event_history'] {
  const history = events
    .flatMap((event) => {
      const publicEvent = toPublicEvent(event)
      return publicEvent ? [publicEvent] : []
    })
    .sort((left, right) => left.occurred_at.localeCompare(right.occurred_at))
  const hasSavedWorkerRequested = history.some((event) => event.kind === 'saved_worker_requested')
  const hasGeneralBatch = history.some((event) => event.kind === 'general_batch_sent')
  const hasSavedWorkerOutcome = history.some((event) =>
    event.kind === 'saved_worker_no_response' ||
    event.kind === 'saved_worker_declined' ||
    event.kind === 'saved_worker_unavailable')
  const savedWorkerBatch = batches.find((batch) => isSavedWorkerBatch(batch, strategy, preference, events))
  if (strategy === 'saved_worker_first' && !hasSavedWorkerRequested && !hasSavedWorkerOutcome && savedWorkerBatch) {
    history.unshift({
      kind: 'saved_worker_requested',
      occurred_at: savedWorkerBatch.broadcastAt ?? new Date(0).toISOString(),
      recipient_count: 1,
    })
  }
  if (strategy !== 'pending_choice' && !hasGeneralBatch && batches.length > 0) {
    const generalBatch = batches.find((batch) => !isSavedWorkerBatch(batch, strategy, preference, events))
    if (generalBatch) {
      history.push({
        kind: 'general_batch_sent',
        occurred_at: generalBatch.broadcastAt ?? new Date(0).toISOString(),
        recipient_count: generalBatch.recipientCount,
      })
    }
  }
  return history.slice(-12)
}

function toPublicEvent(event: MatchingEventRow): MatchingReceipt['event_history'][number] | null {
  const occurredAt = event.created_at
  const kind = event.event_type
  if (!occurredAt || !kind) return null
  const recipientCount = publicRecipientCount(event.safe_metadata)
  if (kind === 'matching_preference_pending') return { kind: 'awaiting_customer_choice', occurred_at: occurredAt }
  if (kind === 'matching_saved_worker_selected') return { kind: 'saved_worker_requested', occurred_at: occurredAt, recipient_count: 1 }
  if (kind === 'matching_saved_worker_expired') return { kind: 'saved_worker_no_response', occurred_at: occurredAt }
  if (kind === 'matching_saved_worker_declined') return { kind: 'saved_worker_declined', occurred_at: occurredAt }
  if (kind === 'matching_saved_worker_unavailable') return { kind: 'saved_worker_unavailable', occurred_at: occurredAt }
  if (kind === 'matching_search_expanded' || kind === 'matching_expanded') return recipientCount === null
    ? { kind: 'search_expanded', occurred_at: occurredAt }
    : { kind: 'search_expanded', occurred_at: occurredAt, recipient_count: recipientCount }
  if (kind === 'broadcast_sent' || kind === 'matching_general_selected' || kind === 'matching_general_batch_sent') return recipientCount === null
    ? { kind: 'general_batch_sent', occurred_at: occurredAt }
    : { kind: 'general_batch_sent', occurred_at: occurredAt, recipient_count: recipientCount }
  if (kind === 'matching_recovery_required') {
    return { kind: 'matching_recovery_required', occurred_at: occurredAt }
  }
  if (kind === 'no_worker_found' || kind === 'no_worker_found_after_saved_worker') {
    return { kind: 'no_worker_found', occurred_at: occurredAt }
  }
  if (kind === 'worker_accepted') return { kind: 'candidate_ready', occurred_at: occurredAt }
  if (kind === 'customer_cancelled' || kind === 'job_cancelled') return { kind: 'search_stopped', occurred_at: occurredAt }
  return null
}

function batchEventStrategy(
  batchId: string,
  events: MatchingEventRow[],
): 'saved_worker' | 'general' | null {
  for (const event of events) {
    if (batchIdFromMetadata(event.safe_metadata) !== batchId) continue
    if (event.event_type === 'matching_saved_worker_selected') return 'saved_worker'
    if (
      event.event_type === 'broadcast_sent' ||
      event.event_type === 'matching_general_selected' ||
      event.event_type === 'matching_general_batch_sent'
    ) return 'general'
  }
  return null
}

function batchIdFromMetadata(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const batchId = (value as Record<string, unknown>).batch_id
  return typeof batchId === 'string' && batchId.length > 0 && batchId.length <= 200
    ? batchId
    : null
}

function publicRecipientCount(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const count = (value as Record<string, unknown>).worker_count
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0 && count <= 5
    ? count
    : null
}

function hasPublicEvent(events: MatchingEventRow[], expected: MatchingReceipt['event_history'][number]['kind']) {
  return events.some((event) => toPublicEvent(event)?.kind === expected)
}

function readStrategy(value: string | null | undefined): MatchingReceipt['strategy'] {
  if (value === 'saved_worker_first' || value === 'general' || value === 'pending') {
    return value === 'pending' ? 'pending_choice' : value
  }
  return 'general'
}
