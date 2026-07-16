import type { LocalDeal } from '@nestscout/shared'
import type { useRouter } from 'expo-router'
import { useRef } from 'react'

import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatResponse } from '@/lib/api-types'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { kaelAssistantService, kaelChatService } from '@/lib/services'

import {
  formatAssistantAnswer,
  localizeKaelRequestFailure,
  makeAssistantTurnId,
} from './customer-kael-chat-helpers'
import type { CustomerKaelRequestGuard } from './customer-kael-state-scope'
import { totalMediaRefs } from './kael-chat-turn-display-model'
import type { CustomerKaelMode } from './types'
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
  processController,
  router,
  workflow,
}: {
  chatEstimate: ChatEstimate | null
  chatUi: ChatUi
  conversation: Conversation
  deal: LocalDeal | null
  kaelRequestGuard: CustomerKaelRequestGuard
  language: AppLanguage
  mode: CustomerKaelMode
  processController: ProcessController
  router: Router
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
    agenticRejectReason,
    caseQuoteRejectReason,
    confirmingAgenticEstimate,
    confirmingCaseQuote,
    confirmingCompletion,
    setAgenticRejectOpen,
    setAgenticRejectReason,
    setCaseEditOpen,
    setCaseQuoteRejectOpen,
    setCaseQuoteRejectReason,
    setConfirmingAgenticEstimate,
    setConfirmingCaseQuote,
    setConfirmingCompletion,
    setSubmittingAgenticRejectReason,
    setSubmittingCaseQuoteRejectReason,
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

  const confirmAgenticEstimate = async () => {
    if (!chat?.session.id || !chatEstimate || confirmingAgenticEstimate) return
    const operation = beginDecisionOperation('confirm-agentic-estimate')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setConfirmingAgenticEstimate(true)
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
    try {
      const confirmed = await kaelChatService.confirm(chat.session.id)
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (!confirmed.success) {
        stopProcessLines()
        setError(localizeKaelRequestFailure(confirmed, language))
        return
      }
      await processDone
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      const jobId = confirmed.data.job_id
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
        await workflow.actions.hydrateRemoteJobById(jobId)
        if (!kaelRequestGuard.isCurrent(requestToken)) return
      }
      if (jobId) {
        setLocalMode('case')
        router.replace(`/(customer)/kael-chat?mode=case&jobId=${encodeURIComponent(jobId)}` as never)
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setConfirmingAgenticEstimate(false)
        stopProcessLines()
      }
    }
  }

  const submitAgenticRejectReason = async () => {
    const reason = agenticRejectReason.trim()
    if (!chat?.session.id || submittingAgenticRejectReason || !reason) return
    const operation = beginDecisionOperation('reject-agentic-estimate')
    if (!operation) return
    const requestToken = kaelRequestGuard.begin('conversation')
    setSubmittingAgenticRejectReason(true)
    setLoading(true)
    setError(null)
    const processDone = startProcessLines(reason, {
      complexity: chatEstimate?.complexity ?? null,
      mediaCount: 0,
      mode: 'normal',
      serviceType: chat.session.service_type,
    })
    try {
      const result = await kaelChatService.sendTurn(chat.session.id, {
        language,
        message: reason,
        photo_urls: [],
      })
      if (!kaelRequestGuard.isCurrent(requestToken)) return
      if (result.success) {
        await processDone
        if (!kaelRequestGuard.isCurrent(requestToken)) return
        setChat(result.data)
        setTurns(result.data.turns)
        setAgenticRejectOpen(false)
        setAgenticRejectReason('')
      } else {
        stopProcessLines()
        setError(localizeKaelRequestFailure(result, language))
      }
    } catch {
      if (kaelRequestGuard.isCurrent(requestToken)) setError(decisionFailure)
    } finally {
      finishDecisionOperation(operation)
      if (kaelRequestGuard.isCurrent(requestToken)) {
        setSubmittingAgenticRejectReason(false)
        setLoading(false)
        stopProcessLines()
      }
    }
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
      const confirmed = await workflow.actions.confirmRemoteSearch()
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

  return {
    confirmAgenticEstimate,
    confirmCaseCompletion,
    confirmCaseQuote,
    submitAgenticRejectReason,
    submitCaseQuoteRejectReason,
  }
}
