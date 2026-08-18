import { useMemo, type ReactNode } from 'react'
import { ActivityIndicator } from 'react-native'

import { KaelReasoningReceipt } from '@/components/ui/kael-reasoning-receipt'
import type { AppLanguage } from '@/lib/app-language'
import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'
import { createCompletedKaelResponseState } from '@/lib/kael-response-stream'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerVisibleCaseRequestText } from './kael-chat-turn-display-model'
import { CustomerKaelEmptyHero } from './kael-empty-hero'
import { KaelResponseSurface } from './kael-response-surface'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'
import { ChatBubble } from './chat-surfaces'
import type { ChatTranscriptRow } from './kael-chat-transcript'
import { InactiveAgenticGate } from '../ui/shared-surfaces'
import type { CustomerKaelMode } from '../ui/types'

export type ChatTurnView = {
  id: string
  role: 'customer' | 'worker' | 'kael'
  text_content: string
}

export type AgenticTurnView = {
  id: string
  role: string
  text_content?: string | null
}

type Input = {
  agenticEstimateNode: ReactNode
  agenticVisibleTurns: AgenticTurnView[]
  analysisEvidenceNode: ReactNode
  caseAssistantTurns: ChatTurnView[]
  caseIntakeResponseNode: ReactNode
  caseThreadNode: ReactNode
  emptyHeroVisible: boolean
  hydratingCase: boolean
  language: AppLanguage
  missingCaseWorkDeal: boolean
  mode: CustomerKaelMode
  normalAssistantTurns: ChatTurnView[]
  normalReasoningReceipt: KaelReasoningReceiptState
  onToggleNormalReasoningReceipt: () => void
  pendingDraftMessage: string
  pendingNormalMessage: string | null
  processLinesNode: ReactNode
  reduceMotion: boolean
  showNormalGreeting: boolean
  showPendingDraftBubble: boolean
  streamingReplyNode: ReactNode
  streamingReplyTurnId: string | null
  tokens: CustomerThemeTokens
  workerCandidateNode: ReactNode
}

function appendRow(rows: ChatTranscriptRow[], key: string, node: ReactNode) {
  if (node === null || node === undefined || node === false) return
  rows.push({ key, node })
}

function renderTurn(turn: ChatTurnView, language: AppLanguage, reduceMotion: boolean, tokens: CustomerThemeTokens) {
  if (turn.role !== 'kael') return <ChatBubble speaker={turn.role} text={turn.text_content} tokens={tokens} />
  return <KaelResponseSurface language={language} reduceMotion={reduceMotion} state={createCompletedKaelResponseState(turn.text_content, turn.id)} tokens={tokens} />
}

export function useKaelChatTranscript({
  agenticEstimateNode,
  agenticVisibleTurns,
  analysisEvidenceNode,
  caseAssistantTurns,
  caseIntakeResponseNode,
  caseThreadNode,
  emptyHeroVisible,
  hydratingCase,
  language,
  missingCaseWorkDeal,
  mode,
  normalAssistantTurns,
  normalReasoningReceipt,
  onToggleNormalReasoningReceipt,
  pendingDraftMessage,
  pendingNormalMessage,
  processLinesNode,
  reduceMotion,
  showNormalGreeting,
  showPendingDraftBubble,
  streamingReplyNode,
  streamingReplyTurnId,
  tokens,
  workerCandidateNode,
}: Input) {
  const normalReasoningReceiptNode = useMemo(() => (
    mode === 'normal' && !pendingNormalMessage && normalReasoningReceipt.status !== 'idle' ? (
      <KaelReasoningReceipt
        colors={{ accent: tokens.primary, border: tokens.border, mutedText: tokens.muted, surface: tokens.raised, text: tokens.text }}
        language={language}
        onToggle={onToggleNormalReasoningReceipt}
        state={normalReasoningReceipt}
        testID="customer-v21-kael-reasoning-receipt"
      />
    ) : null
  ), [language, mode, normalReasoningReceipt, onToggleNormalReasoningReceipt, pendingNormalMessage, tokens])
  const normalPendingReasoningNode = useMemo(() => (
    mode === 'normal' && pendingNormalMessage ? (
      <>
        <ChatBubble speaker="customer" testID="customer-v21-kael-reasoning-pending-message" text={pendingNormalMessage} tokens={tokens} />
        <KaelReasoningReceipt
          colors={{ accent: tokens.primary, border: tokens.border, mutedText: tokens.muted, surface: tokens.raised, text: tokens.text }}
          language={language}
          onToggle={onToggleNormalReasoningReceipt}
          state={normalReasoningReceipt}
          testID="customer-v21-kael-reasoning-receipt"
        />
      </>
    ) : null
  ), [language, mode, normalReasoningReceipt, onToggleNormalReasoningReceipt, pendingNormalMessage, tokens])
  const transcriptRows = useMemo(() => {
    const rows: ChatTranscriptRow[] = []
    if (emptyHeroVisible) appendRow(rows, 'empty-hero', <CustomerKaelEmptyHero language={language} mode={mode} reduceMotion={reduceMotion} tokens={tokens} />)
    if (showPendingDraftBubble) {
      appendRow(rows, 'pending-draft', <ChatBubble speaker="customer" testID="customer-v21-pending-draft-bubble" text={customerVisibleCaseRequestText(pendingDraftMessage, language)} tokens={tokens} />)
    }
    const pinnedCaseAssistantIndex = mode === 'case' && !showPendingDraftBubble
      ? caseAssistantTurns.findIndex((turn) => turn.role === 'customer' && turn.text_content.trim().length > 0)
      : -1
    const pinnedAgenticIndex = pinnedCaseAssistantIndex < 0 && mode === 'case' && !showPendingDraftBubble
      ? agenticVisibleTurns.findIndex((turn) => turn.role === 'customer' && Boolean(turn.text_content?.trim()))
      : -1
    if (pinnedCaseAssistantIndex >= 0) {
      const pinnedTurn = caseAssistantTurns[pinnedCaseAssistantIndex]
      appendRow(rows, 'pinned-intake-summary', <ChatBubble speaker="customer" testID="customer-v21-pinned-intake-summary" text={pinnedTurn.text_content} tokens={tokens} />)
    } else if (pinnedAgenticIndex >= 0) {
      const pinnedTurn = agenticVisibleTurns[pinnedAgenticIndex]
      appendRow(rows, 'pinned-intake-summary', <ChatBubble speaker="customer" testID="customer-v21-pinned-intake-summary" text={pinnedTurn.text_content ?? ''} tokens={tokens} />)
    }
    if (showNormalGreeting) {
      appendRow(rows, 'normal-greeting', <KaelResponseSurface language={language} reduceMotion={reduceMotion} state={createCompletedKaelResponseState(language === 'vi' ? 'Chào bạn, mình là Kael. Bạn muốn hỏi gì hôm nay?' : 'Hi, I am Kael. What would you like to ask today?', 'normal-greeting')} testID="customer-v21-normal-greeting-bubble" tokens={tokens} />)
    }
    appendRow(rows, 'case-intake-response', caseIntakeResponseNode)
    if (mode === 'case' && hydratingCase) {
      const hydrationModel = buildCaseWorkResponseModel({ language, phase: 'kael_collecting' })
      appendRow(rows, 'case-hydrating', (
        <CaseWorkResponse
          details={<ActivityIndicator color={tokens.primary} />}
          model={{
            ...hydrationModel,
            noteCopy: language === 'vi' ? 'Phiên và trạng thái công việc đang được đồng bộ từ hệ thống.' : 'The session and work status are syncing from the system.',
            status: language === 'vi' ? 'Đang đồng bộ' : 'Syncing',
            title: language === 'vi' ? 'Đang tải công việc' : 'Loading work',
          }}
          reduceMotion={reduceMotion}
          testID="customer-v21-case-hydrating"
          tokens={tokens}
        />
      ))
    }
    for (const [index, turn] of caseAssistantTurns.entries()) {
      if (index === pinnedCaseAssistantIndex) continue
      appendRow(rows, `turn-${turn.id}`, renderTurn(turn, language, reduceMotion, tokens))
    }
    const finalAgenticKaelTurnIndex = streamingReplyNode ? agenticVisibleTurns.findLastIndex((turn) => turn.role !== 'customer') : -1
    for (const [index, turn] of agenticVisibleTurns.entries()) {
      if (index === pinnedAgenticIndex) continue
      if (index === finalAgenticKaelTurnIndex && streamingReplyNode) continue
      appendRow(rows, `turn-${turn.id}`, turn.role === 'customer'
        ? <ChatBubble speaker="customer" text={turn.text_content ?? ''} tokens={tokens} />
        : <KaelResponseSurface language={language} reduceMotion={reduceMotion} state={createCompletedKaelResponseState(turn.text_content ?? '', turn.id)} tokens={tokens} />)
    }
    appendRow(rows, 'case-thread', caseThreadNode)
    appendRow(rows, 'worker-candidate', workerCandidateNode)
    appendRow(rows, 'analysis-evidence', analysisEvidenceNode)
    appendRow(rows, 'agentic-estimate', agenticEstimateNode)
    if (mode === 'normal') {
      const finalKaelTurnIndex = normalAssistantTurns.findLastIndex((turn) => turn.role === 'kael')
      for (const [index, turn] of normalAssistantTurns.entries()) {
        if (index === finalKaelTurnIndex) appendRow(rows, 'normal-reasoning-receipt', normalReasoningReceiptNode)
        if (index === finalKaelTurnIndex && streamingReplyNode) continue
        appendRow(rows, `turn-${turn.id}`, renderTurn(turn, language, reduceMotion, tokens))
      }
      if (finalKaelTurnIndex < 0) appendRow(rows, 'normal-reasoning-receipt', normalReasoningReceiptNode)
    }
    appendRow(rows, 'normal-pending-reasoning', normalPendingReasoningNode)
    appendRow(rows, 'process-lines', processLinesNode)
    appendRow(rows, streamingReplyTurnId ? `turn-${streamingReplyTurnId}` : 'streaming-reply', streamingReplyNode)
    if (missingCaseWorkDeal && !hydratingCase) appendRow(rows, 'case-work-inactive', <InactiveAgenticGate testID="customer-v21-case-work-inactive" />)
    return rows
  }, [
    agenticEstimateNode, agenticVisibleTurns, analysisEvidenceNode, caseAssistantTurns, caseIntakeResponseNode,
    caseThreadNode, emptyHeroVisible, hydratingCase, language, missingCaseWorkDeal, mode, normalAssistantTurns,
    normalPendingReasoningNode, normalReasoningReceiptNode, pendingDraftMessage, processLinesNode, reduceMotion,
    showNormalGreeting, showPendingDraftBubble, streamingReplyNode, streamingReplyTurnId, tokens, workerCandidateNode,
  ])

  return {
    responseInFlight: Boolean(normalPendingReasoningNode || processLinesNode || streamingReplyNode),
    transcriptRows,
  }
}
