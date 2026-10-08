import { Fragment, useId, useState, type ReactNode } from 'react'
import {
  Pressable,
  StyleSheet,
  View,
  Text as RNText,
  useWindowDimensions,
  type ImageSourcePropType,
  type LayoutChangeEvent,
  type TextProps,
  type TextStyle,
} from 'react-native'
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg'

import type { LocalDeal } from '@nestscout/shared'
import { PrimaryCtaFill } from '@/components/ui/primary-cta-fill'
import { color, component } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { WorkerV5PrimaryButtonFill } from '../ui/primitives-surfaces'
import type { WorkerV5ScreenDefinition, WorkerV5ScreenId } from '../dock/types'
import type { WorkerThemeTokens } from '../worker-theme'
import { STAGE_MIN_TAP_SIZE, stageButtonHeight, stageLayout, stageMetric, stageTypography } from './stage-ratio'
import type { WorkerV5RoutePreviewState } from './use-worker-route-preview'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { prototypeStyles as prototypeStylesLight } from './worker-jobs-zip-prototype-styles'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'
import {
  stageTwoCardTokens,
  stageTwoPalette,
  type StageTwoPillTone,
  type StageTwoTextKind,
} from './worker-jobs-zip-prototype-style-stage-two'
import { FillSvg } from '@/components/ui/fill-svg'

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
  const prototypeStyles = useWorkerThemedStyles(prototypeStylesLight)
  return <RNText {...props} style={[prototypeStyles.text, style]} />
}

export function WorkerJobsLegacyPrototypeMetaIcon({ kind, size = 16 }: { kind: 'photo' | 'price' | 'status' | 'time'; size?: number }) {
  const prototypeStyles = useWorkerThemedStyles(prototypeStylesLight)
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
  const prototypeStyles = useWorkerThemedStyles(prototypeStylesLight)
  const isDisabled = Boolean(disabled)
  const { width: windowWidth } = useWindowDimensions()
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
      <Text adjustsFontSizeToFit minimumFontScale={0.84} numberOfLines={1} style={[stageTypography('body', windowWidth), prototypeStyles.stageActionText, primary ? prototypeStyles.stageActionPrimaryText : prototypeStyles.stageActionSecondaryText, isDisabled && prototypeStyles.stageActionDisabledText]}>{label}</Text>
    </Pressable>
  )
}

const stageTwo = stageTwoCardTokens
const stageTwoGeometry = stageTwo.geometry

export type WorkerJobsStageTwoGlyphName =
  | 'banknote'
  | 'briefcase'
  | 'bubble'
  | 'check'
  | 'clipboard'
  | 'clock'
  | 'coins'
  | 'envelope'
  | 'home'
  | 'lock'
  | 'map'
  | 'photo'
  | 'receipt'
  | 'shieldCheck'
  | 'tag'
  | 'user'
  | 'wallet'
  | 'wrench'

/**
 * Every mark is stroked at one weight and drawn inside the same ink square, x and y within
 * [3.5, 20.6], so one box size reads as one visual size. No two marks share a silhouette, which
 * keeps a section header from being told apart from its own rows by size alone.
 */
const STAGE_TWO_GLYPHS: Record<WorkerJobsStageTwoGlyphName, ReactNode> = {
  banknote: (
    <>
      <Rect height={12.4} rx={2.6} width={17} x={3.5} y={5.8} />
      <Circle cx={12} cy={12} r={2.8} />
      <Path d="M7.2 10.2v3.6M16.8 10.2v3.6" />
    </>
  ),
  briefcase: (
    <>
      <Rect height={12.4} rx={2.6} width={16.4} x={3.8} y={7.4} />
      <Path d="M8.8 7.4V5.6a1.8 1.8 0 0 1 1.8-1.8h2.8a1.8 1.8 0 0 1 1.8 1.8v1.8" />
      <Path d="M3.8 12h16.4" />
      <Path d="M10.4 12v1.8h3.2V12" />
    </>
  ),
  bubble: (
    <>
      <Path d="M12 3.9c4.4 0 8 2.85 8 6.55s-3.6 6.55-8 6.55c-.8 0-1.58-.1-2.3-.28L5.2 20.1l1.15-3.35C4.9 15.55 4 13.2 4 10.45 4 6.75 7.6 3.9 12 3.9Z" />
      <Path d="M9 9.7h6M9 12.6h4" />
    </>
  ),
  check: (
    <>
      <Circle cx={12} cy={12} r={8.4} />
      <Path d="m7.9 12.1 2.7 2.7 5.5-5.9" />
    </>
  ),
  clipboard: (
    <>
      <Rect height={15.2} rx={2.6} width={15.6} x={4.2} y={5.2} />
      <Path d="M9 5.2V4.3a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 4.3v.9" />
      <Path d="M8.4 10.6h7.2M8.4 13.8h7.2M8.4 17h4.4" />
    </>
  ),
  clock: (
    <>
      <Circle cx={12} cy={12} r={8.4} />
      <Path d="M12 6.9V12l3.6 2.2" />
    </>
  ),
  coins: (
    <>
      <Circle cx={9.4} cy={9.4} r={5.6} />
      <Path d="M14.99 9.01A5.6 5.6 0 1 1 9.01 14.99" />
      <Path d="M9.4 7.2v4.4" />
    </>
  ),
  envelope: (
    <>
      <Rect height={14} rx={2.4} width={16.6} x={3.7} y={5} />
      <Path d="m4.7 7 7.3 5.6 7.3-5.6" />
    </>
  ),
  home: (
    <>
      <Path d="m3.9 10.9 8.1-6.9 8.1 6.9" />
      <Path d="M5.9 10.1v9h12.2v-9" />
      <Path d="M9.9 19.1v-4.9h4.2v4.9" />
    </>
  ),
  lock: (
    <>
      <Rect height={10.4} rx={2.6} width={15.2} x={4.4} y={10} />
      <Path d="M8 10V7.6a4 4 0 0 1 8 0V10" />
      <Path d="M12 14v2.6" />
    </>
  ),
  map: (
    <>
      <Path d="M3.9 6.9 9.3 4.6v12.5l-5.4 2.3V6.9Z" />
      <Path d="M9.3 4.6l5.4 2.3v12.5L9.3 17.1V4.6Z" />
      <Path d="M14.7 6.9l5.4-2.3v12.5l-5.4 2.3V6.9Z" />
    </>
  ),
  photo: (
    <>
      <Rect height={14} rx={2.6} width={16.2} x={3.9} y={5} />
      <Circle cx={8.6} cy={9.8} r={1.4} />
      <Path d="m4.6 16.6 4.3-4.3 3 2.7 2.6-2.6 4.6 4.2" />
    </>
  ),
  receipt: (
    <>
      <Path d="M4.6 3.7h14.8v17l-2.47-1.5-2.47 1.5-2.46-1.5-2.47 1.5-2.47-1.5L4.6 20.7V3.7Z" />
      <Path d="M8.4 8.6h7.2M8.4 12.2h4.8" />
    </>
  ),
  shieldCheck: (
    <>
      <Path d="M12 3.6l7.3 2.45v5.95c0 4.3-2.9 7.75-7.3 9.2-4.4-1.45-7.3-4.9-7.3-9.2V6.05L12 3.6Z" />
      <Path d="m8.7 12.2 2.4 2.4 3.9-4.2" />
    </>
  ),
  tag: (
    <>
      <Path d="M11.6 3.9h7.1a1.6 1.6 0 0 1 1.6 1.6v7.1a1.6 1.6 0 0 1-.47 1.13l-6.5 6.5a1.6 1.6 0 0 1-2.26 0l-7.1-7.1a1.6 1.6 0 0 1 0-2.26l6.5-6.5a1.6 1.6 0 0 1 1.13-.47Z" />
      <Circle cx={16.2} cy={7.8} r={1.5} />
    </>
  ),
  user: (
    <>
      <Circle cx={12} cy={8.6} r={4} />
      <Path d="M4.4 20.2a7.6 7.6 0 0 1 15.2 0" />
    </>
  ),
  wallet: (
    <>
      <Rect height={13} rx={2.6} width={16.8} x={3.6} y={5.6} />
      <Path d="M3.6 9.8h16.8" />
      <Path d="M14.6 12.6h5.8v3.6h-5.8a1.8 1.8 0 0 1 0-3.6Z" />
    </>
  ),
  // The drawn wrench is 14.6 across against 16 to 17 for its neighbours; the stroke is divided by the
  // same factor so the scale-up does not thicken it.
  wrench: (
    <G strokeWidth={stageTwo.stroke.glyph / 1.12} transform="translate(12 12) scale(1.12) translate(-12.19 -11.76)">
      <Path d="M14.79 4.44a4.14 4.14 0 0 0-3.68 5.635l-5.75 5.75a1.955 1.955 0 0 0 2.76 2.76l5.75-5.75a4.14 4.14 0 0 0 5.635-3.68l-2.415 1.495-2.53-.69-.69-2.53 1.495-2.415Z" />
    </G>
  ),
}

export function WorkerJobsStageTwoGlyph({ color: ink, name, size, strokeWidth }: {
  color: string
  name: WorkerJobsStageTwoGlyphName
  size: number
  strokeWidth: number
}) {
  return (
    <Svg height={size} pointerEvents="none" viewBox="0 0 24 24" width={size}>
      <G fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth}>
        {STAGE_TWO_GLYPHS[name]}
      </G>
    </Svg>
  )
}

export function useWorkerJobsStageTwoScale(tokens: WorkerThemeTokens) {
  const { width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = useState(0)
  const unit = (measured || windowWidth) / stageTwo.canvasWidth
  const px = (canvasSize: number) => canvasSize * unit
  const text = (kind: StageTwoTextKind): TextStyle => {
    const spec = stageTwo.type[kind]
    return { ...stageTypography(spec.role, windowWidth), fontWeight: spec.weight }
  }

  return {
    onLayout: (event: LayoutChangeEvent) => {
      const next = event.nativeEvent.layout.width
      if (next > 0 && Math.abs(next - measured) > 0.5) setMeasured(next)
    },
    metric: (value: number) => stageMetric(value, windowWidth),
    palette: stageTwoPalette(tokens),
    px,
    windowWidth,
    text,
  }
}

export type WorkerJobsStageTwoScale = ReturnType<typeof useWorkerJobsStageTwoScale>


type StageTwoGradientVector = { x1: number; x2: number; y1: number; y2: number }

function StageTwoGradient({ colors, locations, vector }: {
  colors: readonly string[]
  locations?: readonly number[]
  vector?: StageTwoGradientVector
}) {
  // SVG ids are document-global on web, so each surface needs its own.
  const id = `stageTwoGradient${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const last = Math.max(colors.length - 1, 1)

  return (
    <FillSvg preserveAspectRatio="none">
      <Defs>
        <LinearGradient
          id={id}
          {...(vector
            ? { gradientUnits: 'userSpaceOnUse' as const, ...vector }
            : { x1: '0%', x2: '0%', y1: '0%', y2: '100%' })}
        >
          {colors.map((stopColor, index) => (
            <Stop key={`${stopColor}-${index}`} offset={locations?.[index] ?? index / last} stopColor={stopColor} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect fill={`url(#${id})`} height="100%" width="100%" />
    </FillSvg>
  )
}

export function WorkerJobsStageTwoCard({ children, scale: { metric, palette, px }, testID }: {
  children: ReactNode
  scale: WorkerJobsStageTwoScale
  testID?: string
}) {
  return (
    <View
      style={{
        backgroundColor: palette.card,
        borderColor: palette.cardBorder ?? undefined,
        borderRadius: metric(stageLayout.cardRadius),
        borderWidth: palette.cardBorder ? 1 : 0,
        boxShadow: palette.cardShadow
          ? `0 ${px(stageTwoGeometry.cardShadowY)}px ${px(stageTwoGeometry.cardShadowBlur)}px ${palette.cardShadow}`
          : undefined,
        paddingBottom: metric(stageLayout.cardPadding),
        paddingHorizontal: metric(stageLayout.cardPadding),
        paddingTop: metric(stageLayout.cardPadding),
      }}
      testID={testID}
    >
      {children}
    </View>
  )
}

export type WorkerJobsStageTwoRowData = {
  glyph: WorkerJobsStageTwoGlyphName
  key: string
  meta?: string
  metaLines?: number
  status?: string
  testID?: string
  title: string
  tone?: StageTwoPillTone
}

export function WorkerJobsStageTwoRow({ glyph, meta, metaLines = 3, scale, status, testID, title, tone = 'neutral' }:
  Omit<WorkerJobsStageTwoRowData, 'key'> & { scale: WorkerJobsStageTwoScale }) {
  const { metric, palette, px, text, windowWidth } = scale
  const pill = palette.pill[tone]

  return (
    <View
      style={{ alignItems: 'center', flexDirection: 'row', gap: px(stageTwoGeometry.contentGap), minHeight: px(stageTwoGeometry.rowHeight) }}
      testID={testID}
    >
      <WorkerJobsStageTwoGlyph color={palette.glyph} name={glyph} size={px(stageTwoGeometry.glyph)} strokeWidth={stageTwo.stroke.glyph} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={[text('rowTitle'), { color: palette.rowTitle }]}>{title}</Text>
        {meta ? (
          <Text numberOfLines={metaLines} style={[text('rowSub'), { color: palette.rowSub, marginTop: px(stageTwoGeometry.rowSubTop) }]}>{meta}</Text>
        ) : null}
      </View>

      {status ? (
        <View
          style={{
            alignItems: 'center',
            borderRadius: px(stageTwoGeometry.pillHeight) / 2,
            flexShrink: 0,
            justifyContent: 'center',
            minHeight: px(stageTwoGeometry.pillHeight),
            minWidth: px(stageTwoGeometry.pillMinWidth[tone]),
            overflow: 'hidden',
            paddingHorizontal: px(stageTwoGeometry.pillPaddingX),
          }}
        >
          <StageTwoGradient colors={pill.colors} />
          <Text numberOfLines={1} style={[text('pill'), { color: pill.text }]}>{status}</Text>
        </View>
      ) : null}
    </View>
  )
}

export function WorkerJobsStageTwoSection({ description, glyph, rows, scale, testID, title }: {
  description: string
  glyph: WorkerJobsStageTwoGlyphName
  rows: readonly WorkerJobsStageTwoRowData[]
  scale: WorkerJobsStageTwoScale
  testID: string
  title: string
}) {
  const { metric, palette, px, text, windowWidth } = scale

  return (
    <WorkerJobsStageTwoCard scale={scale} testID={testID}>
      <View style={{ alignItems: 'center', flexDirection: 'row', gap: px(stageTwoGeometry.contentGap) }}>
        <WorkerJobsStageTwoGlyph color={palette.glyph} name={glyph} size={px(stageTwoGeometry.glyph)} strokeWidth={stageTwo.stroke.glyph} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[text('sectionTitle'), { color: palette.sectionTitle }]}>{title}</Text>
          <Text style={[text('sectionSub'), { color: palette.sectionSub, marginTop: px(stageTwoGeometry.sectionSubTop) }]}>{description}</Text>
        </View>
      </View>
      <View style={{ backgroundColor: palette.line, height: 1, marginBottom: px(stageTwoGeometry.dividerBottom), marginTop: px(stageTwoGeometry.dividerTop) }} />
      {rows.map(({ key, ...row }, index) => (
        <Fragment key={key}>
          {index > 0 ? <View style={{ backgroundColor: palette.line, height: 1, marginVertical: px(stageTwoGeometry.rowDividerGap) }} /> : null}
          <WorkerJobsStageTwoRow {...row} scale={scale} />
        </Fragment>
      ))}
    </WorkerJobsStageTwoCard>
  )
}

export function WorkerJobsStageTwoAction({ accessibilityLabel, disabled, label, onPress, scale, testID, variant }: {
  accessibilityLabel: string
  disabled: boolean
  label: string
  onPress: () => void
  scale: WorkerJobsStageTwoScale
  testID: string
  variant: 'ghost' | 'primary'
}) {
  const { metric, palette, px, text, windowWidth } = scale
  const primary = variant === 'primary'
  const height = stageButtonHeight(windowWidth)
  const radius = metric(stageLayout.buttonRadius)
  const ink = disabled ? palette.disabled.text : primary ? palette.primary.text : palette.ghost.text
  const showFill = primary && !disabled

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: disabled ? palette.disabled.background : primary ? undefined : palette.ghost.background,
        borderColor: disabled ? palette.disabled.border : primary ? component.button.primary.border : palette.ghost.border,
        borderRadius: radius,
        borderWidth: disabled || primary ? 1 : Math.max(1, px(2)),
        boxShadow: disabled
          ? undefined
          : primary
            ? component.button.primary.boxShadow
            : palette.ghost.highlight
              ? `inset 0 1px 0 ${palette.ghost.highlight}`
              : undefined,
        flex: primary ? stageTwoGeometry.actionPrimaryFlex : stageTwoGeometry.actionGhostFlex,
        justifyContent: 'center',
        minHeight: height,
        opacity: pressed && !disabled ? 0.84 : 1,
        paddingHorizontal: px(14),
      })}
      testID={testID}
    >
      {showFill ? (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
          <PrimaryCtaFill radius={0} />
        </View>
      ) : null}
      <Text numberOfLines={2} style={[text('action'), { color: ink, textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  )
}
