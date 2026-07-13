import type { ComponentType } from 'react'
import { View, type StyleProp, type ViewStyle } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import {
  buildWorkerV5AcceptEtaSignal,
  buildWorkerV5RouteDistanceSignal,
  workerV5RouteMapLabelFromDeal,
} from '../ui/route'
import { routeDestinationLabel } from '../ui/labels'
import { WorkerV5InfoGrid } from './shared-surfaces'
import { WorkerV5ActionRail } from './advisory-surfaces'
import type { WorkerV5RoutePreview, WorkerV5RoutePreviewState } from './use-worker-route-preview'
import { styles } from './active-body-styles'

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
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = buildWorkerV5RouteDistanceSignal(deal, language)
  const destinationSignal = workerV5RouteMapLabelFromDeal(deal) ?? (deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có việc', 'No work'))
  const canAdvanceRoute = Boolean(deal) && !actionBusy

  return (
    <View style={styles.sectionStack}>
      <RouteMapStage deal={deal} language={language} reduceTransparency={reduceTransparency} routePreview={routePreview} />
      <EtaSummaryCard deal={deal} language={language} reduceTransparency={reduceTransparency} route={routePreview.route} />
      <WorkerV5InfoGrid
        items={[
          { label: textByLanguage(language, 'Quãng đường', 'Distance'), value: distanceSignal.label },
          { label: textByLanguage(language, 'Tín hiệu đường đi', 'Route signal'), value: etaSignal.hasSignal ? etaSignal.label : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data') },
          { label: textByLanguage(language, 'Vùng đến nơi', 'Arrival zone'), value: destinationSignal },
        ]}
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
