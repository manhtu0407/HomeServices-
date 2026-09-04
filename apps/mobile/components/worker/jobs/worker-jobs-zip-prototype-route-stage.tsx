import type { LocalDeal } from '@nestscout/shared'
import { Pressable, View } from 'react-native'
import { color } from '@/design/theme'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import {
  buildWorkerV5AcceptEtaSignal,
  buildWorkerV5RouteDistanceSignal,
  workerV5ArrivalDestinationLabel,
  workerV5LiveDistanceSignal,
  workerV5LiveEtaSignal,
} from '../ui/route'
import { WorkerInteractiveRouteMapPrototype } from './worker-interactive-route-map-prototype'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import { prototypeStyles } from './worker-jobs-zip-prototype-styles'
import {
  Text,
  WorkerJobsLegacyPrototypeMetaIcon,
  type WorkerJobsLegacyPrototypeRuntime,
} from './worker-jobs-zip-prototype-shared'

function RouteMap({
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

function RouteEtaSummary({ deal, language, reduceTransparency, routePreview }: {
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

function RouteMetrics({ deal, language, reduceTransparency, routePreview }: {
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
        ? textByLanguage(language, 'Không có vị trí hiện tại', 'Current location unavailable')
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
    { label: textByLanguage(language, 'Quãng đường', 'Distance'), value: distanceSignal.hasSignal ? distanceSignal.label : pendingRouteLabel },
    { label: textByLanguage(language, 'Thời gian dự kiến', 'Estimated time'), value: etaSignal.hasSignal ? etaSignal.label : pendingRouteLabel },
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

function RouteActions({ actionBusy, language, onPrimary, onSecondary, primary, primaryDisabled, reduceTransparency }: {
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
      <RouteMap deal={deal} language={language} prototypeMode={prototypeMode} reduceMotion={reduceMotion} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <RouteEtaSummary deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <RouteMetrics deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <RouteActions
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
