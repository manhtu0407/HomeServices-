import { useEffect } from 'react'
import { Image, StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { MintAura } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelLottieView, kaelLottieRendererKind, type KaelLottieSource } from './kael-lottie-view'
import { resolveKaelMascotAsset, type KaelMascotEmotion, type KaelMascotState } from './kael-mascot-assets'

type LottieMarker = {
  cm?: string
  dr?: number
  tm?: number
}

type LottieMetadata = {
  fr?: number
  h?: number
  ip?: number
  markers?: LottieMarker[]
  nm?: string
  op?: number
  v?: string
  w?: number
}

type BowTimeline = {
  downEnd: number
  downStart: number
  durationMs: number
  returnStart: number
}

type KaelLottieAssetStatus = 'exact' | 'motion-guide' | 'missing'
type KaelRendererMode = 'auto' | 'image' | 'lottie'
type KaelMotionKind = 'welcome-bow' | 'state-enter'

type KaelMotionRendererProps = {
  emotion?: KaelMascotEmotion
  lottieAssetStatus?: KaelLottieAssetStatus
  lottieSource?: KaelLottieSource
  loop?: boolean
  motion?: KaelMotionKind
  renderer?: KaelRendererMode
  rigTestID?: string
  size?: number
  speed?: number
  state?: KaelMascotState
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: 'full' | 'head'
}

const DEFAULT_TIMELINE = {
  downEnd: 0.36,
  downStart: 0.14,
  durationMs: 1160,
  returnStart: 0.44,
}
const KAEL_SAFE_IMAGE_OFFSET_X = -4
const KAEL_SAFE_IMAGE_OFFSET_Y = 2
const KAEL_SAFE_IMAGE_SCALE = 1.1

function readMarker(asset: LottieMetadata | undefined, name: string, fallback: { dr: number; tm: number }) {
  const marker = asset?.markers?.find((item) => item.cm === name)
  return typeof marker?.tm === 'number' && typeof marker.dr === 'number' ? { dr: marker.dr, tm: marker.tm } : fallback
}

function readWelcomeBowTimeline(asset: LottieMetadata | undefined) {
  const fr = typeof asset?.fr === 'number' && asset.fr > 0 ? asset.fr : 30
  const ip = typeof asset?.ip === 'number' ? asset.ip : 0
  const op = typeof asset?.op === 'number' && asset.op > ip ? asset.op : 96
  const bowDownMarker = readMarker(asset, 'bow down', { dr: 16, tm: 14 })
  const returnMarker = readMarker(asset, 'return upright', { dr: 24, tm: 42 })
  const endFrame = Math.max(op, returnMarker.tm + returnMarker.dr)
  const durationMs = Math.min(1600, Math.max(900, Math.round(((endFrame - ip) / fr) * 1000)))

  return {
    downEnd: (bowDownMarker.tm + bowDownMarker.dr) / endFrame,
    downStart: bowDownMarker.tm / endFrame,
    durationMs,
    returnStart: returnMarker.tm / endFrame,
  }
}

function smoothRange(value: number, start: number, end: number) {
  'worklet'
  const ratio = Math.min(1, Math.max(0, (value - start) / (end - start)))
  return ratio * ratio * (3 - 2 * ratio)
}

function asLottieMetadata(source: KaelLottieSource | undefined): LottieMetadata | undefined {
  return typeof source === 'object' && source !== null ? (source as LottieMetadata) : undefined
}

export function KaelMotionRenderer({
  emotion,
  lottieAssetStatus = 'missing',
  lottieSource,
  loop = false,
  motion = 'state-enter',
  renderer = 'auto',
  rigTestID,
  size = 128,
  speed = 1,
  state = 'welcome',
  style,
  testID = 'kael-motion-renderer',
  variant = 'full',
}: KaelMotionRendererProps) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const progress = useSharedValue(reduceMotion ? 1 : 0)
  const lottieMetadata = asLottieMetadata(lottieSource)
  const timeline = motion === 'welcome-bow' ? readWelcomeBowTimeline(lottieMetadata) : DEFAULT_TIMELINE
  const { source } = resolveKaelMascotAsset(state, variant, emotion)
  const canRenderExactLottie =
    renderer !== 'image' &&
    lottieAssetStatus === 'exact' &&
    lottieSource &&
    kaelLottieRendererKind === 'native-lottie' &&
    !reduceMotion
  const resolvedRenderer = canRenderExactLottie ? 'native-lottie' : 'image-rig'
  const assetName = lottieMetadata?.nm ?? 'Kael motion'

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 1
      return
    }
    progress.value = 0
    progress.value = withTiming(1, {
      duration: motion === 'welcome-bow' ? timeline.durationMs : 420,
      easing: Easing.bezier(0.2, 0, 0.2, 1),
    })
  }, [motion, progress, reduceMotion, timeline.durationMs])

  const rigMotionStyle = useAnimatedStyle(() => {
    const value = progress.value
    if (motion !== 'welcome-bow') {
      return {
        opacity: 1,
        transform: [
          { translateY: (1 - value) * 5 },
          { scale: 0.985 + value * 0.015 },
        ],
      }
    }

    const bowInRaw = Math.min(1, Math.max(0, (value - timeline.downStart) / (timeline.downEnd - timeline.downStart)))
    const bowOutRaw = Math.min(1, Math.max(0, (value - timeline.returnStart) / (1 - timeline.returnStart)))
    const bowIn = smoothRange(bowInRaw, 0, 1)
    const bowOut = smoothRange(bowOutRaw, 0, 1)
    const bowDepth = bowIn * (1 - bowOut)
    const settle = smoothRange(value, 0.76, 1)

    return {
      opacity: 1,
      transform: [
        { translateY: 8 + bowDepth * 10 - (1 - settle) * 2 },
        { rotateZ: `${bowDepth * 5.5}deg` },
        { scale: 0.985 + value * 0.015 - bowDepth * 0.02 },
      ],
    }
  }, [motion, timeline.downEnd, timeline.downStart, timeline.returnStart])

  return (
    <View
      accessibilityLabel={`${assetName}; ${resolvedRenderer}; ${lottieAssetStatus} asset`}
      accessibilityRole="image"
      style={[styles.stage, { height: size, width: size }, style]}
      testID={testID}
    >
      {canRenderExactLottie ? (
        <KaelLottieView
          autoPlay
          loop={loop}
          resizeMode="contain"
          source={lottieSource}
          speed={speed}
          style={[styles.lottie, { height: size, width: size }]}
          testID={`${testID}-native-lottie`}
        />
      ) : (
        <>
          <MintAura intensity="component" style={[StyleSheet.absoluteFillObject, reduceTransparency ? styles.reducedAura : null]} />
          <Animated.View style={[styles.rigMotionLayer, { height: size, width: size }, rigMotionStyle]}>
            <KaelImageRig
              source={source as ImageSourcePropType}
              size={size}
              testID={rigTestID ?? `${testID}-image-rig`}
              variant={variant}
            />
          </Animated.View>
          {lottieSource ? <View style={styles.rendererMarker} testID={`${testID}-lottie-fallback`} /> : null}
        </>
      )}
    </View>
  )
}

function KaelImageRig({
  size,
  source,
  testID,
  variant,
}: {
  size: number
  source: ImageSourcePropType
  testID: string
  variant: 'full' | 'head'
}) {
  const imageScale = variant === 'head' ? 1.34 : KAEL_SAFE_IMAGE_SCALE
  const imageOffsetX = variant === 'head' ? 0 : KAEL_SAFE_IMAGE_OFFSET_X
  const imageOffsetY = variant === 'head' ? 0 : KAEL_SAFE_IMAGE_OFFSET_Y
  return (
    <View pointerEvents="none" style={[styles.rigShell, { height: size, width: size }]} testID={testID}>
      <Image
        resizeMode="contain"
        source={source}
        style={[
          styles.rigImage,
          {
            height: size,
            transform: [{ translateX: imageOffsetX }, { translateY: imageOffsetY }, { scale: imageScale }],
            width: size,
          },
        ]}
        testID={`${testID}-image`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  lottie: {
    alignSelf: 'center',
  },
  rendererMarker: {
    height: 1,
    opacity: 0,
    width: 1,
  },
  reducedAura: {
    opacity: 0.18,
  },
  rigMotionLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rigShell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
  rigImage: {
    opacity: 1,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    position: 'relative',
  },
})
