import { Fragment, useEffect, useRef, type ReactNode } from 'react'
import { ScrollView, View, type ImageSourcePropType } from 'react-native'
import type { LocalDeal, ServiceType } from '@nestscout/shared'

import { KaelReasoningReceipt } from '@/components/ui/kael-reasoning-receipt'
import { useKaelResponseStreamPresentation } from '@/components/ui/use-kael-respond-stream-presentation'
import { color } from '@/design/theme'
import { localizedServiceLabel, localizedStatusLabel, type AppLanguage } from '@/lib/app-language'
import type { KaelReasoningReceiptState } from '@/lib/kael-reasoning-receipt'
import {
  initialKaelResponseStreamState,
  type KaelResponseStreamState,
} from '@/lib/kael-response-stream'

import { textByLanguage } from '../ui/format'
import { WorkerV5KaelOrbBubble } from './orb-surfaces'
import { WorkerV5KaelOrbOpportunityResults } from './orb-opportunity-results'
import { WorkerV5KaelEmptyHero } from './empty-hero'
import { styles } from './body-styles'

type WorkerV5ServiceIconMap = Partial<Record<ServiceType, ImageSourcePropType>>

type WorkerV5KaelOrbLiveTurn = {
  id: string
  role: 'kael' | 'worker'
  text: string
}

const EMPTY_WORKER_V5_KAEL_ORB_LIVE_TURNS: WorkerV5KaelOrbLiveTurn[] = []

type WorkerV5ActiveJobKaelContext = {
  hero: string
  reply: string
  request: string
}

function isWorkerV5ExecutionCase(status: string | null) {
  return status === 'arrived'
    || status === 'inspecting'
    || status === 'repairing'
    || status === 'scope_change_pending'
    || status === 'completed_by_worker'
}

function workerV5ActiveJobKaelContext(
  deal: LocalDeal | null,
  language: AppLanguage,
): WorkerV5ActiveJobKaelContext | null {
  const status = deal?.backendStatus ?? deal?.status ?? null
  if (!status || !isWorkerV5ExecutionCase(status)) return null

  const service = deal?.broadcast?.serviceType ?? deal?.draft.serviceType
  const serviceLabel = service
    ? localizedServiceLabel(service, language)
    : textByLanguage(language, 'công việc này', 'this job')
  const statusLabel = localizedStatusLabel(deal?.status ?? null, language, deal?.draft.serviceType ?? null)
  const isArrived = status === 'arrived'

  if (language === 'vi') {
    return {
      hero: isArrived
        ? `Bạn đang xử lý ${serviceLabel}. Trạng thái hiện tại: ${statusLabel}. Hãy check-in bằng ảnh tại sảnh trước khi tiếp tục công việc.`
        : `Bạn đang xử lý ${serviceLabel}. Trạng thái hiện tại: ${statusLabel}. Kael sẽ hỗ trợ đúng phạm vi đã chốt và bước tiếp theo của công việc.`,
      reply: isArrived
        ? 'Bạn đã đến nơi. Check-in bằng ảnh tại sảnh là bắt buộc trước khi tiếp tục; nếu phát sinh, hãy gửi đổi phạm vi kèm lý do và thêm ảnh nếu có trước khi làm phần phát sinh.'
        : 'Kael đang bám theo trạng thái công việc này. Không tự thay đổi phạm vi hoặc chi phí; nếu phát sinh, hãy gửi đổi phạm vi kèm lý do và thêm ảnh nếu có trước khi làm phần phát sinh.',
      request: `Kael, hỗ trợ tôi xử lý ${serviceLabel} theo phạm vi đã chốt.`,
    }
  }

  return {
    hero: isArrived
      ? `You are working on ${serviceLabel}. Current status: ${statusLabel}. Complete the lobby photo check-in before continuing the job.`
      : `You are working on ${serviceLabel}. Current status: ${statusLabel}. Kael will support the agreed scope and the next job step.`,
    reply: isArrived
      ? 'You have arrived. A lobby photo check-in is required before continuing; if scope changes, submit the reason and photos when available before doing the extra work.'
      : 'Kael is following this job state. Do not change scope or price yourself; if scope changes, submit the reason and photos when available before doing the extra work.',
    request: `Kael, help me complete ${serviceLabel} within the agreed scope.`,
  }
}

export function WorkerV5KaelOrbBody({
  activeSessionId = null,
  composer,
  composerActive = false,
  deal,
  fallbackJobIcon,
  keepIntakeContextAccessible = false,
  language,
  liveError = null,
  reasoningReceipt = null,
  streamingReply = null,
  liveStatus = null,
  liveTurns = EMPTY_WORKER_V5_KAEL_ORB_LIVE_TURNS,
  mode,
  modeMenuOpen = false,
  onOpenOpportunity,
  onStreamingReplySettled,
  onToggleReasoningReceipt,
  reduceMotion = false,
  reduceTransparency,
  serviceIcons,
}: {
  activeSessionId?: string | null
  composer: ReactNode
  composerActive?: boolean
  deal: LocalDeal | null
  fallbackJobIcon: ImageSourcePropType
  keepIntakeContextAccessible?: boolean
  language: AppLanguage
  liveError?: string | null
  reasoningReceipt?: KaelReasoningReceiptState | null
  streamingReply?: KaelResponseStreamState | null
  liveStatus?: string | null
  liveTurns?: WorkerV5KaelOrbLiveTurn[]
  mode: 'intake' | 'normal'
  modeMenuOpen?: boolean
  onOpenOpportunity: () => void
  onStreamingReplySettled?: (responseId: string) => void
  onToggleReasoningReceipt?: () => void
  reduceMotion?: boolean
  reduceTransparency: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  const hasActiveSession = Boolean(activeSessionId)
  const visibleTurns = liveTurns.slice(-8)
  const presentedStreamingReply = useKaelResponseStreamPresentation(
    streamingReply ?? initialKaelResponseStreamState,
    {
      onSettled: onStreamingReplySettled,
      reduceMotion,
    },
  )
  const streamingReplyText = workerKaelStreamingReplyText(presentedStreamingReply)
  const hasStreamingReply = Boolean(streamingReply && streamingReply.status !== 'idle')
  const finalKaelTurnIndex = hasStreamingReply
    ? visibleTurns.findLastIndex((turn) => turn.role === 'kael')
    : -1
  const visibleThreadTurns = visibleTurns.filter((_, index) => index !== finalKaelTurnIndex)
  const hasLiveTurns = visibleThreadTurns.length > 0
  const reasoningReceiptNode = reasoningReceipt
    && reasoningReceipt.status !== 'idle'
    && onToggleReasoningReceipt ? (
      <KaelReasoningReceipt
        colors={{
          accent: color.brand.primary,
          border: color.surface.stroke,
          mutedText: color.text.secondary,
          surface: color.surface.soft,
          text: color.text.primary,
        }}
        language={language}
        onToggle={onToggleReasoningReceipt}
        state={reasoningReceipt}
        testID="worker-v5-kael-reasoning-receipt"
      />
    ) : null
  const receiptBeforeStreamingReply = Boolean(reasoningReceiptNode) && hasStreamingReply
  const receiptBeforeFinalKaelTurn = !receiptBeforeStreamingReply && Boolean(reasoningReceiptNode)
    && visibleTurns.at(-1)?.role === 'kael'
  const hasLiveThread = hasLiveTurns || Boolean(reasoningReceiptNode) || hasStreamingReply || Boolean(liveStatus) || Boolean(liveError)
  const showEmptyHero = !hasLiveTurns && !reasoningReceiptNode && !hasStreamingReply && !composerActive
  const activeJobContext = mode === 'intake' ? workerV5ActiveJobKaelContext(deal, language) : null
  const transcriptRef = useRef<ScrollView>(null)

  useEffect(() => {
    if (!activeSessionId || !hasLiveThread) return
    transcriptRef.current?.scrollToEnd({ animated: !reduceMotion })
  }, [activeSessionId, hasLiveThread, liveTurns.length, reduceMotion, streamingReplyText])

  const scrollToRestoredThread = () => {
    if (!activeSessionId || !hasLiveThread) return
    transcriptRef.current?.scrollToEnd({ animated: !reduceMotion })
  }

  return (
    <View style={styles.kaelOrbCustomerShell} testID={`worker-v5-kael-orb-${mode}`}>
      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.kaelOrbCustomerTranscript,
          showEmptyHero ? styles.kaelOrbCustomerTranscriptEmpty : null,
          modeMenuOpen ? styles.kaelOrbCustomerTranscriptMenuOpen : null,
        ]}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={scrollToRestoredThread}
        ref={transcriptRef}
        showsVerticalScrollIndicator={false}
        style={styles.kaelOrbCustomerTranscriptScroll}
        testID="worker-v5-kael-orb-transcript"
      >
        {showEmptyHero ? (
          <WorkerV5KaelEmptyHero
            contextualCopy={activeJobContext?.hero}
            language={language}
            mode={mode}
            reduceMotion={reduceMotion}
          />
        ) : null}
        {(!showEmptyHero || keepIntakeContextAccessible) && !hasActiveSession && !hasLiveThread && mode === 'intake' ? (
          <WorkerV5KaelOrbIntakeThread
            activeJobContext={activeJobContext}
            deal={deal}
            fallbackJobIcon={fallbackJobIcon}
            language={language}
            onOpenOpportunity={onOpenOpportunity}
            reduceTransparency={reduceTransparency}
            serviceIcons={serviceIcons}
          />
        ) : null}
        {hasLiveThread ? (
          <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-orb-live-thread">
            {visibleThreadTurns.map((turn, index) => (
              <Fragment key={turn.id}>
                {receiptBeforeFinalKaelTurn && index === visibleThreadTurns.length - 1 ? reasoningReceiptNode : null}
                <WorkerV5KaelOrbBubble
                  align={turn.role === 'worker' ? 'right' : undefined}
                  appearance={mode === 'normal' && turn.role === 'kael' ? 'bare' : 'bubble'}
                  body={turn.text}
                  speakerLabel={turn.role === 'worker' ? textByLanguage(language, 'Bạn', 'You') : 'Kael'}
                />
              </Fragment>
            ))}
            {!receiptBeforeFinalKaelTurn ? reasoningReceiptNode : null}
            {streamingReplyText ? (
              <WorkerV5KaelOrbBubble
                appearance={mode === 'normal' ? 'bare' : 'bubble'}
                body={streamingReplyText}
                speakerLabel="Kael"
              />
            ) : null}
            {liveStatus ? <WorkerV5KaelOrbBubble appearance={mode === 'normal' ? 'bare' : 'bubble'} body={liveStatus} speakerLabel="Kael" /> : null}
            {liveError ? <WorkerV5KaelOrbBubble appearance={mode === 'normal' ? 'bare' : 'bubble'} body={liveError} speakerLabel="Kael" /> : null}
          </View>
        ) : null}
      </ScrollView>
      {composer}
    </View>
  )
}

function workerKaelStreamingReplyText(reply: KaelResponseStreamState | null) {
  if (!reply || reply.status === 'idle') return ''
  return reply.blockOrder
    .flatMap((blockId) => {
      const text = reply.blocks[blockId]?.text ?? ''
      return text ? [text] : []
    })
    .join('\n\n')
}

function WorkerV5KaelOrbIntakeThread({
  activeJobContext = null,
  deal,
  fallbackJobIcon,
  language,
  onOpenOpportunity,
  reduceTransparency,
  serviceIcons,
}: {
  activeJobContext?: WorkerV5ActiveJobKaelContext | null
  deal: LocalDeal | null
  fallbackJobIcon: ImageSourcePropType
  language: AppLanguage
  onOpenOpportunity: () => void
  reduceTransparency: boolean
  serviceIcons: WorkerV5ServiceIconMap
}) {
  if (activeJobContext) {
    return (
      <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
        <WorkerV5KaelOrbBubble align="right" body={activeJobContext.request} speakerLabel={textByLanguage(language, 'Bạn', 'You')} />
        <WorkerV5KaelOrbBubble body={activeJobContext.reply} speakerLabel="Kael" />
      </View>
    )
  }

  const service = deal?.broadcast?.serviceType ?? deal?.draft.serviceType
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel || null
  const serviceLabel = service ? localizedServiceLabel(service, language) : null
  const hasOpportunity = Boolean(deal?.broadcast)
  if (!hasOpportunity) {
    return (
      <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
        <WorkerV5KaelOrbOpportunityResults
          deal={deal}
          fallbackJobIcon={fallbackJobIcon}
          language={language}
          onOpenOpportunity={onOpenOpportunity}
          reduceTransparency={reduceTransparency}
          serviceIcons={serviceIcons}
        />
      </View>
    )
  }
  const customerWorkerRequest = textByLanguage(
    language,
    `Tìm việc${serviceLabel ? ` ${serviceLabel}` : ''}${area ? ` tại ${area}` : ''} từ nguồn cơ hội thật.`,
    `Find${serviceLabel ? ` ${serviceLabel}` : ''} work${area ? ` in ${area}` : ''} from real opportunity sources.`,
  )
  const customerKaelReply = textByLanguage(
    language,
    'Kael đã đối chiếu kỹ năng, lịch trống, thời gian đến, độ tin cậy khách và thanh toán bảo vệ từ dữ liệu hiện có.',
    'Kael has compared skills, schedule, ETA, customer reliability, and protected payment from available data.',
  )

  return (
    <View style={styles.kaelOrbChatBody} testID="worker-v5-kael-intake-thread">
      <WorkerV5KaelOrbBubble align="right" body={customerWorkerRequest} speakerLabel={textByLanguage(language, 'Bạn', 'You')} />
      <WorkerV5KaelOrbBubble body={customerKaelReply} speakerLabel="Kael" />
      <WorkerV5KaelOrbOpportunityResults
        deal={deal}
        fallbackJobIcon={fallbackJobIcon}
        language={language}
        onOpenOpportunity={onOpenOpportunity}
        reduceTransparency={reduceTransparency}
        serviceIcons={serviceIcons}
      />
      {hasOpportunity ? (
        <WorkerV5KaelOrbBubble
          body={textByLanguage(
            language,
            'Đề xuất: mở cơ hội đầu tiên nếu dữ liệu thật đạt đủ điều kiện và không ảnh hưởng lịch còn lại.',
            'Suggestion: open the first opportunity if real data meets the conditions and does not affect the remaining schedule.',
          )}
          speakerLabel="Kael"
          strongFirstLine
        />
      ) : null}
    </View>
  )
}
