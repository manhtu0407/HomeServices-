import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { AppState } from 'react-native'
import { rfqPriceProposalInputSchema, type RfqPriceStatus } from '@nestscout/shared'
import { generateClientRequestId } from '../client-request-id'
import { createClientDiagnosticMetadata } from '../api'
import { rfqPriceService, type RfqCommand, type RfqIdentity } from '../services/rfq-price'
import { readRfqCommand, writeRfqCommand } from './rfq-price-recovery'
import { localizeWorkflowError } from './errors'
import type { AppLanguage } from '../app-language'

type Input = RfqIdentity & { token: string; language: AppLanguage; onChanged: () => unknown }
type State = { loaded: boolean; busy: boolean; pending: boolean; snapshot: RfqPriceStatus | null; error: string | null }
const EMPTY: State = { loaded: false, busy: false, pending: false, snapshot: null, error: null }
const REJECTED_CODES = new Set(['RFQ_PRICE_NOT_FOUND', 'RFQ_PRICE_STATE_CHANGED', 'RFQ_PRICE_PENDING',
  'RFQ_PRICE_INVALID_INPUT', 'RFQ_PRICE_REQUEST_CONFLICT', 'RFQ_PRICE_DECISION_CONFLICT', 'VALIDATION', 'AUTH_FORBIDDEN'])

export function useRfqPrice({ jobId, ownerId, role, token, language, onChanged }: Input) {
  // Old callbacks cannot acquire a new account's credentials or cross job boundaries.
  const session = useMemo(() => ({ active: false, running: false, notified: '' }), [jobId, ownerId, role, token])
  const identity = useMemo(() => ({ jobId, ownerId, role }), [jobId, ownerId, role])
  const [stored, setStored] = useState<{ session: typeof session; value: State }>({ session, value: EMPTY })
  const state = stored.session === session ? stored.value : EMPTY
  const changed = useEffectEvent(onChanged)
  const patch = useCallback((value: Partial<State>) => {
    if (session.active) setStored(old => ({ session, value: { ...(old.session === session ? old.value : EMPTY), ...value } }))
  }, [session])
  const report = useCallback((code: string, meta = createClientDiagnosticMetadata()) => {
    patch({ error: localizeWorkflowError({ success: false, error: '', code, status: 0, meta }, language) })
  }, [language, patch])

  const run = useCallback(async (requested?: RfqCommand) => {
    if (!session.active || session.running || !token) return
    session.running = true
    const current = () => session.active
    patch({ busy: true, error: null })
    try {
      const saved = await readRfqCommand(identity)
      if (!current()) return
      if (requested && saved) { patch({ pending: true }); report('RFQ_PRICE_OUTCOME_UNKNOWN'); return }
      const command = saved ?? requested
      if (command) {
        if (requested && !await writeRfqCommand(identity, requested, current)) return
        if (!current()) return
        patch({ pending: true })
        const result = await rfqPriceService.execute(command, token)
        if (!current()) return
        if (!result.success) {
          if (REJECTED_CODES.has(result.code)) {
            if (!await writeRfqCommand(identity, null, current, command)) return
            patch({ pending: false, loaded: false })
            report(result.code, result.meta)
          } else report('RFQ_PRICE_OUTCOME_UNKNOWN', result.meta)
          return
        }
        if (!await writeRfqCommand(identity, null, current, command) || !current()) return
        patch({ loaded: true, pending: false, snapshot: { job_id: jobId, quote_mode: result.data.quote_mode, proposal: result.data } })
        if (result.data.status === 'approved' && session.notified !== result.data.id) {
          session.notified = result.data.id
          void changed()
        }
        return
      }
      const result = await rfqPriceService.load(identity, token)
      if (!current()) return
      if (!result.success) { patch({ loaded: false }); report('RFQ_PRICE_READ_UNAVAILABLE', result.meta); return }
      patch({ loaded: true, pending: false, snapshot: result.data })
      if (result.data.proposal?.status === 'approved' && session.notified !== result.data.proposal.id) {
        session.notified = result.data.proposal.id
        void changed()
      }
    } catch {
      if (current()) { patch({ loaded: false }); report('RFQ_PRICE_STORAGE_UNAVAILABLE') }
    } finally {
      session.running = false
      patch({ busy: false })
    }
  }, [identity, jobId, patch, report, session, token])
  const refresh = useEffectEvent(() => run())
  useEffect(() => {
    session.active = true
    void refresh()
    const foreground = () => AppState.currentState === 'active' || AppState.currentState == null
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void refresh() })
    const timer = setInterval(() => { if (foreground()) void refresh() }, 5000)
    return () => { session.active = false; clearInterval(timer); subscription.remove() }
  }, [session])

  const propose = useCallback(async (customerTotal: number, scopeSummary: string) => {
    if (!session.active || role !== 'worker' || !state.loaded || state.pending ||
      !['rfq', 'inspection_only'].includes(state.snapshot?.quote_mode ?? '') ||
      (state.snapshot?.proposal && state.snapshot.proposal.status !== 'rejected')) return
    const input = rfqPriceProposalInputSchema.safeParse({ request_id: generateClientRequestId(),
      customer_total: customerTotal, scope_summary: scopeSummary })
    if (!input.success) { report('RFQ_PRICE_INVALID_INPUT'); return }
    await run({ ...identity, kind: 'propose', input: input.data })
  }, [identity, report, role, run, session, state.loaded, state.pending, state.snapshot])
  const decide = useCallback(async (approve: boolean) => {
    const proposal = state.snapshot?.proposal
    if (!session.active || role !== 'customer' || !state.loaded || state.pending || proposal?.status !== 'pending') return
    await run({ ...identity, kind: 'decide', proposal, approve })
  }, [identity, role, run, session, state.loaded, state.pending, state.snapshot])

  return { ...state, proposal: state.snapshot?.proposal ?? null, propose, decide, refresh: () => run() }
}
