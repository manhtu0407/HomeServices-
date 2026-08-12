import type { KaelChatTurnInput, LocalDeal } from '@nestscout/shared'
import type { useRouter } from 'expo-router'
import { useRef } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'
import { generateClientRequestId } from '@/lib/client-request-id'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { kaelAssistantService, kaelChatService } from '@/lib/services'

import {
  clearPendingKaelChatDraft,
  setPendingKaelChatDraft,
} from '../kael-chat/pending-intake'
import {
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
    if (!chat?.session.id || !chatEstimate || confirmingAgenticEstimate) return
    const priceReasoningReceiptId = chatEstimate.price_reasoning_receipt?.receipt_id
    if (!priceReasoningReceiptId) {
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
    const processPrompt = language === 'vi'
      ? 'Đã xác nhận đề xuất. Kael đang mở công việc thật.'
      : 'Estimate confirmed. Kael is opening the real job.'
    const processDone = startProcessLines(processPrompt, {
      complexity: chatEstimate.complexity ?? null,
      mediaCount: totalMediaRefs(turns),
      mode: mode === 'case' ? 'case' : 'normal',
      serviceType: chat.session.service_type,
    })
    let confirmedJobId: string | null = null
    try {
      const confirmed = sessionAccessToken
        ? await kaelChatService.confirm(
            chat.session.id,
            {
              price_reasoning_receipt_id: priceReasoningReceiptId,
              matching_mode: 'prompt_if_saved',
            },
            sessionAccessToken,
          )
        : await kaelChatService.confirm(chat.session.id, {
            price_reasoning_receipt_id: priceReasoningReceiptId,
            matching_mode: 'prompt_if_saved',
          })
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!confirmed.success) {
        stopProcessLines()
        setError(localizeKaelRequestFailure(confirmed, language))
        return
      }
      await processDone
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      const jobId = confirmed.data.job_id
      confirmedJobId = jobId
      setChat((current) => current ? {
        ...current,
        session: {
          ...current.session,
          job_id: jobId,
          next_action: 'confirmed',
          status: 'confirmed',
        },
      } : current)
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
      if (kaelRequestGuard.isCurrent(requestToken) && !confirmedJobId) setError(decisionFailure)
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
