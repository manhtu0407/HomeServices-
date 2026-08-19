import { Pressable, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { color } from '@/design/theme'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'
import { routeForWorkerV5Screen } from '../dock/routing'
import { requireWorkerV5Screen } from '../dock/screens'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import { WorkerV5RouteMapStage } from './route-map-surfaces'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import { textByLanguage } from '../ui/format'
import { buildWorkerV5AcceptReviewChecks, workerV5CanAcceptOpenOffer } from './acceptance'
import { buildWorkerV5OfferAddressRows, buildWorkerV5OfferPriceRows, buildWorkerV5OfferRequestRows } from './offer'
import { buildWorkerV5AcceptEtaSignal, buildWorkerV5RouteDistanceSignal, workerV5ArrivalDestinationLabel, workerV5LiveDistanceSignal, workerV5LiveEtaSignal } from '../ui/route'
import type { WorkerJobsLegacyPrototypeBodyProps, WorkerJobsLegacyPrototypeRuntime } from './worker-jobs-legacy-prototype-contracts'
import { Text } from './worker-jobs-legacy-prototype-shared'
import { WorkerJobsLegacyPrototypeMetaIcon, WorkerJobsLegacyPrototypeOfferInfoGroup, WorkerJobsLegacyPrototypeOfferSummary } from './worker-jobs-legacy-prototype-opportunity'
import { prototypeStyles } from './worker-jobs-legacy-prototype-styles'
export function WorkerJobsLegacyPrototypeOfferDetailBody({
  actionBusy,
  language,
  reduceTransparency,
  runWorkerAction,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  reduceTransparency: boolean
  runWorkerAction: WorkerJobsLegacyPrototypeBodyProps['runWorkerAction']
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const params = useLocalSearchParams<{
    ns_audit_role?: string | string[]
    ns_worker_lang?: string | string[]
    ns_worker_prototype?: string | string[]
  }>()
  const router = useRouter()
  const deal = runtime.state.deal
  const checks = buildWorkerV5AcceptReviewChecks(deal, runtime.workerProfile, language)
  const passedCount = checks.filter((item) => item.state === 'done').length
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
    ns_worker_prototype: 'worker-jobs-rebuild-v1',
  }
  const declineOffer = () => void runWorkerAction(
    async () => {
      const ok = await runtime.actions.workerDeclineBroadcast()
      if (ok) router.replace(routeForWorkerV5Screen(requireWorkerV5Screen('2.1-opportunity-inbox'), routeParams) as never)
      return ok
    },
    { navigateOnSuccess: false },
  )
  const confirmAccept = () => void runWorkerAction(
    async () => {
      const ok = await runtime.actions.workerAcceptBroadcast(deal?.broadcast?.jobId)
      if (ok) router.replace(routeForWorkerV5Screen(requireWorkerV5Screen('2.3-customer-confirmation-wait'), routeParams) as never)
      return ok
    },
    { navigateOnSuccess: false },
  )

  return (
    <View style={prototypeStyles.offerStageStack} testID="worker-v5-offer-detail-handoff">
      <WorkerJobsLegacyPrototypeOfferSummary deal={deal} language={language} reduceTransparency={reduceTransparency} />

      <View style={[prototypeStyles.offerInfoCard, reduceTransparency && { backgroundColor: color.mint.white }]}>
        <WorkerJobsLegacyPrototypeOfferInfoGroup
          rows={requestRows}
          testID="worker-v5-offer-request-list"
          title={textByLanguage(language, 'Yêu cầu', 'Request')}
        />
        <WorkerJobsLegacyPrototypeOfferInfoGroup
          rows={addressRows}
          testID="worker-v5-offer-address-list"
          title={textByLanguage(language, 'Địa chỉ & khách hàng', 'Address & customer')}
        />
        <WorkerJobsLegacyPrototypeOfferInfoGroup
          rows={priceRows}
          testID="worker-v5-offer-price-list"
          title={textByLanguage(language, 'Giá dịch vụ & tiền công', 'Service price & earnings')}
        />
      </View>

      <View style={[prototypeStyles.offerChecklistCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-accept-checklist-card">
        <View style={prototypeStyles.offerChecklistHeader}>
          <Text style={prototypeStyles.offerChecklistTitle}>{textByLanguage(language, 'Sẵn sàng nhận việc', 'Ready to accept')}</Text>
          <Text style={prototypeStyles.offerChecklistCount}>{textByLanguage(language, `${passedCount}/${checks.length} điều kiện`, `${passedCount}/${checks.length} checks`)}</Text>
        </View>
        {checks.map((item, index) => (
          <View key={item.label} style={prototypeStyles.offerCheckRow} testID={`worker-v5-accept-check-${index}`}>
            <View accessibilityElementsHidden style={[prototypeStyles.offerCheckDot, item.state === 'done' && prototypeStyles.offerCheckDotDone, item.state === 'blocked' && prototypeStyles.offerCheckDotBlocked]} />
            <View style={prototypeStyles.offerCheckCopy}>
              <Text numberOfLines={2} style={prototypeStyles.offerCheckLabel}>{item.label}</Text>
              <Text numberOfLines={2} style={prototypeStyles.offerCheckMeta}>{item.meta}</Text>
            </View>
            <Text numberOfLines={2} style={prototypeStyles.offerCheckState}>{item.state === 'done' ? textByLanguage(language, 'Đạt', 'Ready') : textByLanguage(language, 'Cần xử lý', 'Needs action')}</Text>
          </View>
        ))}
      </View>

      <View style={[prototypeStyles.offerEtaCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-accept-commitment">
        <WorkerJobsLegacyPrototypeMetaIcon kind="time" />
        <View style={prototypeStyles.offerEtaCopy}>
          <Text style={prototypeStyles.offerEtaTitle}>{eta.label}</Text>
        </View>
      </View>

      {runtime.state.lastError ? (
        <WorkerV5BoundaryNote
          body={runtime.state.lastError}
          reduceTransparency={reduceTransparency}
          title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
        />
      ) : null}

      <View accessibilityRole="summary" style={prototypeStyles.opportunityActions} testID="worker-v5-action-rail">
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Từ chối', 'Decline')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDecline || actionBusy }}
          disabled={!canDecline || actionBusy}
          onPress={declineOffer}
          style={({ pressed }) => [prototypeStyles.opportunityAction, prototypeStyles.opportunityActionSecondary, (!canDecline || actionBusy) && prototypeStyles.opportunityActionDisabled, reduceTransparency && { backgroundColor: color.mint.white }, pressed && canDecline && !actionBusy && { opacity: 0.84 }]}
          testID="worker-v5-offer-decline-action"
        >
          <Text style={[prototypeStyles.opportunityActionText, !canDecline || actionBusy ? prototypeStyles.opportunityActionDisabledText : prototypeStyles.opportunityActionSecondaryText]}>{actionBusy ? textByLanguage(language, 'Đang xử lý', 'Working') : textByLanguage(language, 'Từ chối', 'Decline')}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={textByLanguage(language, 'Xác nhận giá và nhận việc', 'Confirm price and accept')}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAccept || actionBusy }}
          disabled={!canAccept || actionBusy}
          onPress={confirmAccept}
          style={({ pressed }) => [prototypeStyles.opportunityAction, prototypeStyles.opportunityActionPrimary, (!canAccept || actionBusy) && prototypeStyles.opportunityActionDisabled, pressed && canAccept && !actionBusy && { opacity: 0.84 }]}
          testID="worker-v5-accept-confirm-action"
        >
          <Text style={[prototypeStyles.opportunityActionText, !canAccept || actionBusy ? prototypeStyles.opportunityActionDisabledText : prototypeStyles.opportunityActionPrimaryText]}>{actionBusy ? textByLanguage(language, 'Đang xác nhận giá', 'Confirming price') : textByLanguage(language, 'Xác nhận giá & nhận việc', 'Confirm price & accept')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeRouteMap({
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
  if (routePreview.mapUri) {
    return <WorkerV5RouteMapStage deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
  }

  const title = !routePreview.hasRouteDestination
    ? textByLanguage(language, 'Địa chỉ chưa được mở cho lộ trình', 'The route address is not available yet')
    : routePreview.locationStatus === 'denied'
      ? textByLanguage(language, 'Cần bật vị trí để mở bản đồ', 'Enable location to open the map')
      : routePreview.locationStatus === 'unavailable'
        ? textByLanguage(language, 'Chưa thể lấy vị trí hiện tại', 'Current location is unavailable')
        : textByLanguage(language, 'Đang lấy vị trí của bạn', 'Getting your current location')
  const meta = routePreview.hasRouteDestination
    ? textByLanguage(language, 'Tuyến đường chỉ dùng tọa độ tòa nhà; số căn và tầng vẫn được bảo vệ.', 'The route uses the building location only; unit and floor remain protected.')
    : textByLanguage(language, 'Bản đồ chỉ hiện khi backend đã mở điểm đến tòa nhà cho thợ.', 'The map appears only after the backend releases the building destination to the worker.')

  return (
    <View style={[prototypeStyles.routeMapPanel, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-route-map-panel">
      <View style={prototypeStyles.routeMapEmptyContent} testID="worker-v5-route-vietmap-empty-state">
        <Text style={prototypeStyles.routeMapEmptyTitle}>{title}</Text>
        <Text style={prototypeStyles.routeMapEmptyMeta}>{meta}</Text>
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypeRouteEtaSummary({
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

export function WorkerJobsLegacyPrototypeRouteMetrics({
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

export function WorkerJobsLegacyPrototypeRouteActions({
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
  reduceTransparency,
  routePreview,
  runRouteAction,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateJobChat: () => void
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
      <WorkerJobsLegacyPrototypeRouteMap deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
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
