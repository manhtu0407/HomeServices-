import { Image } from 'expo-image'
import { Pressable, View } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { useState } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { color } from '@/design/theme'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'
import { routeForWorkerV5Screen } from '../dock/routing'
import { requireWorkerV5Screen } from '../dock/screens'
import { textByLanguage } from '../ui/format'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'
import { workerV5TimeChoiceLabel } from '../ui/labels'
import { type WorkerV5OfferDetailRow } from './offer'
import type { WorkerJobsLegacyPrototypeRuntime } from './worker-jobs-legacy-prototype-shared'
import { Text, workerJobsLegacyPrototypeOpportunityArtwork } from './worker-jobs-legacy-prototype-shared'
import { prototypeStyles } from './worker-jobs-legacy-prototype-styles'
export function WorkerJobsLegacyPrototypeOpportunityCard({
  currentDeal,
  language,
  onSelect,
  reduceTransparency,
  selected,
}: {
  currentDeal: LocalDeal | null
  language: AppLanguage
  onSelect?: () => void
  reduceTransparency: boolean
  selected: boolean
}) {
  const isIncoming = currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent'
  const service = currentDeal ? localizedServiceLabel(currentDeal.draft.serviceType, language) : textByLanguage(language, 'Cơ hội công việc', 'Job opportunity')
  const area = currentDeal?.broadcast?.generalArea || currentDeal?.draft.districtLabel
  const artwork = workerJobsLegacyPrototypeOpportunityArtwork(currentDeal)
  const title = currentDeal ? service : textByLanguage(language, 'Chưa có việc phù hợp', 'No suitable job yet')
  const meta = currentDeal
    ? area || textByLanguage(language, 'Khu vực sẽ hiện khi được xác minh', 'Area appears after verification')
    : textByLanguage(language, 'Kael sẽ gửi việc tới bạn.', 'Kael will send you a job.')
  const workflowStatus = currentDeal?.backendStatus ?? currentDeal?.status
  const status = selected
    ? textByLanguage(language, 'Đã chọn', 'Selected')
    : isIncoming
      ? textByLanguage(language, 'Cơ hội gửi tới bạn', 'Opportunity sent to you')
      : workflowStatus === 'worker_matched'
        ? textByLanguage(language, 'Đã nhận việc', 'Job accepted')
        : workflowStatus === 'worker_on_way'
          ? textByLanguage(language, 'Đang di chuyển', 'Travel in progress')
          : workflowStatus === 'arrived'
            ? textByLanguage(language, 'Thợ đã đến', 'Worker has arrived')
            : workflowStatus === 'inspecting'
              ? textByLanguage(language, 'Đang kiểm tra', 'Inspecting')
              : workflowStatus === 'repairing'
                ? textByLanguage(language, 'Đang thực hiện', 'Work in progress')
                : workflowStatus === 'worker_candidate_pending'
                  ? textByLanguage(language, 'Đang chờ khách xác nhận', 'Waiting for customer confirmation')
                  : workflowStatus === 'scope_change_pending'
                    ? textByLanguage(language, 'Đang chờ duyệt phạm vi', 'Waiting for scope approval')
                    : workflowStatus === 'completed_by_worker' || workflowStatus === 'confirmed_by_customer'
                      ? textByLanguage(language, 'Đã gửi hồ sơ', 'Completion submitted')
                      : textByLanguage(language, 'Đang xử lý', 'In progress')
  const displayTime = currentDeal ? workerV5TimeChoiceLabel(currentDeal.draft.timeChoice, language, currentDeal.scheduledAt) : null
  const displayPrice = currentDeal?.broadcast?.estimatedPriceLabel || currentDeal?.estimate?.priceRangeLabel || null
  const copy = (
    <View style={prototypeStyles.opportunityCardCopy}>
      <Text numberOfLines={2} style={prototypeStyles.opportunityCardTitle}>{title}</Text>
      <Text numberOfLines={2} style={[prototypeStyles.opportunityCardMeta, !currentDeal && prototypeStyles.opportunityCardEmptyMeta]}>{meta}</Text>
      <View style={prototypeStyles.opportunityMetaRow}>
        <View style={[prototypeStyles.opportunityMetaItem, selected && prototypeStyles.opportunityMetaItemSelected]}>
          <WorkerJobsLegacyPrototypeMetaIcon kind="status" size={selected ? 20 : 16} />
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
  const artworkView = (
    <View style={prototypeStyles.opportunityArtworkFrame} testID="worker-v5-opportunity-artwork-frame">
      <Image accessibilityIgnoresInvertColors contentFit="contain" contentPosition="right center" source={artwork} style={prototypeStyles.opportunityArtwork} />
    </View>
  )

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

export function WorkerJobsLegacyPrototypeMetaIcon({ kind, size = 16 }: { kind: 'photo' | 'price' | 'status' | 'time'; size?: number }) {
  const iconColor = color.brand.primaryDark
  const strokeProps = { fill: 'none' as const, stroke: iconColor, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.7 }

  return (
    <View accessibilityElementsHidden style={[prototypeStyles.opportunityMetaIcon, size !== 16 && { height: size, width: size }]}>
      <Svg height={size} viewBox="0 0 24 24" width={size}>
        {kind === 'status' ? (
          <>
            <Circle cx={12} cy={12} r={8.2} {...strokeProps} />
            <Path d="M12 7.8v4.7l3.1 1.9" {...strokeProps} />
          </>
        ) : kind === 'photo' ? (
          <>
            <Rect height={13.5} rx={2} width={17} x={3.5} y={5.25} {...strokeProps} />
            <Circle cx={8.5} cy={9.3} fill={iconColor} r={1.1} />
            <Path d="m6.2 16.3 3.5-3.6 2.5 2.2 2.1-2.1 3.5 3.5" {...strokeProps} />
          </>
        ) : kind === 'time' ? (
          <>
            <Rect height={14.5} rx={2} width={16.5} x={3.75} y={5.5} {...strokeProps} />
            <Line x1={8} x2={8} y1={3.75} y2={7.3} {...strokeProps} />
            <Line x1={16} x2={16} y1={3.75} y2={7.3} {...strokeProps} />
            <Line x1={4.5} x2={19.5} y1={9.3} y2={9.3} {...strokeProps} />
          </>
        ) : (
          <>
            <Rect height={13.5} rx={2} width={17} x={3.5} y={5.25} {...strokeProps} />
            <Line x1={3.75} x2={20.25} y1={9.5} y2={9.5} {...strokeProps} />
            <Circle cx={16.5} cy={14} fill={iconColor} r={1} />
          </>
        )}
      </Svg>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeOpportunityActions({
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
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const params = useLocalSearchParams<{
    ns_audit_role?: string | string[]
    ns_worker_lang?: string | string[]
    ns_worker_prototype?: string | string[]
  }>()
  const router = useRouter()
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null)
  const deal = runtime.state.deal
  const currentDeal = workerV5JobsDestinationScreenId(deal) === '2.1-opportunity-inbox' ? null : deal
  const displayedJobId = currentDeal?.id ?? null
  const isIncoming = currentDeal?.status === 'broadcasting' && currentDeal.broadcast?.status === 'sent'
  const isSelected = selectedMissionId === displayedJobId
  const routeParams = {
    ns_audit_role: params.ns_audit_role,
    ns_worker_lang: params.ns_worker_lang,
    ns_worker_prototype: 'worker-jobs-rebuild-v1',
  }
  const openCurrentWork = () => {
    if (currentDeal) {
      router.replace(routeForWorkerV5Screen(requireWorkerV5Screen(workerV5JobsDestinationScreenId(currentDeal)), routeParams) as never)
      return
    }
  }
  const openKaelIntake = () => router.replace('/(worker)/chat?ns_worker_screen=3.2-kael-job-intake' as never)

  return (
    <View style={prototypeStyles.opportunityInboxNew} testID="worker-v5-opportunity-inbox-handoff">
      <WorkerJobsLegacyPrototypeOpportunityCard currentDeal={currentDeal} language={language} onSelect={displayedJobId ? () => setSelectedMissionId(displayedJobId) : undefined} reduceTransparency={reduceTransparency} selected={isSelected} />
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

export function WorkerJobsLegacyPrototypeOfferSummary({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const service = deal ? localizedServiceLabel(deal.draft.serviceType, language) : textByLanguage(language, 'Chưa có đề nghị', 'No offer yet')
  const area = deal?.broadcast?.generalArea || deal?.draft.districtLabel
  const status = deal?.broadcast?.status === 'sent'
    ? textByLanguage(language, 'Cơ hội mới', 'New opportunity')
    : deal
      ? textByLanguage(language, 'Đang xử lý', 'In progress')
      : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const displayTime = deal ? workerV5TimeChoiceLabel(deal.draft.timeChoice, language, deal.scheduledAt) : null
  const displayPrice = deal?.broadcast?.estimatedPriceLabel || deal?.estimate?.priceRangeLabel || null
  const artwork = workerJobsLegacyPrototypeOpportunityArtwork(deal)

  return (
    <View style={[prototypeStyles.offerSummaryCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-offer-detail-summary-card">
      <View style={prototypeStyles.offerSummaryCopy}>
        <Text numberOfLines={2} style={prototypeStyles.offerSummaryTitle}>{service}</Text>
        <Text numberOfLines={2} style={prototypeStyles.offerSummaryMeta}>{area || textByLanguage(language, 'Khu vực sẽ hiện sau khi xác minh', 'Area appears after verification')}</Text>
        <View style={prototypeStyles.opportunityMetaRow}>
          <View style={prototypeStyles.opportunityMetaItem}>
            <WorkerJobsLegacyPrototypeMetaIcon kind="status" />
            <Text numberOfLines={1} style={prototypeStyles.opportunityMetaText}>{status}</Text>
          </View>
          {displayTime ? (
            <View style={prototypeStyles.opportunityMetaItem}>
              <WorkerJobsLegacyPrototypeMetaIcon kind="time" />
              <Text numberOfLines={1} style={prototypeStyles.opportunityMetaText}>{displayTime}</Text>
            </View>
          ) : null}
        </View>
        {displayPrice ? (
          <Text numberOfLines={1} style={prototypeStyles.offerSummaryPrice}>{displayPrice}</Text>
        ) : null}
      </View>
      <Image accessibilityIgnoresInvertColors contentFit="contain" contentPosition="right center" source={artwork} style={prototypeStyles.offerSummaryArtwork} />
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
