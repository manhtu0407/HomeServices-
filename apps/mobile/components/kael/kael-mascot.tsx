import { Image } from 'expo-image'
import { StyleSheet, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native'
import { color, radius, spacing } from '@/design/theme'
import { resolveKaelMascotAsset, type KaelMascotEmotion, type KaelMascotState } from './kael-mascot-assets'

type KaelMascotProps = {
  emotion?: KaelMascotEmotion
  showFallbackBadge?: boolean
  size?: number
  state?: KaelMascotState
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: 'full' | 'head'
}

export function KaelMascot({
  emotion,
  showFallbackBadge = false,
  size = 128,
  state = 'welcome',
  style,
  testID = 'kael-mascot',
  variant = 'full',
}: KaelMascotProps) {
  const { source, usesFallback } = resolveKaelMascotAsset(state, variant, emotion)
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
