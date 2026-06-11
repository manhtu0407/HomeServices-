import { Image } from 'expo-image'
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native'
import { color, radius, spacing } from '@/design/theme'

export const KAEL_CORE_STATES = [
  'welcome',
  'listening',
  'thinking',
  'analyzing',
  'processing',
  'understood',
  'proposing',
  'success',
  'warning',
  'error',
] as const

export const KAEL_CONTEXTUAL_STATES = [
  'typing',
  'recording',
  'fileReview',
  'locationMap',
  'findingWorker',
  'priceCheck',
  'compareOptions',
  'report',
  'reminder',
  'miniCelebration',
] as const

export const KAEL_EMOTIONS = [
  'happy',
  'focused',
  'surprised',
  'curious',
  'confident',
  'concerned',
  'confused',
  'disappointed',
  'angry',
  'tired',
] as const

export type KaelMascotState = (typeof KAEL_CORE_STATES)[number] | (typeof KAEL_CONTEXTUAL_STATES)[number]
export type KaelMascotEmotion = (typeof KAEL_EMOTIONS)[number]

type KaelMascotProps = {
  emotion?: KaelMascotEmotion
  showFallbackBadge?: boolean
  size?: number
  state?: KaelMascotState
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: 'full' | 'head'
}

const kaelFull = require('../../assets/kael-model-8a.png')
const kaelHead = require('../../assets/kael-model-8a-head.png')

const stateAssets: Partial<Record<KaelMascotState, unknown>> = {}
const emotionAssets: Partial<Record<KaelMascotEmotion, unknown>> = {}

export function KaelMascot({
  emotion,
  showFallbackBadge = false,
  size = 128,
  state = 'welcome',
  style,
  testID = 'kael-mascot',
  variant = 'full',
}: KaelMascotProps) {
  const emotionSource = emotion ? emotionAssets[emotion] : null
  const stateSource = stateAssets[state]
  const usesFallback = !emotionSource && !stateSource
  const source = emotionSource ?? stateSource ?? (variant === 'head' ? kaelHead : kaelFull)
  const imageSize = Math.max(32, size)

  return (
    <View
      accessibilityLabel={`Kael ${state}${emotion ? ` ${emotion}` : ''}${usesFallback ? ' fallback asset' : ''}`}
      style={[styles.shell, usesFallback && showFallbackBadge ? styles.placeholderShell : null, { height: imageSize, width: imageSize }, style]}
      testID={`${testID}-${state}`}
    >
      <Image contentFit="contain" source={source} style={[styles.image, { height: imageSize, width: imageSize }] as ImageStyle} />
      {usesFallback && showFallbackBadge ? (
        <View style={styles.fallbackBadge} testID={`${testID}-fallback-badge`}>
          <Text style={styles.fallbackText}>Asset tạm</Text>
        </View>
      ) : null}
    </View>
  )
}

export function getKaelMascotAssetStatus(state: KaelMascotState, emotion?: KaelMascotEmotion) {
  if (emotion && emotionAssets[emotion]) return 'emotion'
  if (stateAssets[state]) return 'state'
  return 'fallback'
}

const styles = StyleSheet.create({
  fallbackBadge: {
    backgroundColor: color.surface.base,
    borderColor: color.accent.warning,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.xs,
  },
  fallbackText: {
    color: color.text.strong,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0,
  },
  image: {
    transform: [{ translateY: 2 }],
  },
  placeholderShell: {
    borderColor: color.accent.warning,
    borderRadius: radius.xl,
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
})
