import { memo, type ComponentType } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
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
