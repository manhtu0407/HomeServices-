import { confirmationOperationReceiptSchema, type ConfirmationOperationReceipt } from '@nestscout/shared'
import { z } from 'zod'

import type { ApiResult } from '../api'
import type {
  ConfirmationOperationResponse,
  ConfirmKaelChatResponse,
  KaelChatResponse,
} from '../api-types'
import { kaelChatService } from '../services'
import type { PendingConfirmationRecovery } from './confirmation-recovery'

type ConfirmationFailure = Extract<ApiResult<never>, { success: false }>
const recoveredJobIdSchema = z.string().uuid()

type ConfirmationRecoveryTransport = {
  confirm: (
    sessionId: string,
    input: NonNullable<PendingConfirmationRecovery['confirmInput']>,
    accessToken: string | undefined,
    idempotencyKey: string,
  ) => Promise<ApiResult<ConfirmKaelChatResponse>>
  getOperation: (
    sessionId: string,
    accessToken?: string,
  ) => Promise<ApiResult<ConfirmationOperationResponse>>
  getSession: (
    sessionId: string,
    accessToken?: string,
  ) => Promise<ApiResult<KaelChatResponse>>
}

export type ConfirmationReconciliationOutcome =
  | { kind: 'receipt'; receipt: ConfirmationOperationReceipt }
  | { kind: 'job'; jobId: string }
  | { kind: 'pending'; supportCode: string | null }
  | { failure: ConfirmationFailure; kind: 'failure' }

const defaultTransport: ConfirmationRecoveryTransport = {
  confirm: (sessionId, input, accessToken, idempotencyKey) => (
    kaelChatService.confirm(sessionId, input, accessToken, idempotencyKey)
  ),
  getOperation: (sessionId, accessToken) => (
    kaelChatService.getConfirmationOperation(sessionId, accessToken)
  ),
  getSession: (sessionId, accessToken) => kaelChatService.get(sessionId, accessToken),
}

export async function reconcilePendingConfirmationRequest(
  pending: PendingConfirmationRecovery,
  accessToken?: string,
  transport: ConfirmationRecoveryTransport = defaultTransport,
  isCurrent: () => boolean = () => true,
): Promise<ConfirmationReconciliationOutcome> {
  const unknown = (): ConfirmationReconciliationOutcome => ({ kind: 'pending', supportCode: pending.supportCode })
  const acceptReceipt = (value: unknown): ConfirmationReconciliationOutcome => {
    const parsed = confirmationOperationReceiptSchema.safeParse(value)
    const prior = pending.operation
    if (!parsed.success || parsed.data.session_id !== pending.sessionId || (prior && (
      prior.operation_id !== parsed.data.operation_id || prior.idempotency_key !== parsed.data.idempotency_key
      || (prior.job_id && prior.job_id !== parsed.data.job_id)
    ))) return unknown()
    return { kind: 'receipt', receipt: parsed.data }
  }
  if (!isCurrent()) return unknown()
  const operation = await transport.getOperation(pending.sessionId, accessToken)
  if (!isCurrent()) return unknown()
  if (operation.success) return acceptReceipt(operation.data.operation)
  if (operation.status !== 404) {
    return {
      kind: 'pending',
      supportCode: operation.meta?.supportCode ?? pending.supportCode,
    }
  }

  const session = await transport.getSession(pending.sessionId, accessToken)
  if (!isCurrent()) return unknown()
  if (!session.success) {
    if (isAmbiguousConfirmationFailure(session)) {
      return {
        kind: 'pending',
        supportCode: session.meta?.supportCode ?? pending.supportCode,
      }
    }
    return { failure: session, kind: 'failure' }
  }
  if (session.data.session.id !== pending.sessionId) return unknown()
  if (session.data.session.confirmation_operation) {
    return acceptReceipt(session.data.session.confirmation_operation)
  }
  if (session.data.session.status === 'confirmed' && session.data.session.job_id) {
    const jobId = recoveredJobIdSchema.safeParse(session.data.session.job_id)
    if (!jobId.success || (pending.operation?.job_id && pending.operation.job_id !== jobId.data)) return unknown()
    return { kind: 'job', jobId: jobId.data }
  }
  if (!pending.confirmInput) {
    return { kind: 'pending', supportCode: pending.supportCode }
  }

  const replay = await transport.confirm(
    pending.sessionId,
    pending.confirmInput,
    accessToken,
    pending.idempotencyKey,
  )
  if (!isCurrent()) return unknown()
  if (!replay.success) {
    if (isAmbiguousConfirmationFailure(replay)) {
      return {
        kind: 'pending',
        supportCode: replay.meta?.supportCode ?? pending.supportCode,
      }
    }
    return { failure: replay, kind: 'failure' }
  }
  if (replay.data.session_id !== pending.sessionId) return unknown()
  if (replay.data.operation) {
    if (replay.data.operation.job_id !== replay.data.job_id) return unknown()
    return acceptReceipt(replay.data.operation)
  }
  if (replay.data.job_id) return { jobId: replay.data.job_id, kind: 'job' }
  return { kind: 'pending', supportCode: replay.meta?.supportCode ?? pending.supportCode }
}

export function isAmbiguousConfirmationFailure(result: { code?: string; status?: number }) {
  return result.status === 0
    || result.status === 401
    || result.status === 403
    || result.status === 408
    || result.status === 425
    || result.status === 429
    || (typeof result.status === 'number' && result.status >= 500)
    || result.code === 'TIMEOUT'
    || result.code === 'NETWORK_ERROR'
    || result.code === 'INVALID_RESPONSE'
    || result.code === 'RESPONSE_TOO_LARGE'
    || result.code === 'IDEMPOTENCY_RECONCILE_REQUIRED'
    || result.code === 'ALREADY_CONFIRMED'
}
