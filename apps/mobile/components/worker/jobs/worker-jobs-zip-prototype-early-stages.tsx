import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'

import type { LocalDeal } from '@nestscout/shared'
import { color } from '@/design/theme'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { firstRouteParam, routeForWorkerV5Screen } from '../dock/routing'
import { requireWorkerV5Screen } from '../dock/screens'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import { textByLanguage } from '../ui/format'
import { workerV5DisplayCode } from '../ui/screen-labels'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import { buildWorkerV5AcceptEtaSignal, buildWorkerV5RouteDistanceSignal, workerV5ArrivalDestinationLabel, workerV5LiveDistanceSignal, workerV5LiveEtaSignal } from '../ui/route'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import {
  buildWorkerV5OfferAddressRows,
  buildWorkerV5OfferPriceRows,
  buildWorkerV5OfferRequestRows,
  type WorkerV5OfferDetailRow,
} from './offer'
import { buildWorkerV5AcceptReviewChecks, workerV5CanAcceptOpenOffer } from './acceptance'
import { WorkerInteractiveRouteMapPrototype } from './worker-interactive-route-map-prototype'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import { prototypeStyles, stageTwoStyles } from './worker-jobs-zip-prototype-styles'
import {
  Text,
  WorkerJobsLegacyPrototypeMetaIcon,
  WorkerJobsStageTwoIcon,
  type WorkerJobsLegacyPrototypeBodyProps,
  type WorkerJobsLegacyPrototypePreviewJob,
  type WorkerJobsLegacyPrototypeRuntime,
  type WorkerJobsStageTwoIconName,
  workerJobsLegacyPrototypeOpportunityArtwork,
  workerJobsLegacyPrototypePreviewJob,
} from './worker-jobs-zip-prototype-shared'

export function WorkerJobsLegacyPrototypeOpportunityCard({
  currentDeal,
  language,
  onSelect,
  previewJob,
  reduceTransparency,
  selected,
}: {
  currentDeal: LocalDeal | null
  language: AppLanguage
  onSelect?: () => void
  previewJob?: WorkerJobsLegacyPrototypePreviewJob | null
  reduceTransparency: boolean
  selected: boolean
}) {
  const isIncoming = currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent'
  const service = currentDeal ? localizedServiceLabel(currentDeal.draft.serviceType, language) : textByLanguage(language, 'Cơ hội công việc', 'Job opportunity')
  const area = currentDeal?.broadcast?.generalArea || currentDeal?.draft.districtLabel
  const artwork = workerJobsLegacyPrototypeOpportunityArtwork(currentDeal, previewJob)
  const title = currentDeal ? service : previewJob?.title[language] || textByLanguage(language, 'Chưa có việc phù hợp', 'No suitable job yet')
  const meta = currentDeal
    ? area || textByLanguage(language, 'Khu vực sẽ hiện khi được xác minh', 'Area appears after verification')
    : previewJob?.meta[language] || textByLanguage(language, 'Kael sẽ gửi khi có việc.', 'Kael will send a job when one is available.')
  const status = selected
    ? textByLanguage(language, 'Đã chọn', 'Selected')
    : previewJob?.status[language] || (
      isIncoming
        ? textByLanguage(language, 'Cơ hội gửi tới bạn', 'Opportunity sent to you')
        : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
    )
  const displayTime = currentDeal ? workerV5TimeChoiceLabel(currentDeal.draft.timeChoice, language, currentDeal.scheduledAt) : previewJob?.time[language] || null
  const displayPrice = currentDeal?.broadcast?.estimatedPriceLabel || currentDeal?.estimate?.priceRangeLabel || previewJob?.price[language] || null
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
      {displayPrice ? (
        <View style={prototypeStyles.opportunityMetaItem}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="price" />
          <Text style={[prototypeStyles.opportunityMetaText, prototypeStyles.opportunityPriceText]}>{displayPrice}</Text>
        </View>
      ) : null}
    </View>
  )
  const artworkView = <Image accessibilityIgnoresInvertColors contentFit="contain" contentPosition="right center" source={artwork} style={prototypeStyles.opportunityArtwork} />

  if (!onSelect) {
    return <View style={[prototypeStyles.opportunityCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-opportunity-empty-card">{copy}{artworkView}</View>
  }

  return (
    <Pressable
      accessibilityLabel={textByLanguage(language, `Chọn công việc ${service}`, `Select ${service} job`)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [prototypeStyles.opportunityCard, selected && { borderColor: color.brand.primary, borderWidth: 2 }, pressed && { opacity: 0.88 }]}
      testID="worker-v5-opportunity-card"
    >
      {copy}{artworkView}
    </Pressable>
  )
}

function WorkerJobsStageTwoInfoGroup({ iconNames, rows, testID, title, tokens }: {
  iconNames: readonly WorkerJobsStageTwoIconName[]
  rows: readonly WorkerV5OfferDetailRow[]
  testID: string
  title: string
  tokens: ReturnType<typeof getWorkerThemeTokens>
}) {
  return (
    <View style={stageTwoStyles.section}>
      <View style={stageTwoStyles.sectionHeading}>
        <Text style={[stageTwoStyles.sectionTitle, { color: tokens.text }]}>{title}</Text>
      </View>
      <View style={[stageTwoStyles.sectionCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>
        {rows.map((row, index) => (
          <View key={`${row.title}-${index}`} style={[stageTwoStyles.sectionRow, index > 0 && stageTwoStyles.sectionRowDivider, index > 0 && { borderTopColor: tokens.border }]}>
            <View style={[stageTwoStyles.sectionIconFrame, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
              <WorkerJobsStageTwoIcon color={tokens.primary} name={iconNames[index] ?? 'request'} size={24} />
            </View>
            <View style={stageTwoStyles.sectionRowCopy}>
              <Text numberOfLines={2} style={[stageTwoStyles.sectionRowTitle, { color: tokens.text }]}>{row.title}</Text>
              <Text numberOfLines={3} style={[stageTwoStyles.sectionRowMeta, { color: tokens.muted }]}>{row.meta}</Text>
            </View>
            <Text numberOfLines={2} style={[stageTwoStyles.sectionRowStatus, { color: tokens.text }]}>{row.status}</Text>
          </View>
        ))}
      </View>
    </View>
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
  const previewJob = prototypeMode && !currentDeal && firstRouteParam(params.ns_worker_jobs_variant) === 'available' ? workerJobsLegacyPrototypePreviewJob : null
  const displayedJobId = currentDeal?.id ?? previewJob?.id ?? null
  const isIncoming = Boolean(previewJob) || (currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent')
  const isSelected = selectedMissionId === displayedJobId
  const routeParams = {
    ns_audit_role: params.ns_audit_role,
    ns_worker_lang: params.ns_worker_lang,
    ns_worker_prototype: params.ns_worker_prototype,
  }
  const openCurrentWork = () => {
    if (currentDeal) {
      router.replace(routeForWorkerV5Screen(requireWorkerV5Screen(workerV5JobsDestinationScreenId(currentDeal)), routeParams) as never)
      return
    }
    if (previewJob) router.replace(routeForWorkerV5Screen(requireWorkerV5Screen('2.2-offer-detail'), routeParams) as never)
  }
  const openKaelIntake = () => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)

  return (
    <View style={prototypeStyles.opportunityInboxNew} testID="worker-v5-opportunity-inbox-handoff">
      <WorkerJobsLegacyPrototypeOpportunityCard currentDeal={currentDeal} language={language} onSelect={displayedJobId ? () => setSelectedMissionId(displayedJobId) : undefined} previewJob={previewJob} reduceTransparency={reduceTransparency} selected={isSelected} />
      {displayedJobId && !isSelected ? (
        <Text style={prototypeStyles.opportunitySelectionHintNew} testID="worker-v5-opportunity-selection-hint">
          {textByLanguage(language, 'Chọn công việc để xem chi tiết.', 'Select the job to review details.')}
        </Text>
      ) : null}
      <WorkerJobsLegacyPrototypeOpportunityActions
        language={language}
        onKael={openKaelIntake}
        onPrimary={isSelected ? openCurrentWork : undefined}
        primary={isSelected
          ? isIncoming
            ? textByLanguage(language, 'Xem & nhận việc', 'Review and accept')
            : textByLanguage(language, 'Tiếp tục công việc', 'Continue work')
          : textByLanguage(language, 'Chọn công việc để tiếp tục', 'Select a job to continue')}
        primaryDisabled={!displayedJobId || !isSelected}
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
}: {
  deal: LocalDeal | null
  language: AppLanguage
  previewJob: WorkerJobsLegacyPrototypePreviewJob | null
  reduceTransparency: boolean
  tokens: ReturnType<typeof getWorkerThemeTokens>
}) {
  const service = deal
    ? localizedServiceLabel(deal.draft.serviceType, language)
    : previewJob?.title[language] || textByLanguage(language, 'Chưa có đề nghị', 'No offer yet')
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel || previewJob?.meta[language]
  const displayTime = deal
    ? workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt)
    : previewJob?.time[language]
  const displayPrice = deal?.broadcast?.estimatedPriceLabel || deal?.estimate?.priceRangeLabel || previewJob?.price[language]
  const artwork = workerJobsLegacyPrototypeOpportunityArtwork(deal, previewJob)

  return (
    <View style={[stageTwoStyles.hero, { backgroundColor: reduceTransparency ? tokens.base : tokens.raised, borderColor: tokens.borderStrong }]} testID="worker-v5-offer-detail-summary-card">
      <View style={stageTwoStyles.heroCopy}>
        <Text numberOfLines={1} style={[stageTwoStyles.heroService, { color: tokens.text }]}>{service}</Text>
        <Text numberOfLines={2} style={[stageTwoStyles.heroArea, { color: tokens.muted }]}>{area || textByLanguage(language, 'Khu vực sẽ hiện sau khi xác minh', 'Area appears after verification')}</Text>
        <View style={stageTwoStyles.heroMeta}>
          <View style={stageTwoStyles.heroMetaItem}>
            <WorkerJobsStageTwoIcon color={tokens.primary} name="time" />
            <Text numberOfLines={1} style={[stageTwoStyles.heroMetaText, { color: tokens.muted }]}>{displayTime || textByLanguage(language, 'Chưa có khung giờ', 'No time yet')}</Text>
          </View>
        </View>
        {displayPrice ? (
          <View style={stageTwoStyles.heroMetaItem}>
            <WorkerJobsStageTwoIcon color={tokens.primary} name="price" />
            <Text numberOfLines={1} style={[stageTwoStyles.heroPrice, { color: tokens.muted }]}>{displayPrice}</Text>
          </View>
        ) : null}
      </View>
      <Image accessibilityIgnoresInvertColors contentFit="contain" contentPosition="right center" source={artwork} style={stageTwoStyles.heroArtwork} />
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
  const params = useLocalSearchParams<{
    ns_audit_role?: string | string[]
    ns_worker_jobs_variant?: string | string[]
    ns_worker_lang?: string | string[]
    ns_worker_prototype?: string | string[]
  }>()
  const router = useRouter()
  const deal = runtime.state.deal
  const previewJob = prototypeMode && !deal && firstRouteParam(params.ns_worker_jobs_variant) === 'available' ? workerJobsLegacyPrototypePreviewJob : null
  const checks = buildWorkerV5AcceptReviewChecks(deal, runtime.workerProfile, language)
  const canAccept = workerV5CanAcceptOpenOffer(deal, runtime.state.workerGate)
  const canDecline = deal?.status === 'broadcasting' && deal.broadcast?.status === 'sent'
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
    <View style={stageTwoStyles.section} testID="worker-v5-offer-detail-handoff">
      <WorkerJobsLegacyPrototypeOfferSummary deal={deal} language={language} previewJob={previewJob} reduceTransparency={reduceTransparency} tokens={tokens} />

      <WorkerJobsStageTwoInfoGroup
        iconNames={['home', 'service', 'photo']}
        rows={requestRows}
        testID="worker-v5-offer-request-list"
        title={textByLanguage(language, 'Yêu cầu', 'Request')}
        tokens={tokens}
      />
      <WorkerJobsStageTwoInfoGroup
        iconNames={['location', 'profile']}
        rows={addressRows}
        testID="worker-v5-offer-address-list"
        title={textByLanguage(language, 'Địa chỉ & khách hàng', 'Address & customer')}
        tokens={tokens}
      />
      <WorkerJobsStageTwoInfoGroup
        iconNames={['price']}
        rows={priceRows}
        testID="worker-v5-offer-price-list"
        title={textByLanguage(language, 'Giá dịch vụ & tiền công', 'Service price & earnings')}
        tokens={tokens}
      />

      <View style={stageTwoStyles.section}>
        <View style={stageTwoStyles.sectionHeading}>
          <Text style={[stageTwoStyles.sectionTitle, { color: tokens.text }]}>{textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready to accept')}</Text>
        </View>
        <View style={[stageTwoStyles.sectionCard, { backgroundColor: reduceTransparency ? tokens.base : tokens.raised, borderColor: tokens.border }]} testID="worker-v5-accept-checklist-card">
          {checks.map((item, index) => {
            const done = item.state === 'done'
            const iconName: WorkerJobsStageTwoIconName = index === 0
              ? 'inbox'
              : index === 1
                ? 'tools'
                : index === 2
                  ? 'shield'
                : 'wallet'
            return (
              <View key={item.label} style={[stageTwoStyles.checklistRow, index > 0 && stageTwoStyles.sectionRowDivider, index > 0 && { borderTopColor: tokens.border }]} testID={`worker-v5-accept-check-${index}`}>
                <View style={[stageTwoStyles.sectionIconFrame, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
                  <WorkerJobsStageTwoIcon color={tokens.primary} name={iconName} size={24} />
                </View>
                <View style={stageTwoStyles.checklistCopy}>
                  <Text numberOfLines={2} style={[stageTwoStyles.checklistLabel, { color: tokens.text }]}>{item.label}</Text>
                  <Text numberOfLines={2} style={[stageTwoStyles.checklistMeta, { color: tokens.muted }]}>{item.meta}</Text>
                </View>
                <Text numberOfLines={2} style={[stageTwoStyles.checklistState, { color: tokens.text }]}>{done ? textByLanguage(language, 'Đạt', 'Ready') : textByLanguage(language, 'Cần xử lý', 'Needs action')}</Text>
              </View>
            )
          })}
        </View>
      </View>

      <View style={[stageTwoStyles.etaCard, { backgroundColor: reduceTransparency ? tokens.base : tokens.raised, borderColor: tokens.border }]} testID="worker-v5-accept-commitment">
        <View style={[stageTwoStyles.sectionIconFrame, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
          <WorkerJobsStageTwoIcon color={tokens.primary} name="time" size={24} />
        </View>
        <View style={stageTwoStyles.etaCopy}>
          <Text style={[stageTwoStyles.etaTitle, { color: tokens.text }]}>{eta.label}</Text>
          <Text style={[stageTwoStyles.etaMeta, { color: tokens.muted }]}>{textByLanguage(language, 'Thời gian sẽ được cập nhật từ dữ liệu thật.', 'Timing updates from live data.')}</Text>
        </View>
      </View>

      {runtime.state.lastError ? (
        <WorkerV5BoundaryNote
          body={runtime.state.lastError}
          reduceTransparency={reduceTransparency}
          title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
        />
      ) : null}

      <View accessibilityRole="summary" style={stageTwoStyles.actionRow} testID="worker-v5-action-rail">
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Từ chối', 'Decline')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDecline || actionBusy }}
          disabled={!canDecline || actionBusy}
          onPress={declineOffer}
          style={({ pressed }) => [stageTwoStyles.actionButton, { backgroundColor: reduceTransparency ? tokens.base : tokens.raised, borderColor: tokens.borderStrong }, (!canDecline || actionBusy) && { backgroundColor: tokens.disabled, borderColor: tokens.border }, pressed && canDecline && !actionBusy && { opacity: 0.84 }]}
          testID="worker-v5-offer-decline-action"
        >
          <Text style={[stageTwoStyles.actionLabel, { color: !canDecline || actionBusy ? tokens.subtleText : tokens.primary }]}>{actionBusy ? textByLanguage(language, 'Đang xử lý', 'Working') : textByLanguage(language, 'Từ chối', 'Decline')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Xác nhận giá và nhận việc', 'Confirm price and accept')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAccept || actionBusy }}
          disabled={!canAccept || actionBusy}
          onPress={confirmAccept}
          style={({ pressed }) => [stageTwoStyles.actionButton, { backgroundColor: tokens.primary, borderColor: tokens.primary }, (!canAccept || actionBusy) && { backgroundColor: tokens.disabled, borderColor: tokens.border }, pressed && canAccept && !actionBusy && { opacity: 0.84 }]}
          testID="worker-v5-accept-confirm-action"
        >
          <Text style={[stageTwoStyles.actionLabel, { color: !canAccept || actionBusy ? tokens.subtleText : tokens.primaryText }]}>{actionBusy ? textByLanguage(language, 'Đang xác nhận giá', 'Confirming price') : textByLanguage(language, 'Xác nhận giá & nhận việc', 'Confirm price & accept')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function WorkerJobsLegacyPrototypeRouteMap({
  deal,
  language,
  prototypeMode,
  reduceMotion,
  reduceTransparency,
  routePreview,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  prototypeMode: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}) {
  return <WorkerInteractiveRouteMapPrototype allowWebFixture={prototypeMode} deal={deal} language={language} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} routePreview={routePreview} />
}

function WorkerJobsLegacyPrototypeRouteEtaSummary({
  deal,
  language,
  reduceTransparency,
  routePreview,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}) {
  const etaSignal = routePreview.route
    ? workerV5LiveEtaSignal(routePreview.route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = routePreview.route
    ? workerV5LiveDistanceSignal(routePreview.route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const etaValue = etaSignal.hasSignal ? etaSignal.label : textByLanguage(language, 'Đang đo thời gian', 'Measuring time')

  return (
    <View style={[prototypeStyles.routeEtaSummaryCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-eta-summary-card">
      <View style={prototypeStyles.routeEtaSummaryCopy}>
        <View style={prototypeStyles.routeEtaLabelRow}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="status" />
          <Text style={prototypeStyles.routeEtaLabel}>{textByLanguage(language, 'Thời gian đến', 'Arrival time')}</Text>
        </View>
        <Text style={prototypeStyles.routeEtaValue}>{etaValue}</Text>
        <Text numberOfLines={2} style={prototypeStyles.routeEtaMeta}>{distanceSignal.hasSignal ? distanceSignal.meta : workerV5ArrivalDestinationLabel(deal, language)}</Text>
      </View>
    </View>
  )
}

function WorkerJobsLegacyPrototypeRouteMetrics({
  deal,
  language,
  reduceTransparency,
  routePreview,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}) {
  const pendingRouteLabel = !routePreview.hasRouteDestination
    ? textByLanguage(language, 'Chưa mở điểm đến', 'Destination not released')
    : routePreview.locationStatus === 'loading'
      ? textByLanguage(language, 'Đang lấy vị trí', 'Getting location')
      : routePreview.locationStatus === 'denied'
        ? textByLanguage(language, 'Cần bật vị trí', 'Location required')
        : routePreview.locationStatus === 'unavailable'
          ? textByLanguage(language, 'Chưa lấy được vị trí', 'Location unavailable')
          : textByLanguage(language, 'Đang tính lộ trình', 'Calculating route')
  const etaSignal = routePreview.route
    ? workerV5LiveEtaSignal(routePreview.route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = routePreview.route
    ? workerV5LiveDistanceSignal(routePreview.route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const serviceLabel = localizedServiceLabel(deal?.broadcast?.serviceType ?? deal?.draft.serviceType ?? null, language)
  const problemSummary = deal?.broadcast?.problemSummary?.trim()
    || deal?.draft.description?.trim()
    || textByLanguage(language, 'Chưa có mô tả', 'No description')
  const items = [
    {
      label: textByLanguage(language, 'Quãng đường', 'Distance'),
      value: distanceSignal.hasSignal ? distanceSignal.label : pendingRouteLabel,
    },
    {
      label: textByLanguage(language, 'Thời gian dự kiến', 'Estimated time'),
      value: etaSignal.hasSignal ? etaSignal.label : pendingRouteLabel,
    },
    { label: problemSummary, value: serviceLabel },
  ]

  return (
    <View style={prototypeStyles.routeMetrics} testID="worker-v5-info-grid">
      {items.map((item, index) => (
        <View key={`${item.label}-${item.value}`} style={[prototypeStyles.routeMetricCell, reduceTransparency && { backgroundColor: color.mint.white }]}>
          <Text numberOfLines={1} style={prototypeStyles.routeMetricValue} testID={`worker-v5-info-cell-value-${index}`}>{item.value}</Text>
          <Text numberOfLines={1} style={prototypeStyles.routeMetricLabel} testID={`worker-v5-info-cell-label-${index}`}>{item.label}</Text>
        </View>
      ))}
    </View>
  )
}

function WorkerJobsLegacyPrototypeRouteActions({
  actionBusy,
  language,
  onPrimary,
  onSecondary,
  primary,
  primaryDisabled,
  reduceTransparency,
}: {
  actionBusy: boolean
  language: AppLanguage
  onPrimary?: () => void
  onSecondary: () => void
  primary: string
  primaryDisabled: boolean
  reduceTransparency: boolean
}) {
  return (
    <View accessibilityRole="summary" style={prototypeStyles.opportunityActions} testID="worker-v5-action-rail">
      <Pressable
        accessibilityLabel={textByLanguage(language, 'Liên hệ khách', 'Contact customer')}
        accessibilityRole="button"
        onPress={onSecondary}
        style={({ pressed }) => [prototypeStyles.opportunityAction, prototypeStyles.opportunityActionSecondary, reduceTransparency && { backgroundColor: color.mint.white }, pressed && { opacity: 0.84 }]}
        testID="worker-v5-route-contact-action"
      >
        <Text style={[prototypeStyles.opportunityActionText, prototypeStyles.opportunityActionSecondaryText]}>{textByLanguage(language, 'Liên hệ khách', 'Contact customer')}</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={primary}
        accessibilityRole="button"
        accessibilityState={{ disabled: primaryDisabled || actionBusy }}
        disabled={primaryDisabled || actionBusy}
        onPress={onPrimary}
        style={({ pressed }) => [prototypeStyles.opportunityAction, prototypeStyles.opportunityActionPrimary, (primaryDisabled || actionBusy) && prototypeStyles.opportunityActionDisabled, pressed && !primaryDisabled && !actionBusy && { opacity: 0.84 }]}
        testID="worker-v5-route-arrival-action"
      >
        <Text style={[prototypeStyles.opportunityActionText, primaryDisabled || actionBusy ? prototypeStyles.opportunityActionDisabledText : prototypeStyles.opportunityActionPrimaryText]}>{primary}</Text>
      </Pressable>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeRouteEtaBody({
  actionBusy,
  language,
  navigateJobChat,
  prototypeMode,
  reduceMotion,
  reduceTransparency,
  routePreview,
  runRouteAction,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
  prototypeMode: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
  runRouteAction: () => void | Promise<void>
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const primaryLabel = deal?.status === 'worker_matched'
    ? textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
    : textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')

  return (
    <View style={prototypeStyles.routeStageStack} testID="worker-v5-route-eta-handoff">
      <WorkerJobsLegacyPrototypeRouteMap deal={deal} language={language} prototypeMode={prototypeMode} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <WorkerJobsLegacyPrototypeRouteEtaSummary deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <WorkerJobsLegacyPrototypeRouteMetrics deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <WorkerJobsLegacyPrototypeRouteActions
        actionBusy={actionBusy}
        language={language}
        onPrimary={() => void runRouteAction()}
        onSecondary={navigateJobChat}
        primary={primaryLabel}
        primaryDisabled={!deal || actionBusy}
        reduceTransparency={reduceTransparency}
      />
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
