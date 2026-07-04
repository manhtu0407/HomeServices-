import type { ComponentType, ReactNode } from 'react'
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import { textByLanguage } from '../ui/format'
import {
  buildWorkerV5AcceptEtaSignal,
  buildWorkerV5RouteDistanceSignal,
  workerV5RouteMapLabelFromDeal,
} from '../ui/route'
import { routeDestinationLabel } from '../ui/labels'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WorkerV5InfoGrid } from './shared-surfaces'
import { WorkerV5ActionRail } from './advisory-surfaces'
import {
  WorkerV5CheckInChecklist,
  WorkerV5CheckInHero,
  WorkerV5CustomerContactCard,
} from './checkin-surfaces'
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

export function WorkerV5RouteEtaBody({
  actionBusy,
  caseWideAura,
  deal,
  etaSummaryCard,
  language,
  navigateJobChat,
  navigateNext,
  primaryFill,
  reduceTransparency,
  routeMapStage,
  zipAura,
}: {
  actionBusy: boolean
  caseWideAura: WorkerV5CaseAuraComponent
  deal: LocalDeal | null
  etaSummaryCard: ReactNode
  language: AppLanguage
  navigateJobChat: () => void
  navigateNext: () => void
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  routeMapStage: ReactNode
  zipAura: WorkerV5CaseAuraComponent
}) {
  const etaSignal = buildWorkerV5AcceptEtaSignal(deal, language)
  const distanceSignal = buildWorkerV5RouteDistanceSignal(deal, language)
  const destinationSignal = workerV5RouteMapLabelFromDeal(deal) ?? (deal ? routeDestinationLabel(deal, language) : textByLanguage(language, 'Chưa có việc', 'No work'))
  const canOpenArrival = !actionBusy

  return (
    <View style={styles.sectionStack}>
      {routeMapStage}
      {etaSummaryCard}
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
        primary={textByLanguage(language, 'Tôi đã đến nơi', 'I have arrived')}
        primaryDisabled={!canOpenArrival}
        primaryTestID="worker-v5-route-arrival-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Liên hệ khách', 'Contact customer')}
        secondaryTestID="worker-v5-route-contact-action"
        onPrimary={canOpenArrival ? navigateNext : undefined}
        onSecondary={navigateJobChat}
      />
    </View>
  )
}

export function WorkerV5ArrivalCheckInBody({
  actionBusy,
  caseWideAura,
  chatIcon,
  deal,
  language,
  mapIcon,
  navigateJobChat,
  navigateNext,
  phoneIcon,
  primaryFill,
  reduceTransparency,
  zipAura,
}: {
  actionBusy: boolean
  caseWideAura: WorkerV5CaseAuraComponent
  chatIcon: ImageSourcePropType
  deal: LocalDeal | null
  language: AppLanguage
  mapIcon: ImageSourcePropType
  navigateJobChat: () => void
  navigateNext: () => void
  phoneIcon: ImageSourcePropType
  primaryFill: WorkerV5PrimaryFillComponent
  reduceTransparency: boolean
  zipAura: WorkerV5CaseAuraComponent
}) {
  const canOpenInProgress = !actionBusy

  return (
    <View style={styles.sectionStack}>
      <WorkerV5CheckInHero
        caseWideAura={caseWideAura}
        deal={deal}
        language={language}
        mapIcon={mapIcon}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Theo việc thật', 'From real work')}
        title={textByLanguage(language, 'Khách hàng', 'Customer')}
      />
      <WorkerV5CustomerContactCard
        caseWideAura={caseWideAura}
        chatIcon={chatIcon}
        deal={deal}
        language={language}
        phoneIcon={phoneIcon}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Bắt buộc', 'Required')}
        title={textByLanguage(language, 'Trước khi ghi nhận', 'Before confirming')}
      />
      <WorkerV5CheckInChecklist
        caseWideAura={caseWideAura}
        deal={deal}
        language={language}
        reduceTransparency={reduceTransparency}
        zipAura={zipAura}
      />
      <WorkerV5ActionRail
        caseWideAura={caseWideAura}
        primaryButtonFill={primaryFill}
        zipAura={zipAura}
        primary={textByLanguage(language, 'Xác nhận đã đến', 'Confirm arrival')}
        primaryDisabled={!canOpenInProgress}
        primaryTestID="worker-v5-checkin-arrived-action"
        primaryVariant="source"
        reduceTransparency={reduceTransparency}
        secondary={textByLanguage(language, 'Liên hệ khách', 'Contact customer')}
        secondaryTestID="worker-v5-checkin-contact-action"
        onPrimary={canOpenInProgress ? navigateNext : undefined}
        onSecondary={navigateJobChat}
      />
    </View>
  )
}