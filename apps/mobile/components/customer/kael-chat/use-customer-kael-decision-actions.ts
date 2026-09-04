import type { ConfirmationOperationReceipt, KaelChatConfirmInput, KaelChatTurnInput, LocalDeal } from '@nestscout/shared'
import type { useRouter } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'
import { generateClientRequestId } from '@/lib/client-request-id'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { kaelAssistantService, kaelChatService } from '@/lib/services'
import {
  clearPendingConfirmation,
  getOrCreatePendingConfirmation,
  readPendingConfirmation,
  writePendingConfirmation,
} from '@/lib/frontend-workflow/confirmation-recovery'

import {
  clearPendingKaelChatDraft,
  setPendingKaelChatDraft,
} from '../kael-chat/pending-intake'
import {
  appendKaelSupportCode,
  formatAssistantAnswer,
  localizeKaelRequestFailure,
  makeAssistantTurnId,
} from './customer-kael-chat-helpers'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import { totalMediaRefs } from './kael-chat-turn-display-model'
import type { CustomerKaelMode } from '../ui/types'
import type { useCustomerKaelChatUiState } from './use-customer-kael-chat-ui-state'
import type { useCustomerKaelConversationState } from './use-customer-kael-conversation-state'
import type { useKaelProcessLineController } from './use-kael-process-line-controller'

type ChatEstimate = NonNullable<KaelChatResponse['session']['estimate']>
type ChatUi = ReturnType<typeof useCustomerKaelChatUiState>
type Conversation = ReturnType<typeof useCustomerKaelConversationState>
type ProcessController = ReturnType<typeof useKaelProcessLineController>
type Router = ReturnType<typeof useRouter>
type Workflow = ReturnType<typeof useFrontendWorkflow>

export function useCustomerKaelDecisionActions({
  chatEstimate,
  chatUi,
  conversation,
  deal,
  kaelRequestGuard,
  language,
  mode,
  pendingDraftOwnerId = null,
  processController,
  router,
  sessionAccessToken,
  workflow,
}: {
  chatEstimate: ChatEstimate | null
  chatUi: ChatUi
  conversation: Conversation
  deal: LocalDeal | null
  kaelRequestGuard: CustomerKaelRequestGuard
  language: AppLanguage
  mode: CustomerKaelMode
  pendingDraftOwnerId?: string | null
  processController: ProcessController
  router: Router
  sessionAccessToken?: string
  workflow: Workflow
}) {
  const {
    chat,
    setAssistantTurns,
    setChat,
    setError,
    setLoading,
    setLocalMode,
    setTurns,
    turns,
  } = conversation
  const {
    agenticAdjustmentText,
    agenticRejectReason,
    caseQuoteRejectReason,
    confirmingAgenticEstimate,
    confirmingCaseQuote,
    confirmingCompletion,
    retryingWorkerSearch,
    setAgenticAdjustmentOpen,
    setAgenticAdjustmentText,
    setAgenticPriceQuestionOpen,
    setAgenticRejectOpen,
    setAgenticRejectReason,
    setCaseEditOpen,
    setCaseQuoteRejectOpen,
    setCaseQuoteRejectReason,
    setConfirmingAgenticEstimate,
    setConfirmingCaseQuote,
    setConfirmingCompletion,
    setRetryingWorkerSearch,
    setSubmittingAgenticAdjustment,
    setSubmittingAgenticRejectReason,
    setSubmittingCaseQuoteRejectReason,
    submittingAgenticAdjustment,
    submittingAgenticRejectReason,
    submittingCaseQuoteRejectReason,
  } = chatUi
  const { startProcessLines, stopProcessLines } = processController
  const decisionOwnerKey = `${chat?.session.id ?? 'no-session'}:${deal?.id ?? 'no-case'}`
  const decisionOperationRef = useRef<{ kind: string; ownerKey: string } | null>(null)
  const pendingConfirmationRef = useRef<Awaited<ReturnType<typeof getOrCreatePendingConfirmation>> | null>(null)
  const [confirmationReconciling, setConfirmationReconciling] = useState(false)
  const [pendingConfirmationSessionId, setPendingConfirmationSessionId] = useState<string | null>(null)
  const [confirmationSupportCode, setConfirmationSupportCode] = useState<string | null>(null)
  const beginDecisionOperation = (kind: string) => {
    if (decisionOperationRef.current?.ownerKey === decisionOwnerKey) return null
    const operation = { kind, ownerKey: decisionOwnerKey }
    decisionOperationRef.current = operation
    return operation
  }
  const finishDecisionOperation = (operation: { kind: string; ownerKey: string }) => {
    if (decisionOperationRef.current === operation) decisionOperationRef.current = null
  }
  const decisionFailure = language === 'vi'
    ? 'Chưa thể hoàn tất lựa chọn này. Vui lòng thử lại.'
    : 'This choice could not be completed. Try again.'

  const applyConfirmationOperation = useCallback(async (receipt: ConfirmationOperationReceipt) => {
    const sessionId = chat?.session.id
    if (!sessionId || receipt.session_id !== sessionId) return
    setConfirmationSupportCode(receipt.support_code)
    setChat((current) => current ? {
      ...current,
      session: {
        ...current.session,
        confirmation_operation: receipt,
        job_id: receipt.job_id ?? current.session.job_id,
        ...(receipt.job_id ? { next_action: 'confirmed' as const, status: 'confirmed' as const } : {}),
      },
    } : current)
    if (receipt.terminal) {
      pendingConfirmationRef.current = null
      setPendingConfirmationSessionId(null)
      setConfirmationReconciling(false)
      await clearPendingConfirmation(sessionId)
    } else {
      const pending = await getOrCreatePendingConfirmation(sessionId)
      const updated = {
        ...pending,
        operation: receipt,
        supportCode: receipt.support_code,
        updatedAt: receipt.updated_at,
      }
      pendingConfirmationRef.current = updated
      setPendingConfirmationSessionId(updated.sessionId)
      setConfirmationReconciling(true)
      await writePendingConfirmation(updated)
    }
    if (receipt.job_id && typeof workflow.actions.hydrateRemoteJobById === 'function') {
      const hydration = sessionAccessToken
        ? workflow.actions.hydrateRemoteJobById(receipt.job_id, sessionAccessToken)
        : workflow.actions.hydrateRemoteJobById(receipt.job_id)
      void hydration.catch(() => undefined)
    }
  }, [chat?.session.id, sessionAccessToken, setChat, workflow.actions])

  const reconcileConfirmation = useCallback(async () => {
    const sessionId = chat?.session.id
    if (!sessionId) return
    const pending = pendingConfirmationRef.current?.sessionId === sessionId
      ? pendingConfirmationRef.current
      : await readPendingConfirmation(sessionId)
    if (!pending) return
    pendingConfirmationRef.current = pending
    setPendingConfirmationSessionId(pending.sessionId)
    setConfirmationReconciling(true)
    setConfirmationSupportCode(pending.supportCode)
    const operation = await kaelChatService.getConfirmationOperation(sessionId, sessionAccessToken)
    if (operation.success) {
      await applyConfirmationOperation(operation.data.operation)
      return
    }
    if (operation.status !== 404) return
    const refreshed = await kaelChatService.get(sessionId, sessionAccessToken)
    if (refreshed.success && refreshed.data.session.confirmation_operation) {
      await applyConfirmationOperation(refreshed.data.session.confirmation_operation)
    }
  }, [applyConfirmationOperation, chat?.session.id, sessionAccessToken])

  useEffect(() => {
    const sessionId = chat?.session.id
    if (!sessionId) return
    void reconcileConfirmation()
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcileConfirmation()
    })
    return () => subscription.remove()
  }, [chat?.session.id, reconcileConfirmation])

  const confirmIntakeInformation = async () => {
    const confirmation = chat?.session.intake_confirmation
    if (
      !chat?.session.id ||
      confirmation?.status !== 'pending' ||
      confirmation.blocking
    ) return
    const operation = beginDecisionOperation('confirm-intake')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setLoading(true)
    setError(null)
    const processDone = startProcessLines(
      language === 'vi'
        ? 'Đã xác nhận thông tin. Kael đang bắt đầu phân tích.'
        : 'Information confirmed. Kael is beginning the analysis.',
      {
        complexity: null,
        mediaCount: totalMediaRefs(turns),
        mode: mode === 'case' ? 'case' : 'normal',
        serviceType: chat.session.service_type,
      },
    )
    try {
      const result = await kaelChatService.decideIntakeConfirmation(
        chat.session.id,
        { decision: 'confirmed' },
        sessionAccessToken,
      )
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!result.success) {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
        return
      }
      await processDone
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      setChat(result.data)
      setTurns(result.data.turns)
      if (
        pendingDraftOwnerId &&
        result.data.session.intake_confirmation?.status === 'confirmed'
      ) {
        await clearPendingKaelChatDraft(pendingDraftOwnerId)
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setLoading(false)
        stopProcessLines()
      }
    }
  }

  const requestIntakeCorrection = async () => {
    const confirmation = chat?.session.intake_confirmation
    if (
      !chat?.session.id ||
      confirmation?.status !== 'pending' ||
      !pendingDraftOwnerId
    ) return
    const operation = beginDecisionOperation('correct-intake')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setLoading(true)
    setError(null)
    const intake = confirmation.intake
    try {
      await setPendingKaelChatDraft(pendingDraftOwnerId, {
        addressLabel: intake.address_label,
        clientRequestId: generateClientRequestId(),
        createdAt: new Date().toISOString(),
        description: intake.description,
        districtLabel: intake.address_district,
        locale: language,
        message: intake.description,
        problemChips: [...intake.problem_chips],
        profileId: intake.profile_id,
        scheduleMode: 'scheduled',
        scheduledAt: intake.scheduled_at,
        scheduleWindow: {
          date: intake.schedule_window.date,
          end: intake.schedule_window.end,
          start: intake.schedule_window.start,
          timeZone: intake.schedule_window.time_zone,
        },
        serviceType: intake.service_type,
        source: 'booking',
      })
      const result = await kaelChatService.decideIntakeConfirmation(
        chat.session.id,
        { decision: 'correction_requested' },
        sessionAccessToken,
      )
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!result.success) {
        setError(localizeKaelRequestFailure(result, language))
        return
      }
      router.replace('/(customer)/booking?editKaelIntake=1' as never)
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) setLoading(false)
    }
  }

  const confirmAgenticEstimate = async () => {
    if (!chat?.session.id || confirmingAgenticEstimate) return
    const quoteMode = chat.session.quote_mode ?? 'kael_auto_quote'
    const confirmationKind: NonNullable<KaelChatConfirmInput['confirmation_kind']> = quoteMode === 'rfq'
      ? 'rfq_request'
      : quoteMode === 'inspection_only'
        ? 'inspection_request'
        : 'priced_offer'
    if (quoteMode === 'blocked' || chat.session.intake_coverage?.order_eligible === false) return
    const priceReasoningReceiptId = chatEstimate?.price_reasoning_receipt?.receipt_id
    if (confirmationKind === 'priced_offer' && !priceReasoningReceiptId) {
      setError(language === 'vi'
        ? 'Kael chưa có biên nhận phân tích giá hợp lệ cho đề nghị này.'
        : 'Kael does not yet have a valid price reasoning receipt for this offer.')
      return
    }
    const operation = beginDecisionOperation('confirm-agentic-estimate')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setConfirmingAgenticEstimate(true)
    setAgenticAdjustmentOpen(false)
    setAgenticAdjustmentText('')
    setAgenticPriceQuestionOpen(false)
    setAgenticRejectOpen(false)
    setAgenticRejectReason('')
    setError(null)
    const processPrompt = quoteMode === 'rfq'
      ? (language === 'vi'
          ? 'Đã gửi yêu cầu báo giá. Kael đang ghi nhận trên hệ thống.'
          : 'Quote request sent. Kael is recording it on the system.')
      : quoteMode === 'inspection_only'
        ? (language === 'vi'
            ? 'Đã gửi yêu cầu khảo sát. Kael đang ghi nhận trên hệ thống.'
            : 'Inspection request sent. Kael is recording it on the system.')
        : (language === 'vi'
            ? 'Đã xác nhận đề nghị giá. Kael đang mở công việc thật.'
            : 'Price offer confirmed. Kael is opening the real job.')
    const processDone = startProcessLines(processPrompt, {
      complexity: chatEstimate?.complexity ?? null,
      mediaCount: totalMediaRefs(turns),
      mode: mode === 'case' ? 'case' : 'normal',
      serviceType: chat.session.service_type,
    })
    let confirmedJobId: string | null = null
    try {
      const pending = pendingConfirmationRef.current?.sessionId === chat.session.id
        ? pendingConfirmationRef.current
        : await getOrCreatePendingConfirmation(chat.session.id)
      pendingConfirmationRef.current = pending
      setPendingConfirmationSessionId(pending.sessionId)
      const confirmInput = {
        confirmation_kind: confirmationKind,
        matching_mode: 'prompt_if_saved' as const,
        ...(priceReasoningReceiptId ? { price_reasoning_receipt_id: priceReasoningReceiptId } : {}),
      }
      const confirmed = sessionAccessToken
        ? await kaelChatService.confirm(
            chat.session.id,
            confirmInput,
            sessionAccessToken,
            pending.idempotencyKey,
          )
        : await kaelChatService.confirm(chat.session.id, confirmInput, undefined, pending.idempotencyKey)
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!confirmed.success) {
        stopProcessLines()
        if (isAmbiguousConfirmationFailure(confirmed)) {
          const updated = {
            ...pending,
            supportCode: confirmed.meta?.supportCode ?? pending.supportCode,
            updatedAt: new Date().toISOString(),
          }
          pendingConfirmationRef.current = updated
          setPendingConfirmationSessionId(updated.sessionId)
          setConfirmationSupportCode(updated.supportCode)
          setConfirmationReconciling(true)
          await writePendingConfirmation(updated)
          return
        }
        pendingConfirmationRef.current = null
        setPendingConfirmationSessionId(null)
        setConfirmationReconciling(false)
        await clearPendingConfirmation(chat.session.id)
        setError(appendKaelSupportCode(
          localizeKaelRequestFailure(confirmed, language),
          language,
          confirmed.meta?.supportCode,
        ))
        return
      }
      if (confirmed.data.operation) await applyConfirmationOperation(confirmed.data.operation)
      await processDone
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      const jobId = confirmed.data.job_id
      confirmedJobId = jobId
      if (!confirmed.data.operation || confirmed.data.operation.terminal) {
        pendingConfirmationRef.current = null
        setPendingConfirmationSessionId(null)
        setConfirmationReconciling(false)
        await clearPendingConfirmation(chat.session.id)
      }
      if (jobId) {
        setChat((current) => current ? {
          ...current,
          session: {
            ...current.session,
            job_id: jobId,
            next_action: 'confirmed',
            status: 'confirmed',
          },
        } : current)
      }
      if (confirmed.data.operation?.state === 'no_reachable_worker') {
        setError(appendKaelSupportCode(
          localizeKaelRequestFailure({ code: 'NO_REACHABLE_WORKER', error: '' }, language),
          language,
          confirmed.data.operation.support_code,
        ))
      }
      if (jobId && typeof workflow.actions.hydrateRemoteJobById === 'function') {
        // The destination can rehydrate from jobId, so a stale cache must not turn a confirmed job into a failed action.
        const hydration = sessionAccessToken
          ? workflow.actions.hydrateRemoteJobById(jobId, sessionAccessToken)
          : workflow.actions.hydrateRemoteJobById(jobId)
        void hydration.catch(() => undefined)
      }
      if (jobId) {
        setLocalMode('case')
        router.replace(`/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(jobId)}` as never)
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken) && !confirmedJobId) {
        setConfirmationReconciling(true)
        const pending = pendingConfirmationRef.current
        if (pending) await writePendingConfirmation({ ...pending, updatedAt: new Date().toISOString() })
      }
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setConfirmingAgenticEstimate(false)
        stopProcessLines()
      }
    }
  }

  const submitAgenticEstimateFollowUp = async ({
    kind,
    message,
    onSuccess,
    setSubmitting,
    scheduledAt,
    scheduleWindow,
    turnIntent,
  }: {
    kind: 'adjust-agentic-estimate' | 'reject-agentic-estimate' | 'schedule-agentic-estimate'
    message: string
    onSuccess: () => void
    setSubmitting: (value: boolean) => void
    scheduledAt?: string
    scheduleWindow?: KaelChatTurnInput['schedule_window']
    turnIntent?: 'scope_adjustment'
  }) => {
    if (!chat?.session.id || !message) return
    const operation = beginDecisionOperation(kind)
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setSubmitting(true)
    setLoading(true)
    setError(null)
    const reanalyzing = kind === 'adjust-agentic-estimate' || kind === 'schedule-agentic-estimate'
    const processDone = startProcessLines(message, {
      complexity: chatEstimate?.complexity ?? null,
      mediaCount: reanalyzing ? 0 : totalMediaRefs(turns),
      mode: 'case',
      scenario: reanalyzing ? 'analysis_refinement' : undefined,
      serviceType: chat.session.service_type,
    })
    try {
      const result = await kaelChatService.sendTurn(chat.session.id, {
        language,
        message,
        photo_urls: [],
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        ...(scheduleWindow ? { schedule_window: scheduleWindow } : {}),
        turn_intent: turnIntent,
      })
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (result.success) {
        await processDone
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        setChat(result.data)
        setTurns(result.data.turns)
        onSuccess()
      } else {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setSubmitting(false)
        setLoading(false)
        stopProcessLines()
      }
    }
  }

  const submitAgenticAdjustment = async () => {
    const detail = agenticAdjustmentText.trim()
    if (submittingAgenticAdjustment || !detail) return
    await submitAgenticEstimateFollowUp({
      kind: 'adjust-agentic-estimate',
      message: detail,
      onSuccess: () => {
        setAgenticAdjustmentOpen(false)
        setAgenticAdjustmentText('')
      },
      setSubmitting: setSubmittingAgenticAdjustment,
      turnIntent: 'scope_adjustment',
    })
  }

  const submitAgenticRejectReason = async () => {
    const reason = agenticRejectReason.trim()
    if (submittingAgenticRejectReason || !reason) return
    await submitAgenticEstimateFollowUp({
      kind: 'reject-agentic-estimate',
      message: reason,
      onSuccess: () => {
        setAgenticRejectOpen(false)
        setAgenticRejectReason('')
      },
      setSubmitting: setSubmittingAgenticRejectReason,
    })
  }

  const submitAgenticSchedule = async (input: {
    message: string
    scheduled_at: string
    schedule_window: NonNullable<KaelChatTurnInput['schedule_window']>
  }) => {
    await submitAgenticEstimateFollowUp({
      kind: 'schedule-agentic-estimate',
      message: input.message,
      onSuccess: () => undefined,
      scheduledAt: input.scheduled_at,
      scheduleWindow: input.schedule_window,
      setSubmitting: () => undefined,
    })
  }

  const confirmCaseQuote = async () => {
    if (!deal?.id || confirmingCaseQuote || typeof workflow.actions.confirmRemoteSearch !== 'function') return
    const operation = beginDecisionOperation('confirm-case-quote')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setConfirmingCaseQuote(true)
    setCaseQuoteRejectOpen(false)
    setCaseQuoteRejectReason('')
    setError(null)
    const processDone = startProcessLines(
      language === 'vi'
        ? 'Đã xác nhận báo giá. Kael đang mở bước tiếp theo.'
        : 'Quote confirmed. Kael is opening the next step.',
      {
        complexity: deal.estimate?.complexity ?? null,
        mediaCount: deal.draft.mediaCount ?? 0,
        mode: 'case',
        serviceType: deal.draft.serviceType,
      },
    )
    try {
      const confirmed = await workflow.actions.confirmRemoteSearch(deal.id)
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (confirmed) {
        await processDone
        if (!kaelRequestGuard.isCurrent(requestToken)) return
      } else {
        stopProcessLines()
        setError(language === 'vi' ? 'Chưa đồng bộ' : 'Not synced')
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setConfirmingCaseQuote(false)
        stopProcessLines()
      }
    }
  }

  const submitCaseQuoteRejectReason = async () => {
    const reason = caseQuoteRejectReason.trim()
    if (!deal?.id || submittingCaseQuoteRejectReason || !reason) return
    const operation = beginDecisionOperation('reject-case-quote')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setSubmittingCaseQuoteRejectReason(true)
    setLoading(true)
    setError(null)
    const processDone = startProcessLines(reason, {
      complexity: deal.estimate?.complexity ?? null,
      mediaCount: deal.draft.mediaCount ?? 0,
      mode: 'case',
      serviceType: deal.draft.serviceType,
    })
    try {
      const result = await kaelAssistantService.ask({
        job_id: deal.id,
        language,
        message: reason,
        surface: 'customer_case',
      })
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (result.success) {
        await processDone
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        setAssistantTurns((current) => [
          ...current,
          {
            id: makeAssistantTurnId('customer_case', 'customer'),
            role: 'customer',
            surface: 'customer_case',
            text_content: reason,
          },
          {
            id: makeAssistantTurnId('customer_case', 'kael'),
            role: 'kael',
            surface: 'customer_case',
            text_content: formatAssistantAnswer(result.data, language),
          },
        ])
        setCaseQuoteRejectOpen(false)
        setCaseQuoteRejectReason('')
        setCaseEditOpen(true)
      } else {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setSubmittingCaseQuoteRejectReason(false)
        setLoading(false)
        stopProcessLines()
      }
    }
  }

  const confirmCaseCompletion = async () => {
    if (deal?.status !== 'completed_by_worker' || confirmingCompletion) return
    const operation = beginDecisionOperation('confirm-case-completion')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setConfirmingCompletion(true)
    setError(null)
    try {
      const confirmed = await workflow.actions.customerConfirmCompletion()
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!confirmed) {
        setError(language === 'vi'
          ? 'Chưa thể xác nhận hoàn tất'
          : 'Completion could not be confirmed')
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) setConfirmingCompletion(false)
    }
  }

  const retryWorkerSearch = async () => {
    const matchingReceiptRecoverable = deal?.matchingState?.stage === 'exhausted' ||
      deal?.matchingState?.stage === 'recovery_required'
    if (
      deal?.status !== 'broadcasting' ||
      (!matchingReceiptRecoverable && deal.broadcast?.status !== 'expired') ||
      retryingWorkerSearch ||
      typeof workflow.actions.confirmRemoteSearch !== 'function'
    ) return
    const operation = beginDecisionOperation('retry-worker-search')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setRetryingWorkerSearch(true)
    setError(null)
    try {
      const retried = await workflow.actions.confirmRemoteSearch(deal.id)
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!retried) {
        setError(language === 'vi'
          ? 'Chưa thể tìm lại thợ lúc này. Vui lòng thử lại.'
          : 'The worker search could not be retried. Try again.')
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) setRetryingWorkerSearch(false)
    }
  }

  return {
    confirmationReconciling: confirmationReconciling && pendingConfirmationSessionId === chat?.session.id,
    confirmationSupportCode: pendingConfirmationSessionId === chat?.session.id
      ? confirmationSupportCode
      : null,
    confirmIntakeInformation,
    confirmAgenticEstimate,
    confirmCaseCompletion,
    confirmCaseQuote,
    retryWorkerSearch,
    requestIntakeCorrection,
    submitAgenticAdjustment,
    submitAgenticRejectReason,
    submitAgenticSchedule,
    submitCaseQuoteRejectReason,
  }
}

function isAmbiguousConfirmationFailure(result: { code?: string; status?: number }) {
  return result.status === 0
    || (typeof result.status === 'number' && result.status >= 500)
    || result.code === 'TIMEOUT'
    || result.code === 'NETWORK_ERROR'
    || result.code === 'INVALID_RESPONSE'
    || result.code === 'RESPONSE_TOO_LARGE'
    || result.code === 'IDEMPOTENCY_RECONCILE_REQUIRED'
}
