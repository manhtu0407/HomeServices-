import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import type { LocalDeal } from '@nestscout/shared'
import { color } from '@/design/theme'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerBroadcast } from '@/lib/api-types'
import { workerBroadcastToSnapshot } from '@/lib/frontend-workflow/snapshots'
import { firstRouteParam, routeForWorkerV5Screen } from '../dock/routing'
import { requireWorkerV5Screen } from '../dock/screens'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5DisplayCode } from '../ui/screen-labels'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import { buildWorkerV5AcceptEtaSignal } from '../ui/route'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import {
  buildWorkerV5OfferAddressRows,
  buildWorkerV5OfferPriceRows,
  buildWorkerV5OfferRequestRows,
  type WorkerV5OfferDetailRow,
} from './offer'
import { buildWorkerV5AcceptReviewChecks, workerV5CanAcceptOpenOffer } from './acceptance'
import { WorkerBroadcastProposalForm } from './worker-broadcast-proposal-form'
import { WorkerStageTwoOfferWorkart } from './worker-jobs-stage-two-workart'
import { prototypeStyles, stageTwoStyles } from './worker-jobs-zip-prototype-styles'
import { stageTwoCardTokens, type StageTwoPillTone } from './worker-jobs-zip-prototype-style-stage-two'
import {
  Text,
  WorkerJobsLegacyPrototypeMetaIcon,
  WorkerJobsStageTwoAction,
  WorkerJobsStageTwoCard,
  WorkerJobsStageTwoIcon,
  WorkerJobsStageTwoRow,
  WorkerJobsStageTwoSection,
  type WorkerJobsLegacyPrototypeBodyProps,
  type WorkerJobsLegacyPrototypePreviewJob,
  type WorkerJobsLegacyPrototypeRuntime,
  type WorkerJobsStageTwoGlyphName,
  type WorkerJobsStageTwoScale,
  useWorkerJobsStageTwoScale,
  workerJobsLegacyPrototypePreviewJob,
} from './worker-jobs-zip-prototype-shared'
import { WorkerMatchingDeliveryStatus } from './worker-matching-delivery-status'

export { WorkerJobsLegacyPrototypeRouteEtaBody } from './worker-jobs-zip-prototype-route-stage'

export function WorkerJobsLegacyPrototypeOpportunityCard({
  currentDeal,
  language,
  onSelect,
  previewJob,
  reduceTransparency,
  selected,
  showPrice = true,
  testID = 'worker-v5-opportunity-card',
}: {
  currentDeal: LocalDeal | null
  language: AppLanguage
  onSelect?: () => void
  previewJob?: WorkerJobsLegacyPrototypePreviewJob | null
  reduceTransparency: boolean
  selected: boolean
  showPrice?: boolean
  testID?: string
}) {
  const isIncoming = currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent'
  const service = currentDeal ? localizedServiceLabel(currentDeal.draft.serviceType, language) : textByLanguage(language, 'Cơ hội công việc', 'Job opportunity')
  const area = currentDeal?.broadcast?.generalArea || currentDeal?.draft.districtLabel
  const title = currentDeal ? service : previewJob?.title[language] || textByLanguage(language, 'Chưa có việc phù hợp', 'No suitable job yet')
  const meta = currentDeal
    ? area || textByLanguage(language, 'Khu vực sẽ hiện khi được xác minh', 'Area appears after verification')
    : previewJob?.meta[language] || textByLanguage(language, 'Kael sẽ gửi khi có việc.', 'Kael will send a job when one is available.')
  const status = selected
    ? textByLanguage(language, 'Đã chọn', 'Selected')
    : currentDeal
      ? workerOpportunityStatus(currentDeal, language, isIncoming)
      : previewJob?.status[language] || textByLanguage(language, 'Chưa có trạng thái thật', 'No real status yet')
  const displayTime = currentDeal ? workerV5TimeChoiceLabel(currentDeal.draft.timeChoice, language, currentDeal.scheduledAt) : previewJob?.time[language] || null
  const displayPrice = currentDeal?.broadcast?.estimatedPriceLabel || currentDeal?.estimate?.priceRangeLabel || previewJob?.price[language] || null
  const themeMode = useWorkerThemeMode()
  const tokens = getWorkerThemeTokens(themeMode)
  const surfaceColor = reduceTransparency ? tokens.base : tokens.raised
  const workartPanelColor = tokens.mode === 'dark' ? tokens.ghost : '#E8F5F1'
  const cardTestID = onSelect ? testID : 'worker-v5-opportunity-empty-card'
  const copy = (
    <View style={prototypeStyles.opportunityCardCopy}>
      <Text numberOfLines={2} style={prototypeStyles.opportunityCardTitle}>{title}</Text>
      <Text numberOfLines={2} style={prototypeStyles.opportunityCardMeta}>{meta}</Text>
      <View style={prototypeStyles.opportunityMetaRow}>
        <View style={prototypeStyles.opportunityMetaItem}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="status" />
          <Text style={[prototypeStyles.opportunityMetaText, selected && prototypeStyles.opportunityMetaTextSelected]}>{status}</Text>
        </View>
        {displayTime ? (
          <>
            <View style={prototypeStyles.opportunityMetaItem}>
              <WorkerJobsLegacyPrototypeMetaIcon kind="time" />
              <Text style={prototypeStyles.opportunityMetaText}>{displayTime}</Text>
            </View>
          </>
        ) : null}
      </View>
      {showPrice && displayPrice ? (
        <View style={prototypeStyles.opportunityMetaItem}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="price" />
          <Text style={[prototypeStyles.opportunityMetaText, prototypeStyles.opportunityPriceText]}>{displayPrice}</Text>
        </View>
      ) : null}
    </View>
  )
  const workartView = (
    <WorkerStageTwoOfferWorkart
      artworkTestID={`${cardTestID}-workart`}
      deal={currentDeal}
      panelColor={workartPanelColor}
      panelTestID={`${cardTestID}-workart-panel`}
      previewJob={previewJob ?? null}
      reduceTransparency={reduceTransparency}
      surfaceColor={surfaceColor}
    />
  )
  const cardSurfaceStyle = { backgroundColor: surfaceColor, borderColor: tokens.borderStrong }

  if (!onSelect) {
    return <View style={[prototypeStyles.opportunityCard, cardSurfaceStyle]} testID="worker-v5-opportunity-empty-card">{workartView}{copy}</View>
  }

  return (
    <Pressable
      accessibilityLabel={textByLanguage(language, `Chọn công việc ${service}`, `Select ${service} job`)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [prototypeStyles.opportunityCard, cardSurfaceStyle, selected && { borderColor: color.brand.primary, borderWidth: 2 }, pressed && { opacity: 0.88 }]}
      testID={testID}
    >
      {workartView}{copy}
    </Pressable>
  )
}

function workerOpportunityStatus(currentDeal: LocalDeal, language: AppLanguage, isIncoming: boolean) {
  if (isIncoming) return textByLanguage(language, 'Cơ hội gửi tới bạn', 'Opportunity sent to you')
  switch (currentDeal.status) {
    case 'broadcasting':
      return textByLanguage(language, 'Đang đối soát gửi việc', 'Reconciling delivery')
    case 'awaiting_customer_confirm':
      return textByLanguage(language, 'Chờ khách xác nhận', 'Waiting for customer')
    case 'worker_matched':
      return textByLanguage(language, 'Đã khớp với khách', 'Matched with customer')
    case 'worker_on_way':
      return textByLanguage(language, 'Đang di chuyển', 'On the way')
    case 'arrived':
      return textByLanguage(language, 'Thợ đã đến', 'Worker arrived')
    case 'inspecting':
      return textByLanguage(language, 'Đang khảo sát', 'Inspecting')
    case 'repairing':
      return textByLanguage(language, 'Đang thực hiện', 'In progress')
    case 'scope_change_pending':
      return textByLanguage(language, 'Chờ duyệt đổi phạm vi', 'Scope change pending')
    case 'completed_by_worker':
      return textByLanguage(language, 'Chờ khách xác nhận hoàn tất', 'Waiting for completion confirmation')
    case 'confirmed_by_customer':
    case 'payment_pending':
      return textByLanguage(language, 'Chờ thanh toán', 'Payment pending')
    case 'paid':
    case 'reviewed':
      return textByLanguage(language, 'Đã hoàn tất', 'Completed')
    default:
      return textByLanguage(language, 'Chưa có trạng thái thật', 'No real status yet')
  }
}

function broadcastDeal(broadcast: WorkerBroadcast): LocalDeal {
  const snapshot = workerBroadcastToSnapshot(broadcast)
  return {
    backendStatus: 'broadcasting',
    broadcast: {
      ...snapshot,
      fullAddressLabel: null,
      fullAddressVisible: false,
      prebrief: snapshot.prebrief ?? [],
    },
    createdAt: broadcast.sent_at ?? broadcast.expires_at ?? '',
    draft: {
      addressLabel: snapshot.generalArea,
      description: broadcast.scope_summary ?? broadcast.problem_summary ?? '',
      districtLabel: snapshot.generalArea,
      inferredProblemLabel: null,
      mediaCount: broadcast.media_count,
      needsServiceChoice: false,
      problemChips: broadcast.problem_summary ? [broadcast.problem_summary] : [],
      serviceType: broadcast.service_type,
      source: 'booking',
      timeChoice: 'now',
      unsupportedServiceLabel: null,
    },
    estimate: null,
    finalPrice: null,
    id: broadcast.job_id,
    matchingState: null,
    payment: null,
    scheduledAt: broadcast.scheduled_at,
    scopeChange: null,
    status: 'broadcasting',
  }
}

function activeInboxBroadcasts(broadcasts: WorkerBroadcast[]) {
  const now = Date.now()
  return broadcasts
    .filter((broadcast) => {
      const expiresAt = broadcast.expires_at ? Date.parse(broadcast.expires_at) : Number.NaN
      const quoteExpiresAt = Date.parse(broadcast.original_scope_price_quote?.expires_at ?? '')
      const requiresQuote = !broadcast.proposal_action || broadcast.proposal_action === 'accept_priced_offer'
      return broadcast.status === 'sent'
        && Number.isFinite(expiresAt)
        && expiresAt > now
        && (!requiresQuote || (Number.isFinite(quoteExpiresAt) && quoteExpiresAt > now))
    })
    .sort((left, right) => {
      const expiryDifference = Date.parse(left.expires_at ?? '') - Date.parse(right.expires_at ?? '')
      if (expiryDifference !== 0) return expiryDifference
      const sentDifference = Date.parse(right.sent_at ?? '') - Date.parse(left.sent_at ?? '')
      return sentDifference !== 0 ? sentDifference : left.broadcast_id.localeCompare(right.broadcast_id)
    })
    .slice(0, 20)
}

const STAGE_TWO_REQUEST_GLYPHS = ['bubble', 'wrench', 'photo'] as const
const STAGE_TWO_ADDRESS_GLYPHS = ['home', 'user'] as const
const STAGE_TWO_PRICE_GLYPHS = ['tag', 'banknote', 'wallet', 'check'] as const
const STAGE_TWO_READY_GLYPHS = ['envelope', 'shieldCheck', 'lock', 'receipt'] as const

function WorkerJobsStageTwoInfoGroup({ description, glyph, rowGlyphs, rows, scale, testID, title, tone }: {
  description: string
  glyph: WorkerJobsStageTwoGlyphName
  rowGlyphs: readonly WorkerJobsStageTwoGlyphName[]
  rows: readonly WorkerV5OfferDetailRow[]
  scale: WorkerJobsStageTwoScale
  testID: string
  title: string
  tone: StageTwoPillTone
}) {
  return (
    <WorkerJobsStageTwoSection
      description={description}
      glyph={glyph}
      rows={rows.map((row, index) => ({
        glyph: rowGlyphs[index] ?? rowGlyphs[rowGlyphs.length - 1],
        key: `${row.title}-${index}`,
        meta: row.meta,
        status: row.status,
        title: row.title,
        tone,
      }))}
      scale={scale}
      testID={testID}
      title={title}
    />
  )
}

function WorkerJobsLegacyPrototypeOpportunityActions({
  language,
  onKael,
  onPrimary,
  primary,
  primaryDisabled,
  reduceTransparency,
}: {
  language: AppLanguage
  onKael: () => void
  onPrimary?: () => void
  primary: string
  primaryDisabled: boolean
  reduceTransparency: boolean
}) {
  return (
    <View accessibilityRole="summary" style={prototypeStyles.opportunityActions} testID="worker-v5-action-rail">
      <Pressable
        accessibilityLabel={textByLanguage(language, 'Kael nhận việc', 'Kael job intake')}
        accessibilityRole="button"
        onPress={onKael}
        style={({ pressed }) => [prototypeStyles.opportunityAction, prototypeStyles.opportunityActionSecondary, reduceTransparency && { backgroundColor: color.mint.white }, pressed && { opacity: 0.84 }]}
        testID="worker-v5-opportunity-kael-action"
      >
        <Text style={[prototypeStyles.opportunityActionText, prototypeStyles.opportunityActionSecondaryText]}>{textByLanguage(language, 'Kael nhận việc', 'Kael job intake')}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={primary}
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryDisabled }}
        disabled={primaryDisabled}
        onPress={onPrimary}
        style={({ pressed }) => [prototypeStyles.opportunityAction, prototypeStyles.opportunityActionPrimary, primaryDisabled && prototypeStyles.opportunityActionDisabled, pressed && !primaryDisabled && { opacity: 0.84 }]}
        testID="worker-v5-primary-action"
      >
        <Text style={[prototypeStyles.opportunityActionText, primaryDisabled ? prototypeStyles.opportunityActionDisabledText : prototypeStyles.opportunityActionPrimaryText]}>{primary}</Text>
      </Pressable>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeOpportunityInboxBody({
  language,
  prototypeMode,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  prototypeMode: boolean
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const params = useLocalSearchParams<{
    ns_audit_role?: string | string[]
    ns_worker_jobs_variant?: string | string[]
    ns_worker_lang?: string | string[]
    ns_worker_prototype?: string | string[]
  }>()
  const router = useRouter()
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const deal = runtime.state.deal
  const currentDeal = workerV5JobsDestinationScreenId(deal) === '2.1-opportunity-inbox' ? null : deal
  const cachedBroadcasts = runtime.workerBroadcasts ?? []
  const inboxBroadcasts = activeInboxBroadcasts(cachedBroadcasts)
  const previewJob = prototypeMode && !currentDeal && firstRouteParam(params.ns_worker_jobs_variant) === 'available' ? workerJobsLegacyPrototypePreviewJob : null
  const displayedJobId = currentDeal?.id ?? previewJob?.id ?? null
  const isIncoming = Boolean(previewJob) || (currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent')
  const proposalOpportunity = runtime.workerProposalOpportunity?.broadcastId === currentDeal?.broadcast?.broadcastId
    ? runtime.workerProposalOpportunity
    : null
  const isPricedOffer = proposalOpportunity?.proposalAction === 'accept_priced_offer'
  const isSelected = selectedMissionId === displayedJobId
  const selectedInboxBroadcast = inboxBroadcasts.find((broadcast) => broadcast.broadcast_id === selectedMissionId)
  const selectedProposalAction = selectedInboxBroadcast?.proposal_action ?? proposalOpportunity?.proposalAction
  const routeParams = {
    ns_audit_role: params.ns_audit_role,
    ns_worker_lang: params.ns_worker_lang,
    ns_worker_prototype: params.ns_worker_prototype,
  }
  const openCurrentWork = () => {
    if (inboxBroadcasts.length > 0 && selectedMissionId) {
      if (!runtime.actions.workerSelectBroadcast(selectedMissionId)) {
        void runtime.actions.workerRefresh()
        return
      }
      router.replace(routeForWorkerV5Screen(requireWorkerV5Screen('2.2-offer-detail'), routeParams) as never)
      return
    }
    if (currentDeal) {
      router.replace(routeForWorkerV5Screen(requireWorkerV5Screen(workerV5JobsDestinationScreenId(currentDeal)), routeParams) as never)
      return
    }
    if (previewJob) router.replace(routeForWorkerV5Screen(requireWorkerV5Screen('2.2-offer-detail'), routeParams) as never)
  }
  const openKaelIntake = () => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)

  useEffect(() => {
    const receipt = runtime.workerMatchingDelivery?.receipt
    if (prototypeMode || !receipt || !['queued', 'delivered'].includes(receipt.state)) return
    void runtime.actions.workerMarkBroadcastSeen(receipt.broadcast_id)
  }, [prototypeMode, runtime.actions, runtime.workerMatchingDelivery?.receipt])

  return (
    <View style={prototypeStyles.opportunityInboxNew} testID="worker-v5-opportunity-inbox-handoff">
      {inboxBroadcasts.length > 0 ? inboxBroadcasts.map((broadcast) => {
        const selected = selectedMissionId === broadcast.broadcast_id
        return (
          <WorkerJobsLegacyPrototypeOpportunityCard
            currentDeal={broadcastDeal(broadcast)}
            key={broadcast.broadcast_id}
            language={language}
            onSelect={() => {
              if (runtime.actions.workerSelectBroadcast(broadcast.broadcast_id)) {
                setSelectedMissionId(broadcast.broadcast_id)
              } else {
                void runtime.actions.workerRefresh()
              }
            }}
            reduceTransparency={reduceTransparency}
            selected={selected}
            showPrice={!broadcast.proposal_action || broadcast.proposal_action === 'accept_priced_offer'}
            testID={`worker-v5-opportunity-card-${broadcast.broadcast_id}`}
          />
        )
      }) : (
        <WorkerJobsLegacyPrototypeOpportunityCard currentDeal={currentDeal} language={language} onSelect={displayedJobId ? () => setSelectedMissionId(displayedJobId) : undefined} previewJob={previewJob} reduceTransparency={reduceTransparency} selected={isSelected} showPrice={!proposalOpportunity || isPricedOffer} />
      )}
      {!prototypeMode && runtime.workerMatchingDelivery ? (
        <WorkerMatchingDeliveryStatus
          confirmedRecipientCount={runtime.workerMatchingDelivery.confirmedRecipientCount}
          language={language}
          receipt={runtime.workerMatchingDelivery.receipt}
        />
      ) : null}
      {(inboxBroadcasts.length > 0 || displayedJobId) && !selectedMissionId ? (
        <Text style={prototypeStyles.opportunitySelectionHintNew} testID="worker-v5-opportunity-selection-hint">
          {textByLanguage(language, 'Chọn công việc để xem chi tiết.', 'Select the job to review details.')}
        </Text>
      ) : null}
      <WorkerJobsLegacyPrototypeOpportunityActions
        language={language}
        onKael={openKaelIntake}
        onPrimary={selectedMissionId || isSelected ? openCurrentWork : undefined}
        primary={selectedMissionId || isSelected
          ? selectedProposalAction === 'submit_rfq_proposal'
            ? textByLanguage(language, 'Xem & gửi báo giá', 'Review and quote')
            : selectedProposalAction === 'submit_inspection_scope'
              ? textByLanguage(language, 'Xem & gửi phạm vi', 'Review scope')
              : inboxBroadcasts.length > 0 || isIncoming
                ? textByLanguage(language, 'Xem & nhận việc', 'Review and accept')
            : textByLanguage(language, 'Tiếp tục công việc', 'Continue work')
          : textByLanguage(language, 'Chọn công việc để tiếp tục', 'Select a job to continue')}
        primaryDisabled={inboxBroadcasts.length > 0 ? !selectedMissionId : !displayedJobId || !isSelected}
        reduceTransparency={reduceTransparency}
      />
    </View>
  )
}

function WorkerJobsLegacyPrototypeOfferSummary({
  deal,
  language,
  previewJob,
  reduceTransparency,
  tokens,
  showPrice = true,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  previewJob: WorkerJobsLegacyPrototypePreviewJob | null
  reduceTransparency: boolean
  tokens: ReturnType<typeof getWorkerThemeTokens>
  showPrice?: boolean
}) {
  const service = deal
    ? localizedServiceLabel(deal.draft.serviceType, language)
    : previewJob?.title[language] || textByLanguage(language, 'Chưa có đề nghị', 'No offer yet')
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel || previewJob?.meta[language]
  const displayTime = deal
    ? workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt)
    : previewJob?.time[language]
  const displayPrice = deal?.broadcast?.estimatedPriceLabel || deal?.estimate?.priceRangeLabel || previewJob?.price[language]
  return (
    <View style={[stageTwoStyles.hero, { backgroundColor: reduceTransparency ? tokens.base : tokens.raised, borderColor: tokens.borderStrong }]} testID="worker-v5-offer-detail-summary-card">
      <WorkerStageTwoOfferWorkart
        deal={deal}
        panelColor={tokens.mode === 'dark' ? tokens.ghost : '#E8F5F1'}
        previewJob={previewJob}
        reduceTransparency={reduceTransparency}
        surfaceColor={reduceTransparency ? tokens.base : tokens.raised}
      />
      <View style={stageTwoStyles.heroCopy}>
        <Text numberOfLines={1} style={[stageTwoStyles.heroService, { color: tokens.text }]}>{service}</Text>
        <Text numberOfLines={2} style={[stageTwoStyles.heroArea, { color: tokens.muted }]}>{area || textByLanguage(language, 'Khu vực sẽ hiện sau khi xác minh', 'Area appears after verification')}</Text>
        <View style={stageTwoStyles.heroMeta}>
          <View style={stageTwoStyles.heroMetaItem}>
            <WorkerJobsStageTwoIcon color={tokens.primary} name="time" />
            <Text numberOfLines={1} style={[stageTwoStyles.heroMetaText, { color: tokens.muted }]}>{displayTime || textByLanguage(language, 'Chưa có khung giờ', 'No time yet')}</Text>
          </View>
        </View>
        {showPrice && displayPrice ? (
          <View style={stageTwoStyles.heroMetaItem}>
            <WorkerJobsStageTwoIcon color={tokens.primary} name="price" />
            <Text numberOfLines={1} style={[stageTwoStyles.heroPrice, { color: tokens.muted }]}>{displayPrice}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeOfferInfoGroup({
  rows,
  testID,
  title,
}: {
  rows: readonly WorkerV5OfferDetailRow[]
  testID: string
  title: string
}) {
  return (
    <View style={prototypeStyles.offerInfoGroup} testID={testID}>
      <View style={prototypeStyles.offerInfoGroupHeader}>
        <Text style={prototypeStyles.offerInfoGroupTitle}>{title}</Text>
      </View>
      {rows.map((row, index) => (
        <View key={`${row.title}-${index}`} style={prototypeStyles.offerInfoRow}>
          <View accessibilityElementsHidden style={prototypeStyles.offerInfoMark} />
          <View style={prototypeStyles.offerInfoRowCopy}>
            <Text numberOfLines={2} style={prototypeStyles.offerInfoRowTitle}>{row.title}</Text>
            <Text numberOfLines={2} style={prototypeStyles.offerInfoRowMeta}>{row.meta}</Text>
          </View>
          <Text numberOfLines={2} style={prototypeStyles.offerInfoRowStatus}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerJobsLegacyPrototypeOfferDetailBody({
  actionBusy,
  language,
  prototypeMode,
  reduceTransparency,
  runWorkerAction,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  prototypeMode: boolean
  reduceTransparency: boolean
  runWorkerAction: WorkerJobsLegacyPrototypeBodyProps['runWorkerAction']
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const themeMode = useWorkerThemeMode()
  const tokens = getWorkerThemeTokens(themeMode)
  const scale = useWorkerJobsStageTwoScale(tokens)
  const params = useLocalSearchParams<{
    ns_audit_role?: string | string[]
    ns_worker_jobs_variant?: string | string[]
    ns_worker_lang?: string | string[]
    ns_worker_prototype?: string | string[]
  }>()
  const router = useRouter()
  const deal = runtime.state.deal
  const previewJob = prototypeMode && !deal && firstRouteParam(params.ns_worker_jobs_variant) === 'available' ? workerJobsLegacyPrototypePreviewJob : null
  const proposalOpportunity = runtime.workerProposalOpportunity?.broadcastId === deal?.broadcast?.broadcastId
    ? runtime.workerProposalOpportunity
    : null
  const proposalAction = proposalOpportunity?.proposalAction === 'submit_rfq_proposal'
    || proposalOpportunity?.proposalAction === 'submit_inspection_scope'
    ? proposalOpportunity.proposalAction
    : null
  const isPricedOffer = proposalOpportunity?.proposalAction === 'accept_priced_offer'
  const checks = buildWorkerV5AcceptReviewChecks(deal, runtime.workerProfile, language)
  const canAccept = isPricedOffer && workerV5CanAcceptOpenOffer(deal, runtime.state.workerGate)
  const canDecline = deal?.status === 'broadcasting'
    && deal.broadcast?.status === 'sent'
    && !proposalOpportunity?.result
  const addressRows = buildWorkerV5OfferAddressRows(deal, language)
  const priceRows = buildWorkerV5OfferPriceRows(deal, language).map((row) => deal?.broadcast?.priceQuote
    ? row
    : {
        ...row,
        meta: textByLanguage(language, 'Cần báo giá chính xác để nhận việc.', 'An exact quote is needed to accept this job.'),
      })
  const requestRows = buildWorkerV5OfferRequestRows(deal, language)
  const eta = buildWorkerV5AcceptEtaSignal(deal, language)
  const routeParams = {
    ns_audit_role: params.ns_audit_role,
    ns_worker_lang: params.ns_worker_lang,
    ns_worker_prototype: params.ns_worker_prototype,
  }
  const declineOffer = () => void runWorkerAction(
    async () => {
      const ok = await runtime.actions.workerDeclineBroadcast()
      if (ok) router.replace(routeForWorkerV5Screen(requireWorkerV5Screen('2.1-opportunity-inbox'), routeParams) as never)
      return ok
    },
    { navigateOnSuccess: false },
  )
  const confirmAccept = () => void runWorkerAction(() => runtime.actions.workerAcceptBroadcast(deal?.broadcast?.jobId))

  return (
    <View onLayout={scale.onLayout} style={stageTwoStyles.section} testID="worker-v5-offer-detail-handoff">
      <WorkerJobsLegacyPrototypeOfferSummary deal={deal} language={language} previewJob={previewJob} reduceTransparency={reduceTransparency} showPrice={isPricedOffer || !proposalOpportunity} tokens={tokens} />

      <View style={{ gap: scale.px(stageTwoCardTokens.geometry.cardSpacing) }}>
        <WorkerJobsStageTwoInfoGroup
          description={deal
            ? textByLanguage(language, 'Thông tin yêu cầu và hiện trạng của công việc.', 'Request and condition details for the job.')
            : requestRows[0].meta}
          glyph="clipboard"
          rowGlyphs={STAGE_TWO_REQUEST_GLYPHS}
          rows={deal ? requestRows : requestRows.map((row) => ({ ...row, meta: '' }))}
          scale={scale}
          testID="worker-v5-offer-request-list"
          title={textByLanguage(language, 'Yêu cầu', 'Request')}
          tone="neutral"
        />
        <WorkerJobsStageTwoInfoGroup
          description={textByLanguage(language, 'Thông tin địa chỉ và khách hàng của công việc.', 'Address and customer details for the job.')}
          glyph="map"
          rowGlyphs={STAGE_TWO_ADDRESS_GLYPHS}
          rows={addressRows}
          scale={scale}
          testID="worker-v5-offer-address-list"
          title={textByLanguage(language, 'Địa chỉ & khách hàng', 'Address & customer')}
          tone="neutral"
        />
        {isPricedOffer || !proposalOpportunity ? (
          <WorkerJobsStageTwoInfoGroup
            description={textByLanguage(language, 'Thông tin giá và tiền công của công việc.', 'Price and earnings details for the job.')}
            glyph="coins"
            rowGlyphs={STAGE_TWO_PRICE_GLYPHS}
            rows={priceRows}
            scale={scale}
            testID="worker-v5-offer-price-list"
            title={textByLanguage(language, 'Giá dịch vụ & tiền công', 'Service price & earnings')}
            tone="mint"
          />
        ) : null}
        {isPricedOffer || !proposalOpportunity ? (
          <WorkerJobsStageTwoSection
            description={textByLanguage(language, 'Các thông tin cần thiết để bắt đầu công việc.', 'What you need before starting the job.')}
            glyph="briefcase"
            rows={checks.map((item, index) => ({
              glyph: STAGE_TWO_READY_GLYPHS[index] ?? 'receipt',
              key: item.label,
              meta: item.meta,
              metaLines: 2,
              status: item.state === 'done' ? textByLanguage(language, 'Đạt', 'Ready') : textByLanguage(language, 'Cần xử lý', 'Needs action'),
              testID: `worker-v5-accept-check-${index}`,
              title: item.label,
              tone: item.state === 'done' ? 'mint' : 'amber',
            }))}
            scale={scale}
            testID="worker-v5-accept-checklist-card"
            title={textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready to accept')}
          />
        ) : null}
      </View>

      {proposalAction ? (
        <WorkerBroadcastProposalForm
          action={proposalAction}
          alreadyApplied={proposalOpportunity?.result?.already_applied}
          busy={actionBusy}
          language={language}
          onSubmit={runtime.actions.workerSubmitBroadcastProposal}
          submitted={Boolean(proposalOpportunity?.result)}
          tokens={tokens}
        />
      ) : null}

      {runtime.state.lastError ? (
        <WorkerV5BoundaryNote
          body={runtime.state.lastError}
          reduceTransparency={reduceTransparency}
          title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
        />
      ) : null}

      <WorkerJobsStageTwoCard scale={scale} testID="worker-v5-accept-commitment">
        <WorkerJobsStageTwoRow
          glyph="clock"
          meta={textByLanguage(language, 'Thời gian sẽ được cập nhật từ dữ liệu thật.', 'Timing updates from live data.')}
          scale={scale}
          title={eta.label}
        />
      </WorkerJobsStageTwoCard>

      <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: scale.px(stageTwoCardTokens.geometry.actionGap) }} testID="worker-v5-action-rail">
        <WorkerJobsStageTwoAction
          accessibilityLabel={textByLanguage(language, 'Từ chối', 'Decline')}
          disabled={!canDecline || actionBusy}
          label={actionBusy ? textByLanguage(language, 'Đang xử lý', 'Working') : textByLanguage(language, 'Từ chối', 'Decline')}
          onPress={declineOffer}
          scale={scale}
          testID="worker-v5-offer-decline-action"
          variant="ghost"
        />
        {isPricedOffer || !proposalOpportunity ? (
          <WorkerJobsStageTwoAction
            accessibilityLabel={textByLanguage(language, 'Xác nhận giá và nhận việc', 'Confirm price and accept')}
            disabled={!canAccept || actionBusy}
            label={actionBusy ? textByLanguage(language, 'Đang xác nhận giá', 'Confirming price') : textByLanguage(language, 'Xác nhận giá & nhận việc', 'Confirm price & accept')}
            onPress={confirmAccept}
            scale={scale}
            testID="worker-v5-accept-confirm-action"
            variant="primary"
          />
        ) : null}
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeCustomerConfirmationWaitBody({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const serviceType = deal?.broadcast?.serviceType ?? deal?.draft.serviceType ?? null
  const service = serviceType ? localizedServiceLabel(serviceType, language) : null
  const code = workerV5DisplayCode(deal, language)

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-customer-confirmation-wait">
      <View style={[prototypeStyles.stageSummaryCard, reduceTransparency && { backgroundColor: color.mint.white }]}>
        <View style={prototypeStyles.stageSummaryCopy}>
          <Text style={prototypeStyles.stageSummaryEyebrow}>{textByLanguage(language, 'Đã gửi nhận việc', 'Acceptance sent')}</Text>
          <Text style={prototypeStyles.stageSummaryTitle}>{textByLanguage(language, 'Đang chờ khách xác nhận', 'Waiting for customer confirmation')}</Text>
          <Text style={prototypeStyles.stageSummaryMeta}>{textByLanguage(language, 'Địa chỉ chi tiết và thao tác thi công vẫn khóa cho tới khi khách chọn bạn.', 'Exact address and execution actions stay locked until the customer confirms you.')}</Text>
        </View>
      </View>
      <View style={prototypeStyles.stageSectionHeader}>
        <Text style={prototypeStyles.stageSectionTitle}>{textByLanguage(language, 'Trạng thái việc', 'Work status')}</Text>
        <Text style={prototypeStyles.stageSectionAction}>{textByLanguage(language, 'Đang chờ', 'Waiting')}</Text>
      </View>
      <View style={[prototypeStyles.stageEvidenceEmpty, reduceTransparency && { backgroundColor: color.mint.white }]}>
        <View style={prototypeStyles.stageEvidenceEmptyIcon}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="status" size={22} />
        </View>
        <Text style={prototypeStyles.stageEvidenceEmptyText}>{textByLanguage(language, 'Kael sẽ mở bước di chuyển sau khi khách xác nhận bạn.', 'Kael opens travel after the customer confirms you.')}</Text>
      </View>
      {service || code ? <Text style={prototypeStyles.stageSummaryMeta}>{[service, code ? textByLanguage(language, `Mã việc ${code}`, `Work ${code}`) : null].filter(Boolean).join(' · ')}</Text> : null}
    </View>
  )
}
