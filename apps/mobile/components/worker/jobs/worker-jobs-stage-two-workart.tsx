import { Image } from 'expo-image'
import { View, type ImageSourcePropType } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { CustomerServiceId, LocalDeal, ServiceType } from '@nestscout/shared'
import { customerV21Assets, customerV21BookingWorkartAssets } from '@/components/customer/ui/assets'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { stageTwoStyles } from './worker-jobs-zip-prototype-styles'
import type { WorkerJobsLegacyPrototypePreviewJob } from './worker-jobs-zip-prototype-shared'

const SERVICE_WORKART_KEY: Record<ServiceType, CustomerServiceId> = {
  cleaning: 'home_cleaning',
  electrical: 'electrical',
  handyman: 'handyman_minor_installation',
  hvac: 'hvac_basic_maintenance',
  plumbing: 'plumbing',
  upholstery: 'upholstery_care',
}

const PREVIEW_WORKART_KEY: Record<WorkerJobsLegacyPrototypePreviewJob['artwork'], CustomerServiceId | null> = {
  cleaning: 'home_cleaning',
  electrical: 'electrical',
  handyman: 'handyman_minor_installation',
  hvac: 'hvac_basic_maintenance',
  journey: 'upholstery_care',
  plumbing: 'plumbing',
  upholstery: 'upholstery_care',
}

export function workerStageTwoOfferWorkartSource(
  deal: LocalDeal | null,
  previewJob: WorkerJobsLegacyPrototypePreviewJob | null,
): ImageSourcePropType {
  const serviceType = deal?.draft.serviceType
  if (serviceType) return customerV21BookingWorkartAssets[SERVICE_WORKART_KEY[serviceType]]

  const previewService = previewJob ? PREVIEW_WORKART_KEY[previewJob.artwork] : null
  return previewService ? customerV21BookingWorkartAssets[previewService] : customerV21Assets.bookingJourneyWorkart
}

function WorkerStageTwoOfferWorkartWash({ reduceTransparency, surfaceColor }: { reduceTransparency: boolean; surfaceColor: string }) {
  const gradientID = 'worker-v5-offer-detail-workart-wash'

  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={stageTwoStyles.heroWorkartWash}
      viewBox="0 0 100 120"
      width={42}
    >
      <Defs>
        <LinearGradient id={gradientID} x1="0%" x2="100%" y1="0%" y2="0%">
          <Stop offset="0%" stopColor={surfaceColor} stopOpacity={0} />
          <Stop offset="34%" stopColor={surfaceColor} stopOpacity={reduceTransparency ? 0.18 : 0.05} />
          <Stop offset="72%" stopColor={surfaceColor} stopOpacity={reduceTransparency ? 0.76 : 0.64} />
          <Stop offset="90%" stopColor={surfaceColor} stopOpacity={0.92} />
          <Stop offset="100%" stopColor={surfaceColor} stopOpacity={0.98} />
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${gradientID})`} height="120" width="100" />
    </Svg>
  )
}

export function WorkerStageTwoOfferWorkart({
  deal,
  panelColor,
  previewJob,
  reduceTransparency,
  surfaceColor,
}: {
  deal: LocalDeal | null
  panelColor: string
  previewJob: WorkerJobsLegacyPrototypePreviewJob | null
  reduceTransparency: boolean
  surfaceColor: string
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[stageTwoStyles.heroWorkartPanel, { backgroundColor: panelColor, pointerEvents: 'none' }]}
      testID="worker-v5-offer-detail-workart-panel"
    >
      <Image
        accessibilityIgnoresInvertColors
        contentFit="cover"
        source={workerStageTwoOfferWorkartSource(deal, previewJob)}
        style={stageTwoStyles.heroWorkart}
        testID="worker-v5-offer-detail-workart"
      />
      <WorkerStageTwoOfferWorkartWash reduceTransparency={reduceTransparency} surfaceColor={surfaceColor} />
    </View>
  )
}
