import { customerCopy } from './copy'
import { styles } from './styles'
import { customerBookingDiagnosisSurface, customerHistoryChatBubbleSurface, customerHistoryHeroSurface, customerHistoryMapViewportSurface, customerHistoryPanelSurface, customerHistoryPriceBoxSurface, customerMintPillSurface, customerOpaqueSurface } from './surface-styles'
import { type CustomerThemeTokens } from '@/components/customer/customer-theme'
import { KaelTextInput } from '@/components/ui/kael-primitives'
import { type JobMessageResponse } from '@/lib/api-types'
import { appCopy, type AppLanguage, localizedProblemLabel, localizedServiceLabel } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useJobChatThread } from '@/lib/use-job-chat-thread'
import { LOCAL_DEAL_ID, type LocalDeal, type LocalScopeChange, type LocalWorkflowSelectors, type WorkflowArtifactMode, workflowBlockedReasonLabel, type WorkflowPhaseContext } from '@nestscout/shared'
import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { MappedIcon, PrimaryButton, SecondaryButton, SubtleLiquidLight, V4TicketCell, formatVnd, localizedCustomerAreaLabel, localizedCustomerComplexityLabel, localizedCustomerGeneratedText, useCustomerTokens } from './ui'

const customerMapGlowStyle = {
  opacity: 0.34,
  transform: [{ translateX: -59 }, { scale: 1 }],
}

const customerMapPinStyle = {
  transform: [{ translateX: -9 }, { scale: 1 }],
}

function V4MapBackdrop({ presence = false }: { presence?: boolean }) {
  const tokens = useCustomerTokens()
  const route = presence ? 0.48 : 0
  const routeStyle = {
    opacity: 0.28 + route * 0.38,
    transform: [{ rotate: '-19deg' }, { scaleX: 0.72 + route * 0.28 }],
  }
  const vehicleStyle = {
    opacity: 0.72 + route * 0.24,
    transform: [{ translateX: -54 + route * 108 }, { translateY: -10 + route * 22 }, { scale: 0.96 }],
  }

  return (
    <View pointerEvents="none" style={styles.mapBackdrop}>
      <View style={[styles.mapGlow, { backgroundColor: tokens.aqua }, customerMapGlowStyle]} />
      {presence ? (
        <>
          <View style={[styles.mapRoute, { backgroundColor: tokens.primary }, routeStyle]} />
          <View style={[styles.mapRouteSoft, { backgroundColor: tokens.aqua }]} />
          <View style={[styles.mapVehicle, customerOpaqueSurface(tokens), vehicleStyle]}>
            <MappedIcon name="estimate" color={tokens.primary} accent={tokens.copper} />
          </View>
        </>
      ) : null}
      <View style={[styles.mapLine, styles.mapLineOne, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineTwo, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapLine, styles.mapLineThree, { backgroundColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomOne, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomTwo, { borderColor: tokens.borderStrong }]} />
      <View style={[styles.mapRoom, styles.mapRoomThree, { borderColor: tokens.borderStrong }]} />
      {presence ? <View style={[styles.mapPin, { backgroundColor: tokens.primary, borderColor: tokens.glassBorder }, customerMapPinStyle]} /> : null}
      <View style={[styles.mapNode, styles.mapNodeElectric, customerOpaqueSurface(tokens)]}>
        <MappedIcon name="boltPanel" color={tokens.primary} accent={tokens.copper} size={29} />
      </View>
      <View style={[styles.mapNode, styles.mapNodeWater, customerOpaqueSurface(tokens)]}>
        <MappedIcon name="waterPipe" color={tokens.primary} accent={tokens.aqua} size={29} />
      </View>
    </View>
  )
}

export function CustomerHistoryPriceEmptyPanel({
  copy,
  languageMode,
  onOpenKael,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  onOpenKael: () => void
  tokens: CustomerThemeTokens
}) {
  const priceBandLabel = languageMode === 'en' ? 'Price band' : 'Biên giá'
  const priceRows = [
    [priceBandLabel, appCopy[languageMode].common.noRequest],
    [languageMode === 'en' ? 'Urgency' : 'Độ khẩn', copy.history.kaelReviewing],
    [languageMode === 'en' ? 'Risk' : 'Rủi ro', copy.history.kaelReviewing],
    [languageMode === 'en' ? 'Kael' : 'Điều phối', copy.history.kaelReviewing],
  ] as const

  return (
    <>
      <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]} testID="customer-history-price-empty-kael-summary">
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <MappedIcon name="kael" color={tokens.primary} accent={tokens.copper} size={25} />
          <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price summary' : 'Kael tóm tắt giá'}
          </Text>
        </View>
        <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
          {languageMode === 'en'
            ? 'Kael summarizes price when the request has real details.'
          : 'Kael tóm tắt giá khi phiếu có đủ dữ liệu thật.'}
        </Text>
      </View>
      <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-price-empty-checklist">
        <SubtleLiquidLight testID="customer-history-tab-liquid-selector" variant="tab" />
        <View style={styles.sectionTitle}>
          <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price audit' : 'Kael kiểm chứng giá'}
          </Text>
          <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Evidence-based' : 'Dựa trên bằng chứng'}
          </Text>
        </View>
        <View style={styles.bookingGrid}>
          {priceRows.map(([label, value]) => (
            <View key={label} style={[styles.priceBox, customerHistoryPriceBoxSurface(tokens)]}>
              <Text style={[styles.priceBoxLabel, styles.activityPriceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
                {label}
              </Text>
              <Text style={[styles.priceBoxValue, styles.activityPriceBoxValue, { color: tokens.text }]} numberOfLines={2}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        <PrimaryButton label={copy.history.openPriceCheck} onPress={onOpenKael} compact testID="customer-history-price-open-kael" />
      </View>
    </>
  )
}

export function CustomerHistoryChatEmptyPanel({
  copy,
  languageMode,
  onOpenKael,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  languageMode: AppLanguage
  onOpenKael: () => void
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={[styles.historyThreadCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-chat-empty-thread">
      <View style={styles.hiddenMarker} testID="customer-history-chat-empty-evidence" />
      <View style={styles.historyChatFeed}>
        <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, 'kael')]} testID="customer-history-chat-feed-preview">
          <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
            Kael
          </Text>
          <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
            {copy.history.chatEmpty}
          </Text>
        </View>
        <View style={[styles.historyChatEmptyCue, customerMintPillSurface(tokens)]} testID="customer-history-chat-empty-cue">
          <Text style={[styles.historyChatCueText, { color: tokens.primary }]} numberOfLines={2}>
            {languageMode === 'en' ? 'The thread opens after a real ticket exists.' : 'Luồng chat mở sau khi có phiếu thật.'}
          </Text>
        </View>
      </View>
      <PrimaryButton label={languageMode === 'en' ? 'Open Kael chat' : 'Mở chat Kael'} onPress={onOpenKael} compact />
    </View>
  )
}

export function CustomerHistoryDoneMapEmptyPanel({
  copy,
  statusLabel,
  tokens,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  statusLabel?: string
  tokens: CustomerThemeTokens
}) {
  const visibleStatusLabel = statusLabel ?? copy.history.kaelReviewing

  return (
    <View style={[styles.presenceMapCard, styles.presenceMapCardCompact, customerHistoryPanelSurface(tokens)]} testID="customer-history-done-empty-timeline">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.presenceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {visibleStatusLabel}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, styles.presenceMapViewportCompact, customerHistoryMapViewportSurface(tokens)]}>
        <V4MapBackdrop />
        <View style={styles.presenceMapHud} testID="customer-history-presence-map-hud">
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {copy.history.presenceTitle}
            </Text>
          </View>
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {visibleStatusLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-presence-map-done-empty-no-worker-badge">
          <MappedIcon name="apartment" color={tokens.primary} accent={tokens.aqua} size={25} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
      </View>
    </View>
  )
}

export function CustomerCompletionEvidencePanel({
  completionStatusLabel,
  copy,
  deal,
  languageMode,
  tokens,
}: {
  completionStatusLabel: string
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const intakeMissingValue = languageMode === 'en' ? 'No intake media sent' : 'Không gửi ảnh ban đầu'
  const completionMissingValue = languageMode === 'en' ? 'Waiting for completion evidence' : 'Chờ bằng chứng hoàn tất'
  const notesMissingValue = languageMode === 'en' ? 'Waiting for worker notes' : 'Chờ ghi chú thợ'
  const intakePhotoCount = deal.draft.mediaCount
  const completionPhotoCount = deal.completionPhotoUrls?.length ?? 0
  const beforeValue = intakePhotoCount > 0
    ? languageMode === 'en'
      ? `${intakePhotoCount} intake photo${intakePhotoCount === 1 ? '' : 's'}`
      : `${intakePhotoCount} ảnh lúc gửi`
    : intakeMissingValue
  const afterValue = completionPhotoCount > 0
    ? languageMode === 'en'
      ? `${completionPhotoCount} completion photo${completionPhotoCount === 1 ? '' : 's'}`
      : `${completionPhotoCount} ảnh hoàn tất`
    : completionMissingValue
  const notesValue = deal.completionNotes?.trim() || notesMissingValue

  return (
    <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-completion-evidence-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.evidence}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {completionStatusLabel}
        </Text>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.evidenceBefore} value={beforeValue} variant="activity" />
        <V4TicketCell label={copy.history.evidenceAfter} value={afterValue} variant="activity" />
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={languageMode === 'en' ? 'Worker notes' : 'Ghi chú thợ'} value={notesValue} variant="activity" />
        <V4TicketCell label={copy.ticket.status} value={completionStatusLabel} variant="activity" />
      </View>
    </View>
  )
}

export function CustomerHistoryDoneHero({
  canSubmitReview,
  completionStatusLabel,
  copy,
  deal,
  hasCompletionOutcome,
  isCompleted,
  languageMode,
  onOpenChat,
  onOpenReview,
  tokens,
}: {
  canSubmitReview: boolean
  completionStatusLabel: string
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal | null
  hasCompletionOutcome: boolean
  isCompleted: boolean
  languageMode: AppLanguage
  onOpenChat: () => void
  onOpenReview: () => void
  tokens: CustomerThemeTokens
}) {
  const title = deal
    ? `${localizedServiceLabel(deal.draft.serviceType, languageMode)}`
    : languageMode === 'en'
      ? 'No completed job yet'
      : 'Chưa có công việc hoàn tất'
  const body = isCompleted && deal
    ? languageMode === 'en'
      ? 'Review the completion state, receipt map, and Kael decision timeline.'
      : 'Kiểm tra trạng thái hoàn tất, bản đồ biên nhận và timeline quyết định của Kael.'
    : hasCompletionOutcome && deal
      ? languageMode === 'en'
        ? 'Completion follows the synced gate; payment, chat, and review remain controlled by the current phase.'
        : 'Hoàn tất đang theo cổng đồng bộ; thanh toán, chat và đánh giá vẫn do giai đoạn hiện tại kiểm soát.'
    : deal
      ? canSubmitReview
        ? languageMode === 'en'
          ? 'Review is open after Kael completion decision.'
          : 'Đánh giá đã mở sau quyết định hoàn tất của Kael.'
        : languageMode === 'en'
          ? 'Completion details appear after Kael confirms the right step.'
          : 'Chi tiết hoàn tất chỉ hiện sau khi Kael xác nhận đúng bước.'
      : languageMode === 'en'
        ? 'Appears after real completion is updated.'
        : 'Chỉ hiện khi trạng thái hoàn tất được cập nhật.'
  const statusLabel = isCompleted
    ? copy.history.filters[3]
    : hasCompletionOutcome
      ? completionStatusLabel
    : deal
      ? canSubmitReview
        ? copy.history.review
        : copy.history.waitingWorkerDone
      : null
  const primaryLabel = canSubmitReview
    ? copy.history.review
    : isCompleted
      ? languageMode === 'en' ? 'View receipt' : 'Xem biên nhận'
      : deal
        ? copy.history.openPriceCheck
        : copy.history.newRequest
  const primaryAction = canSubmitReview ? onOpenReview : isCompleted ? onOpenReview : onOpenChat
  return (
    <View style={[styles.historyHeroPanel, styles.historyHeroPanelCompact, customerHistoryHeroSurface(tokens)]} testID="customer-history-done-hero">
      <SubtleLiquidLight testID="customer-history-done-hero-liquid" variant="rim" />
      <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      {statusLabel ? (
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {statusLabel}
        </Text>
      ) : null}
      <Text style={[styles.historyHeroBody, styles.historyHeroBodyCompact, { color: tokens.muted }]} numberOfLines={2}>
        {body}
      </Text>
      <View style={styles.historyHeroActions}>
        <PrimaryButton label={primaryLabel} onPress={primaryAction} compact />
        <SecondaryButton label={isCompleted ? (languageMode === 'en' ? 'View receipt' : 'Xem biên nhận') : copy.history.openPriceCheck} onPress={isCompleted ? onOpenReview : onOpenChat} compact tone="primary" />
      </View>
    </View>
  )
}

export function CustomerHistoryDoneTimeline({
  completionEvidenceMode,
  completionStatusLabel,
  isDone,
  languageMode,
  reviewMode,
  tokens,
}: {
  completionEvidenceMode: WorkflowArtifactMode
  completionStatusLabel: string
  isDone: boolean
  languageMode: AppLanguage
  reviewMode: WorkflowArtifactMode
  tokens: CustomerThemeTokens
}) {
  const isWorkerDone = ['review', 'final', 'done'].includes(completionEvidenceMode)
  const isCustomerDone = isWorkerDone && (['review', 'final', 'done', 'blocked'].includes(reviewMode) || isDone)
  const isReviewReady = reviewMode === 'review'
  const isReviewDone = reviewMode === 'final' || reviewMode === 'done' || isDone
  const isReviewActive = isReviewReady || isReviewDone
  const reviewMeta = languageMode === 'en'
    ? isReviewDone
      ? 'Review sent'
      : reviewMode === 'blocked'
        ? 'Waiting for payment decision'
        : isReviewReady
          ? 'Ready for service review'
          : 'Opens after Kael decision'
    : isReviewDone
      ? 'Đã gửi đánh giá'
      : reviewMode === 'blocked'
        ? 'Chờ quyết định thanh toán'
        : isReviewReady
          ? 'Sẵn sàng đánh giá dịch vụ'
          : 'Mở sau quyết định Kael'
  const rows: Array<readonly [string, string, boolean]> = languageMode === 'en'
    ? [
        ['Worker completed', isWorkerDone ? completionStatusLabel : 'Waiting for real completion state', isWorkerDone],
        ['Kael completion', isCustomerDone ? 'Completion decision recorded' : 'Decision pending', isCustomerDone],
        ['Review pending', reviewMeta, isReviewActive],
      ]
    : [
        ['Thợ hoàn tất', isWorkerDone ? completionStatusLabel : 'Chờ trạng thái hoàn tất thật', isWorkerDone],
        ['Kael hoàn tất', isCustomerDone ? 'Đã ghi quyết định hoàn tất' : 'Chờ quyết định', isCustomerDone],
        ['Chờ đánh giá', reviewMeta, isReviewActive],
      ]

  return (
    <View style={[styles.flowCard, styles.historyTimelineCard, styles.historyDoneTimelineCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-done-timeline">
      {rows.map(([title, meta, active]) => (
        <View key={title} style={[styles.timelineRow, styles.timelineRowDone]}>
          <View style={[styles.timelineDot, styles.timelineDotCompact, { backgroundColor: active ? tokens.primary : tokens.borderStrong }]} />
          <View style={styles.listCopy}>
            <Text style={[styles.timelineText, styles.timelineTextCompact, { color: tokens.text }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.listMeta, styles.listMetaCompact, { color: tokens.subtleText }]} numberOfLines={1}>
              {meta}
            </Text>
          </View>
        </View>
      ))}
    </View>
  )
}

export function CustomerHistoryReviewPanel({
  canSubmitReview,
  copy,
  onRatingChange,
  onSubmit,
  rating,
  reviewMode,
  selectors,
  tokens,
}: {
  canSubmitReview: boolean
  copy: (typeof customerCopy)[AppLanguage]
  onRatingChange: (rating: 1 | 2 | 3 | 4 | 5) => void
  onSubmit: () => void
  rating: 1 | 2 | 3 | 4 | 5 | null
  reviewMode: WorkflowArtifactMode
  selectors: LocalWorkflowSelectors
  tokens: CustomerThemeTokens
}) {
  const reviewValue = reviewMode === 'done' || reviewMode === 'final'
    ? copy.history.reviewed
    : canSubmitReview
      ? copy.history.open
      : copy.history.locked
  const paymentValue = selectors.currentBackendStatus === 'paid'
    ? copy.history.open
    : selectors.paymentLocked
      ? copy.history.locked
      : copy.history.open
  return (
    <View style={[styles.flowCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-review-panel">
      <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
        {copy.history.paymentReview}
      </Text>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.payment} value={paymentValue} variant="activity" />
        <V4TicketCell label={copy.history.review} value={reviewValue} variant="activity" />
      </View>
      {canSubmitReview ? (
        <View style={styles.workerActions} testID="customer-history-review-submit">
          <View style={styles.workerMetaRow}>
            {([1, 2, 3, 4, 5] as const).map((nextRating) => (
              <Pressable
                accessibilityLabel={copy.history.chooseStar(nextRating)}
                accessibilityRole="button"
                accessibilityState={{ selected: rating === nextRating }}
                key={nextRating}
                onPress={() => onRatingChange(nextRating)}
                style={[styles.reviewRatingButton, { backgroundColor: rating === nextRating ? tokens.primary : tokens.glassStrong }]}
              >
                <Text style={{ color: rating === nextRating ? tokens.primaryText : tokens.primary }} numberOfLines={1}>
                  {nextRating}
                </Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label={copy.history.submitReview} onPress={onSubmit} compact />
        </View>
      ) : null}
    </View>
  )
}

export function CustomerHistoryPricePanel({
  copy,
  deal,
  estimateLabel,
  languageMode,
  onOpenKael,
  originalEstimateLabel,
  scopeChange,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  estimateLabel: string
  languageMode: AppLanguage
  onOpenKael: () => void
  originalEstimateLabel: string
  scopeChange: LocalScopeChange | null
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const scopePrice =
    scopeChange?.priceMin && scopeChange.priceMax
      ? `${formatVnd(scopeChange.priceMin)} - ${formatVnd(scopeChange.priceMax)}`
      : copy.history.kaelReviewing
  const finalPriceLabel = deal.finalPrice && deal.finalPrice > 0
    ? formatVnd(deal.finalPrice)
    : copy.history.waitingWorkerPrice
  const problemFallback = localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const problemLabel = localizedCustomerGeneratedText(deal.estimate?.problemLabel, languageMode, problemFallback)
  const urgencyLabel = localizedCustomerComplexityLabel(deal.estimate?.complexity, languageMode, copy.history.kaelReviewing)
  const priceSummary = localizedCustomerGeneratedText(deal.estimate?.advisory, languageMode, copy.history.priceDisclaimer)
  const priceGrid = [
    [languageMode === 'en' ? 'Price band' : 'Biên giá', estimateLabel],
    [languageMode === 'en' ? 'Urgency' : 'Độ khẩn', urgencyLabel],
    [languageMode === 'en' ? 'Risk' : 'Rủi ro', problemLabel],
    [languageMode === 'en' ? 'Kael' : 'Điều phối', visibleStatusLabel],
  ] as const

  return (
    <View style={[styles.historyCheckPanel, customerHistoryPanelSurface(tokens)]} testID="customer-history-price-tab-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.filters[1]}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {languageMode === 'en' ? 'Evidence-based' : 'Dựa trên bằng chứng'}
        </Text>
      </View>
      <View style={[styles.bookingDiagnosisPanel, customerBookingDiagnosisSurface(tokens)]} testID="customer-history-price-kael-summary">
        <View style={[styles.bookingDiagnosisPill, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
          <MappedIcon name="kael" color={tokens.primary} accent={tokens.copper} size={25} />
          <Text style={[styles.bookingDiagnosisPillText, { color: tokens.primary }]} numberOfLines={1}>
            {languageMode === 'en' ? 'Kael price summary' : 'Kael tóm tắt giá'}
          </Text>
        </View>
        <Text style={[styles.bookingDiagnosisBody, { color: tokens.text }]} numberOfLines={4}>
            {priceSummary}
        </Text>
      </View>
      <View style={styles.bookingGrid} testID="customer-history-price-check-grid">
        {priceGrid.map(([label, value]) => (
          <View key={label} style={[styles.priceBox, customerHistoryPriceBoxSurface(tokens)]}>
            <Text style={[styles.priceBoxLabel, styles.activityPriceBoxLabel, { color: tokens.muted }]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={[styles.priceBoxValue, styles.activityPriceBoxValue, { color: tokens.text }]} numberOfLines={2}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.history.filters[1]} value={originalEstimateLabel} variant="activity" />
        <V4TicketCell label={copy.ticket.finalPrice} value={finalPriceLabel} variant="activity" />
      </View>
      {scopeChange ? (
        <View style={styles.twoCol}>
          <V4TicketCell label={copy.history.reason} value={scopeChange.reason ?? copy.history.workerNoReason} variant="activity" />
          <V4TicketCell label={copy.history.newPrice} value={scopePrice} variant="activity" />
        </View>
      ) : null}
      <Text style={[styles.historyDisclaimerText, { color: tokens.muted }]} numberOfLines={3} testID="customer-history-price-disclaimer">
        {copy.history.priceDisclaimer}
      </Text>
      <View style={styles.twoCol}>
        <PrimaryButton label={copy.history.openOrchestration} onPress={onOpenKael} compact testID="customer-history-price-open-kael" />
        <V4TicketCell label={copy.history.openOrchestration} testID="customer-history-price-kael-status" value={visibleStatusLabel} variant="activity" />
      </View>
    </View>
  )
}

export function CustomerHistoryChatPanel({
  copy,
  deal,
  languageMode,
  onOpenKael,
  phaseContext,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  onOpenKael: () => void
  phaseContext: WorkflowPhaseContext
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const { session } = useAuth()
  const [draft, setDraft] = useState('')
  const jobId = getCustomerChatJobId(deal)
  const chatSection = phaseContext.sections.find((section) => section.id === 'job_chat')
  const chatCanRead = Boolean(jobId && chatSection?.visible)
  const chatCanSend = Boolean(chatCanRead && !chatSection?.lockedReason)
  const jobChat = useJobChatThread(jobId, chatCanRead)
  const renderedMessages = jobChat.messages.map((message) => customerChatMessageFromJobMessage(message, session?.user.id ?? null, languageMode))
  const lockedReason = !chatCanSend && chatSection?.lockedReason
    ? workflowBlockedReasonLabel(chatSection.lockedReason, languageMode)
    : null
  const statusValue = visibleStatusLabel
  const issueValue = localizedProblemLabel(deal.draft.problemChips[0] ?? deal.draft.inferredProblemLabel, deal.draft.serviceType, languageMode)
  const descriptionValue = deal.draft.description.trim() || copy.history.chatEmpty
  const kaelSummaryValue = localizedCustomerGeneratedText(deal.estimate?.advisory, languageMode, copy.history.chatEmpty)
  const canSend = Boolean(chatCanSend && draft.trim() && !jobChat.sending)
  const sendLabel = languageMode === 'en' ? 'Send message' : 'Gửi tin nhắn'
  const inputLabel = chatCanSend
    ? languageMode === 'en' ? 'Message worker through Kael' : 'Nhắn với thợ qua Kael'
    : chatCanRead
      ? languageMode === 'en' ? 'Chat is read-only after the payment gate' : 'Chat chỉ còn đọc lại sau cổng thanh toán'
      : languageMode === 'en' ? 'Chat opens after Kael matches a worker' : 'Chat mở sau khi Kael ghép thợ'
  const sendErrorTitle = languageMode === 'en' ? 'Message not sent' : 'Chưa gửi được'
  const sendErrorBody = languageMode === 'en' ? 'Kael could not save this message. Try again.' : 'Kael chưa lưu được tin nhắn. Thử lại sau.'
  const submitMessage = async () => {
    const value = draft.trim()
    if (!value || !jobId || !chatCanSend) return
    const sent = await jobChat.send(value)
    if (!sent) {
      Alert.alert(sendErrorTitle, sendErrorBody)
      return
    }
    setDraft('')
  }

  return (
    <View style={[styles.historyThreadCard, customerHistoryPanelSurface(tokens)]} testID="customer-history-chat-tab-panel">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.filters[2]}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          Kael
        </Text>
      </View>
      <View style={styles.hiddenMarker} testID="customer-history-chat-empty-evidence" />
      <View style={styles.historyChatFeed}>
        {renderedMessages.length > 0 ? renderedMessages.map((message) => (
          <View key={message.id} style={[styles.chatPreviewCard, message.mine ? styles.chatPreviewUserBubble : styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, message.system ? 'kael' : message.mine ? 'user' : 'other')]} testID={message.system ? 'customer-history-chat-kael-message' : message.mine ? 'customer-history-chat-user-message' : 'customer-history-chat-worker-message'}>
            <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
              {message.who}
            </Text>
            <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={4}>
              {message.text}
            </Text>
          </View>
        )) : (
          <>
            <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, 'kael')]} testID="customer-history-chat-feed-preview">
              <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                Kael
              </Text>
              <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
                {languageMode === 'en'
                  ? `Request status: ${statusValue}. Problem: ${issueValue}.`
                  : `Trạng thái: ${statusValue}. Vấn đề: ${issueValue}.`}
              </Text>
            </View>
            <View style={[styles.chatPreviewCard, styles.chatPreviewUserBubble, customerHistoryChatBubbleSurface(tokens, 'user')]} testID="customer-history-chat-user-bubble">
              <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                {languageMode === 'en' ? 'Customer' : 'Khách'}
              </Text>
              <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
                {descriptionValue}
              </Text>
            </View>
            <View style={[styles.chatPreviewCard, styles.chatPreviewKaelBubble, customerHistoryChatBubbleSurface(tokens, 'kael')]} testID="customer-history-chat-kael-bubble">
              <Text style={[styles.bubbleKicker, { color: tokens.primary }]} numberOfLines={1}>
                Kael
              </Text>
              <Text style={[styles.homeTrustBody, { color: tokens.text }]} numberOfLines={3}>
                {jobChat.loading ? (languageMode === 'en' ? 'Loading thread...' : 'Đang tải luồng chat...') : kaelSummaryValue}
              </Text>
            </View>
          </>
        )}
      </View>
      <View style={[styles.composer, styles.historyChatComposer, customerMintPillSurface(tokens)]} testID="customer-history-chat-composer">
        <KaelTextInput
          accessibilityLabel={inputLabel}
          editable={chatCanSend}
          onChangeText={setDraft}
          onSubmitEditing={submitMessage}
          placeholder={inputLabel}
          placeholderTextColor={tokens.subtleText}
          returnKeyType="send"
          selectionColor={tokens.primary}
          style={[styles.composerInput, { color: tokens.text }]}
          testID="customer-history-chat-input"
          value={draft}
        />
        <Pressable
          accessibilityLabel={sendLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={submitMessage}
          style={({ pressed }) => [
            styles.sendButton,
            { backgroundColor: canSend ? tokens.primary : tokens.border },
            pressed ? styles.pressed : null,
          ]}
          testID="customer-history-chat-send"
        >
          <MappedIcon name="send" color={canSend ? tokens.primaryText : tokens.subtleText} accent={tokens.aqua} />
        </Pressable>
      </View>
      {lockedReason ? (
        <Text style={[styles.sectionMeta, { color: tokens.muted }]} testID="customer-history-chat-locked-reason">
          {lockedReason}
        </Text>
      ) : null}
      <PrimaryButton label={copy.history.openPriceCheck} onPress={onOpenKael} compact />
    </View>
  )
}

function getCustomerChatJobId(deal: LocalDeal) {
  const jobId = deal.broadcast?.jobId ?? deal.id
  if (!jobId || jobId === LOCAL_DEAL_ID) return null
  return jobId
}

function customerChatMessageFromJobMessage(message: JobMessageResponse, currentUserId: string | null, languageMode: AppLanguage) {
  const system = message.sender_role === 'kael'
  const mine = Boolean(currentUserId && message.sender_id === currentUserId)
  const who = system
    ? 'Kael'
    : message.sender_role === 'customer'
      ? languageMode === 'en' ? 'Customer' : 'Khách'
      : languageMode === 'en' ? 'Worker' : 'Thợ'

  return {
    id: message.id,
    mine,
    system,
    text: message.content,
    who,
  }
}

export function CustomerCompletionPresenceMap({
  copy,
  deal,
  languageMode,
  tokens,
  visibleStatusLabel,
}: {
  copy: (typeof customerCopy)[AppLanguage]
  deal: LocalDeal
  languageMode: AppLanguage
  tokens: CustomerThemeTokens
  visibleStatusLabel: string
}) {
  const addressLabel = localizedCustomerAreaLabel(deal.draft.addressLabel ?? deal.draft.districtLabel, languageMode, copy.ticket.unknown)

  return (
    <View style={[styles.presenceMapCard, customerHistoryPanelSurface(tokens)]} testID="customer-presence-map-done">
      <View style={styles.sectionTitle}>
        <Text style={[styles.cardHeadline, { color: tokens.text }]} numberOfLines={1}>
          {copy.history.presenceTitle}
        </Text>
        <Text style={[styles.sectionMeta, { color: tokens.primary }]} numberOfLines={1}>
          {visibleStatusLabel}
        </Text>
      </View>
      <View style={[styles.presenceMapViewport, customerHistoryMapViewportSurface(tokens)]}>
        <V4MapBackdrop presence />
        <View style={styles.presenceMapHud} testID="customer-history-presence-map-hud">
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {copy.history.presenceTitle}
            </Text>
          </View>
          <View style={[styles.presenceMapControl, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <Text style={[styles.presenceMapControlText, { color: tokens.primary }]} numberOfLines={1}>
              {visibleStatusLabel}
            </Text>
          </View>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeHome, { backgroundColor: tokens.service, borderColor: tokens.border }]}>
          <MappedIcon name="apartment" color={tokens.primary} accent={tokens.aqua} size={25} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceHome}
          </Text>
        </View>
        <View style={[styles.presenceBadge, styles.presenceBadgeWorker, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
          <MappedIcon name="check" color={tokens.primary} accent={tokens.copper} />
          <Text style={[styles.presenceBadgeText, { color: tokens.text }]} numberOfLines={1}>
            {copy.history.presenceWorker}
          </Text>
        </View>
      </View>
      <View style={styles.twoCol}>
        <V4TicketCell label={copy.ticket.area} value={addressLabel} variant="activity" />
        <V4TicketCell label={copy.ticket.status} value={visibleStatusLabel} variant="activity" />
      </View>
    </View>
  )
}
