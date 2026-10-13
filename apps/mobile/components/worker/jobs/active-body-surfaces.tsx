import { memo, type ComponentType } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import {
  buildWorkerV5AcceptEtaSignal,
  buildWorkerV5RouteDistanceSignal,
  workerV5LiveDistanceSignal,
  workerV5LiveEtaSignal,
} from '../ui/route'
import { WorkerV5InfoGrid } from './shared-surfaces'
import { WorkerV5ActionRail } from './advisory-surfaces'
import { WorkerV5EtaSummaryCard } from './map-surfaces'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
import { useWorkerV5RoutePreview, type WorkerV5RoutePreview, type WorkerV5RoutePreviewState } from './use-worker-route-preview'
import { styles as stylesLight } from './active-body-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'
import { getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import { typography } from '@/design/theme'

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5PrimaryFillComponent = ComponentType<{
  disabled: boolean
  variant?: 'default' | 'source'
}>

type WorkerV5EtaSummaryComponent = ComponentType<{
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  route?: WorkerV5RoutePreview | null
}>

type WorkerV5RouteMapComponent = ComponentType<{
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
}>

// While the worker is on the way the customer follows the trip. The worker is told so, and told when the
// phone gives no position, so nobody assumes the customer can see a trip that is not being shared.
export function TripSharingNotice({ deal, language, locationStatus, tripShared }: {
  deal: LocalDeal | null
  language: AppLanguage
  locationStatus: WorkerV5RoutePreviewState['locationStatus']
  tripShared: WorkerV5RoutePreviewState['tripShared']
}) {
  const tokens = getWorkerThemeTokens(useWorkerThemeMode())
  if (deal?.status !== 'worker_on_way' || locationStatus === 'loading') return null
  // Only the server's receipt says the customer can follow: a phone with GPS is not proof.
  if (locationStatus === 'ready' && tripShared === null) return null
  const sharing = locationStatus === 'ready' && tripShared === true
  return (
    <Text style={[noticeStyles.text, { color: tokens.muted }]} testID="worker-v5-trip-sharing-notice">
      {sharing
        ? textByLanguage(language, 'Khách đang theo dõi vị trí của bạn trên đường tới. Vị trí được xoá khi bạn tới nơi.', 'The customer follows your position on the way. It is deleted when you arrive.')
        : textByLanguage(language, 'Chưa chia sẻ được vị trí của bạn nên khách chưa theo dõi được hành trình.', 'Your position is not shared yet, so the customer cannot follow the trip.')}
    </Text>
  )
}

const noticeStyles = StyleSheet.create({
  text: { ...typography.footnote },
})

export function WorkerV5RouteEtaBody({
  actionBusy,
  caseWideAura,
  deal,
  etaSummaryComponent: EtaSummaryCard,
  language,
  navigateJobChat,
  onPrimary,
  primaryLabel,
  primaryFill,
  reduceTransparency,
  routeMapComponent: RouteMapStage,
  routePreview,
  zipAura,
}: {
  actionBusy: boolean
  caseWideAura: WorkerV5CaseAuraComponent
  deal: LocalDeal | null
  etaSummaryComponent: WorkerV5EtaSummaryComponent
  language: AppLanguage
  navigateJobChat: () => void
  onPrimary: () => void
  primaryLabel: string
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  routeMapComponent: WorkerV5RouteMapComponent
  routePreview: WorkerV5RoutePreviewState
  zipAura: WorkerV5CaseAuraComponent
}) {
  const styles = useWorkerThemedStyles(stylesLight)
  const pendingRouteLabel = workerV5PendingRouteLabel(routePreview, language)
  const etaSignal = routePreview.route
    ? workerV5LiveEtaSignal(routePreview.route, language)
    : buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = routePreview.route
    ? workerV5LiveDistanceSignal(routePreview.route, language)
    : buildWorkerV5RouteDistanceSignal(deal, language)
  const serviceLabel = localizedServiceLabel(
    deal?.broadcast?.serviceType ?? deal?.draft.serviceType ?? null,
    language,
  )
  const problemSummary = deal?.broadcast?.problemSummary?.trim()
    || deal?.draft.description?.trim()
    || textByLanguage(language, 'Chưa có mô tả công việc', 'No work description')
  const canAdvanceRoute = Boolean(deal) && !actionBusy

  return (
    <View style={styles.sectionStack}>
      <RouteMapStage deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <TripSharingNotice deal={deal} language={language} locationStatus={routePreview.locationStatus} tripShared={routePreview.tripShared} />
      <EtaSummaryCard deal={deal} language={language} reduceTransparency={reduceTransparency} route={routePreview.route} />
      <WorkerV5InfoGrid
        auraScope="ActiveRoute"
        items={[
          {
            label: textByLanguage(language, 'Quãng đường', 'Distance'),
            value: distanceSignal.hasSignal ? distanceSignal.label : pendingRouteLabel,
          },
          {
            label: textByLanguage(language, 'Thời gian dự kiến', 'Estimated time'),
            value: etaSignal.hasSignal
              ? ('value' in etaSignal ? etaSignal.value : etaSignal.label)
              : pendingRouteLabel,
          },
          { label: problemSummary, value: serviceLabel },
        ]}
        reduceTransparency={reduceTransparency}
      />
      <WorkerV5ActionRail
        caseWideAura={caseWideAura}
        primaryButtonFill={primaryFill}
        zipAura={zipAura}
        primary={primaryLabel}
        primaryDisabled={!canAdvanceRoute}
        primaryTestID="worker-v5-route-arrival-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Liên hệ khách', 'Contact customer')}
        secondaryTestID="worker-v5-route-contact-action"
        onPrimary={canAdvanceRoute ? onPrimary : undefined}
        onSecondary={navigateJobChat}
      />
    </View>
  )
}

function workerV5PendingRouteLabel(
  routePreview: WorkerV5RoutePreviewState,
  language: AppLanguage,
) {
  if (!routePreview.hasRouteDestination) {
    return textByLanguage(language, 'Chưa mở điểm đến', 'Destination not released')
  }
  if (routePreview.locationStatus === 'loading') {
    return textByLanguage(language, 'Đang lấy vị trí', 'Getting location')
  }
  if (routePreview.locationStatus === 'denied') {
    return textByLanguage(language, 'Không có vị trí hiện tại', 'Current location unavailable')
  }
  if (routePreview.locationStatus === 'unavailable') {
    return textByLanguage(language, 'Chưa lấy được vị trí', 'Location unavailable')
  }
  return textByLanguage(language, 'Đang tính lộ trình', 'Calculating route')
}

export const WorkerV5InProgressTravelGate = memo(function WorkerV5InProgressTravelGate({
  actionBusy,
  deal,
  language,
  navigateJobChat,
  onArrivalAcknowledged,
  onTravelAction,
  reduceTransparency,
  routeMapComponent,
}: {
  actionBusy: boolean
  deal: LocalDeal | null
  language: AppLanguage
  navigateJobChat: () => void
  onArrivalAcknowledged: () => void
  onTravelAction: () => void
  reduceTransparency: boolean
  routeMapComponent: WorkerV5RouteMapComponent
}) {
  const routePreview = useWorkerV5RoutePreview(deal, true)
  const isResumingAtArrival = deal?.status === 'arrived'
  const confirmArrivalGate = () => {
    if (isResumingAtArrival) {
      onArrivalAcknowledged()
      return
    }
    onTravelAction()
  }
  return (
    <WorkerV5RouteEtaBody
      actionBusy={actionBusy}
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      deal={deal}
      etaSummaryComponent={WorkerV5EtaSummaryCard}
      language={language}
      navigateJobChat={navigateJobChat}
      onPrimary={confirmArrivalGate}
      primaryLabel={isResumingAtArrival
        ? textByLanguage(language, 'Mở bước check-in', 'Open check-in step')
        : deal?.status === 'worker_matched'
          ? textByLanguage(language, 'Bắt đầu di chuyển', 'Start travel')
          : textByLanguage(language, 'Xác nhận đã tới', 'Confirm arrival')}
      primaryFill={WorkerV5PrimaryButtonFill}
      reduceTransparency={reduceTransparency}
      routeMapComponent={routeMapComponent}
      routePreview={routePreview}
      zipAura={WorkerV5CustomerZipMintAura}
    />
  )
})
