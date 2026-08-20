import { Pressable, View, Text as RNText, type ImageSourcePropType, type TextProps } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'

import type { LocalDeal } from '@nestscout/shared'
import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
import type { WorkerV5ScreenDefinition, WorkerV5ScreenId } from '../dock/types'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { prototypeStyles } from './worker-jobs-zip-prototype-styles'

export type WorkerJobsLegacyPrototypeRuntime = ReturnType<typeof useFrontendWorkflow>

export type WorkerJobsLegacyPrototypeStage = 'payment-confirmed'

export type WorkerJobsLegacyPrototypeBodyProps = {
  actionBusy: boolean
  language: AppLanguage
  navigateActiveJobChat: () => void
  navigateJobChat: () => void
  navigateNext: () => void
  navigateToScreen: (id: WorkerV5ScreenId) => void
  prototypeMode: boolean
  prototypeStage?: WorkerJobsLegacyPrototypeStage
  reduceMotion: boolean
  reduceTransparency: boolean
  routePreview: WorkerV5RoutePreviewState
  runRouteAction: () => void | Promise<void>
  runWorkerAction: (
    action: () => Promise<boolean>,
    options?: { navigateOnSuccess?: boolean },
  ) => void | Promise<void>
  runtime: WorkerJobsLegacyPrototypeRuntime
  screen: WorkerV5ScreenDefinition
}

export const workerJobsLegacyPrototypeOpportunityCutouts = {
  journey: require('@/assets/client-image-icons/client-booking-journey-workart-cutout.png') as ImageSourcePropType,
  electrical: require('@/assets/client-image-icons/worker-jobs-workart-electrical-transparent.png') as ImageSourcePropType,
  plumbing: require('@/assets/client-image-icons/worker-jobs-workart-plumbing-transparent.png') as ImageSourcePropType,
  cleaning: require('@/assets/client-image-icons/worker-jobs-workart-cleaning-transparent.png') as ImageSourcePropType,
  hvac: require('@/assets/client-image-icons/worker-jobs-workart-hvac-transparent.png') as ImageSourcePropType,
  handyman: require('@/assets/client-image-icons/worker-jobs-workart-handyman-transparent.png') as ImageSourcePropType,
  upholstery: require('@/assets/client-image-icons/worker-jobs-workart-upholstery-transparent.png') as ImageSourcePropType,
} as const

export const workerJobsLegacyPrototypeStageSevenArtwork = require('@/assets/client-image-icons/worker-stage-seven-approval-workart-transparent.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageEightCompletionWorkart = require('@/assets/client-image-icons/worker-stage-eight-completion-record-workart-transparent.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageNineWorkart = require('@/assets/client-image-icons/worker-stage-nine-completion-workart.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageTenWorkart = require('@/assets/client-image-icons/worker-stage-ten-earnings-workart.png') as ImageSourcePropType
export const workerJobsLegacyPrototypeStageElevenWorkart = require('@/assets/client-image-icons/worker-stage-eleven-payment-workart.png') as ImageSourcePropType

export type WorkerJobsLegacyPrototypePreviewJob = {
  id: string
  artwork: keyof typeof workerJobsLegacyPrototypeOpportunityCutouts
  meta: Record<AppLanguage, string>
  price: Record<AppLanguage, string>
  status: Record<AppLanguage, string>
  time: Record<AppLanguage, string>
  title: Record<AppLanguage, string>
}

export const workerJobsLegacyPrototypePreviewJob: WorkerJobsLegacyPrototypePreviewJob = {
  artwork: 'journey',
  id: 'worker-jobs-prototype-preview-job',
  meta: { en: 'District 3 · Sofa cleaning', vi: 'Quận 3 · Vệ sinh sofa' },
  price: { en: 'Service price · 150k–240k', vi: 'Giá dịch vụ · 150k–240k' },
  status: { en: 'New opportunity', vi: 'Cơ hội mới' },
  time: { en: 'Today, 14:00', vi: 'Hôm nay, 14:00' },
  title: { en: 'Sofa cleaning', vi: 'Vệ sinh sofa' },
}

export function workerJobsLegacyPrototypeOpportunityArtwork(deal: LocalDeal | null, previewJob?: WorkerJobsLegacyPrototypePreviewJob | null) {
  if (previewJob) return workerJobsLegacyPrototypeOpportunityCutouts[previewJob.artwork]

  switch (deal?.draft.serviceType) {
    case 'electrical':
      return workerJobsLegacyPrototypeOpportunityCutouts.electrical
    case 'plumbing':
      return workerJobsLegacyPrototypeOpportunityCutouts.plumbing
    case 'cleaning':
      return workerJobsLegacyPrototypeOpportunityCutouts.cleaning
    case 'hvac':
      return workerJobsLegacyPrototypeOpportunityCutouts.hvac
    case 'handyman':
      return workerJobsLegacyPrototypeOpportunityCutouts.handyman
    case 'upholstery':
      return workerJobsLegacyPrototypeOpportunityCutouts.upholstery
    default:
      return workerJobsLegacyPrototypeOpportunityCutouts.journey
  }
}

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[prototypeStyles.text, style]} />
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

export type WorkerJobsStageTwoIconName = 'request' | 'home' | 'spray' | 'service' | 'inbox' | 'wallet' | 'photo' | 'location' | 'profile' | 'price' | 'tools' | 'shield' | 'check' | 'alert' | 'time'

export function WorkerJobsStageTwoIcon({ color: iconColor, name, size = 18 }: { color: string; name: WorkerJobsStageTwoIconName; size?: number }) {
  const strokeProps = { fill: 'none' as const, stroke: iconColor, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.45 }

  return (
    <Svg height={size} viewBox="0 0 20 20" width={size}>
      {name === 'request' ? (
        <>
          <Path d="M5.2 2.8h6l3.6 3.6v10.8H5.2V2.8Z" {...strokeProps} />
          <Path d="M11.2 2.8v3.6h3.6M7.6 10h4.8M7.6 13h3.4" {...strokeProps} />
        </>
      ) : name === 'home' ? (
        <>
          <Path d="m3.1 9.2 6.9-5.7 6.9 5.7" {...strokeProps} />
          <Path d="M4.8 8.6v7.1h10.4V8.6M8 15.7v-4h4v4" {...strokeProps} />
        </>
      ) : name === 'spray' ? (
        <>
          <Path d="M7.1 8.1h6.7v8.4H7.1V8.1Z" {...strokeProps} />
          <Path d="M8.4 8.1V5.8h4.2l1.6 1.5M9.5 5.8V3.9h4.2l2.2 1.7M8.8 11h3.3M8.8 13.6h2.5" {...strokeProps} />
          <Path d="M15.9 6h1.9" {...strokeProps} />
        </>
      ) : name === 'service' ? (
        <>
          <Rect height={10.5} rx={2} width={15.8} x={2.1} y={6.5} {...strokeProps} />
          <Path d="M7 6.5V4.8c0-.8.6-1.3 1.3-1.3h3.4c.7 0 1.3.5 1.3 1.3v1.7M2.6 10.4h14.8M8.3 10.4h3.4M10 10.4v3.1" {...strokeProps} />
        </>
      ) : name === 'inbox' ? (
        <>
          <Path d="M3.4 7.1h13.2l1.1 7.1c.2 1.1-.6 2.1-1.7 2.1H4c-1.1 0-1.9-1-1.7-2.1l1.1-7.1Z" {...strokeProps} />
          <Path d="m3.4 7.1 2.3-3.3h8.6l2.3 3.3M6.1 11.1h2.1l1.1 1.9h1.4l1.1-1.9h2.1" {...strokeProps} />
        </>
      ) : name === 'wallet' ? (
        <>
          <Path d="M4.2 4.2h11.6c1.1 0 2 .9 2 2v9.1c0 1.1-.9 2-2 2H4.2c-1.1 0-2-.9-2-2V6.2c0-1.1.9-2 2-2Z" {...strokeProps} />
          <Path d="M2.5 7.3h15.2M12.4 10.2h5.3v3.5h-5.3a1.75 1.75 0 0 1 0-3.5Z" {...strokeProps} />
          <Circle cx={13.9} cy={11.95} fill={iconColor} r={0.65} />
        </>
      ) : name === 'photo' ? (
        <>
          <Rect height={12.8} rx={2} width={15.6} x={2.2} y={3.6} {...strokeProps} />
          <Circle cx={6.3} cy={7.4} fill={iconColor} r={1.05} />
          <Path d="m4.2 14.2 3.3-3.4 2.4 2.1 2-2 3.8 3.3" {...strokeProps} />
        </>
      ) : name === 'location' ? (
        <>
          <Path d="M10 2.8a4.2 4.2 0 0 0-4.2 4.2c0 3.1 4.2 7.5 4.2 7.5s4.2-4.4 4.2-7.5A4.2 4.2 0 0 0 10 2.8Z" {...strokeProps} />
          <Circle cx={10} cy={7} fill={iconColor} r={1.4} />
        </>
      ) : name === 'profile' ? (
        <>
          <Circle cx={10} cy={6.5} fill="none" r={2.5} stroke={iconColor} strokeWidth={1.45} />
          <Path d="M4.9 16.1a5.3 5.3 0 0 1 10.2 0" {...strokeProps} />
        </>
      ) : name === 'price' ? (
        <>
          <Rect height={11.8} rx={2} width={14.8} x={2.6} y={4.3} {...strokeProps} />
          <Path d="M3.2 8h13.6" {...strokeProps} />
          <Circle cx={13.8} cy={12.5} fill={iconColor} r={1} />
        </>
      ) : name === 'tools' ? (
        <>
          <Path d="M12.6 3.6a3.6 3.6 0 0 0-3.2 4.9l-5 5a1.7 1.7 0 0 0 2.4 2.4l5-5a3.6 3.6 0 0 0 4.9-3.2l-2.1 1.3-2.2-.6-.6-2.2 1.3-2.1Z" {...strokeProps} />
        </>
      ) : name === 'shield' ? (
        <>
          <Path d="m10 2.7 5.6 2.1v4.4c0 3.2-2.2 5.7-5.6 7-3.4-1.3-5.6-3.8-5.6-7V4.8L10 2.7Z" {...strokeProps} />
          <Path d="m7.3 9.6 1.8 1.8 3.7-3.7" {...strokeProps} />
        </>
      ) : name === 'check' ? (
        <>
          <Circle cx={10} cy={10} fill="none" r={7.1} stroke={iconColor} strokeWidth={1.45} />
          <Path d="m6.4 10.1 2.2 2.2 4.8-4.8" {...strokeProps} />
        </>
      ) : name === 'alert' ? (
        <>
          <Path d="m10 2.8 7 13H3l7-13Z" {...strokeProps} />
          <Path d="M10 7.1v4M10 13.3h.1" {...strokeProps} />
        </>
      ) : (
        <>
          <Circle cx={10} cy={10} fill="none" r={7.1} stroke={iconColor} strokeWidth={1.45} />
          <Path d="M10 6.4v4.2l2.8 1.7" {...strokeProps} />
        </>
      )}
    </Svg>
  )
}

export function WorkerJobsLegacyPrototypeStageActionButton({
  disabled,
  label,
  onPress,
  primary,
  testID,
}: {
  disabled?: boolean
  label: string
  onPress: () => void
  primary?: boolean
  testID: string
}) {
  const isDisabled = Boolean(disabled)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        prototypeStyles.stageActionButton,
        primary ? prototypeStyles.stageActionPrimary : prototypeStyles.stageActionSecondary,
        isDisabled && prototypeStyles.stageActionDisabled,
        pressed && !isDisabled && { opacity: 0.84 },
      ]}
      testID={testID}
    >
      {primary && !isDisabled ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null}
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[prototypeStyles.stageActionText, primary ? prototypeStyles.stageActionPrimaryText : prototypeStyles.stageActionSecondaryText, isDisabled && prototypeStyles.stageActionDisabledText]}>{label}</Text>
    </Pressable>
  )
}
