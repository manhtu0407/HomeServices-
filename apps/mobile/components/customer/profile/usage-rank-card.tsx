import { Image } from 'expo-image'
import { useState } from 'react'
import Svg, { Defs, Rect } from 'react-native-svg'
import {
  Platform,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'

import { customerV21Assets } from '../ui/assets'
import { getUsageRankCardMetrics, usageRankCardColors as colors } from './usage-rank-card-metrics'

// The design system embeds no font files, so the editorial serif is the platform's own:
// New York on iOS, the system serif on Android, and a stack for the web preview that leads with faces
// that stack Vietnamese diacritics correctly (Georgia on Windows does not).
const serifFamily = Platform.select({
  android: 'serif',
  default: 'ui-serif, Cambria, Constantia, "Iowan Old Style", Georgia, "Times New Roman", serif',
  ios: 'ui-serif',
})

// The web preview forces one system stack on every node (app/_layout.tsx); this attribute is the
// opt-out that lets the two serif lines show as designed there. Native ignores it.
const webSerif = Platform.OS === 'web' ? { dataSet: { nestscoutSerif: 'true' } } : {}

// From this system font scale up, title and status wrap and the card grows instead of shrinking text.
const WRAP_FONT_SCALE = 1.15
// Past this growth over the designed height the plate is cropped and faded instead of stretched.
const ART_STRETCH_LIMIT = 1.12
const FALLBACK_GUTTER = 32
const MIN_FALLBACK_WIDTH = 240

const decorative = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
  pointerEvents: 'none',
} as const

export function UsageRankCard({
  statusLabel,
  style,
  tagline,
  testID = 'customer-v21-profile-ranking-entry',
  title,
}: {
  statusLabel: string
  style?: StyleProp<ViewStyle>
  tagline: string
  testID?: string
  title: string
}) {
  const { fontScale, width: windowWidth } = useWindowDimensions()
  const [measured, setMeasured] = useState<{ height: number; width: number } | null>(null)
  const metrics = getUsageRankCardMetrics(measured?.width ?? Math.max(windowWidth - FALLBACK_GUTTER, MIN_FALLBACK_WIDTH))
  const stretched = measured !== null && measured.height > metrics.card.minHeight * ART_STRETCH_LIMIT
  const wrapText = fontScale > WRAP_FONT_SCALE
  const taglineParts = tagline.split(/\s*·\s*/u)
  const taglineText = metrics.tagline.stacked ? taglineParts.join('\n') : taglineParts.join('  ·  ')

  const onLayout = (event: LayoutChangeEvent) => {
    const { height, width } = event.nativeEvent.layout
    if (width <= 0) return
    setMeasured((current) =>
      current !== null && Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5
        ? current
        : { height, width },
    )
  }

  return (
    <View
      onLayout={onLayout}
      style={[styles.frame, { borderRadius: metrics.card.radius, boxShadow: metrics.card.shadow }, style]}
      testID={testID}
    >
      <View style={[styles.clip, { borderRadius: metrics.card.radius, minHeight: metrics.card.minHeight }]}>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          contentFit={stretched ? 'cover' : 'fill'}
          contentPosition={{ left: 0, top: 0 }}
          source={customerV21Assets.usageRankArt}
          style={[styles.art, { width: metrics.art.width }]}
          testID={`${testID}-art`}
        />
        {stretched ? (
          <View
            {...decorative}
            style={[styles.artFade, { left: metrics.art.width * 0.76, width: metrics.art.width * 0.24 }]}
            testID={`${testID}-art-fade`}
          >
            <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" width="100%">
              <Defs>
                <LinearGradient id="usage-rank-art-fade" x1="0" x2="1" y1="0" y2="0">
                  <Stop offset="0" stopColor={colors.surface} stopOpacity="0" />
                  <Stop offset="1" stopColor={colors.surface} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect fill="url(#usage-rank-art-fade)" height="100" width="100" x="0" y="0" />
            </Svg>
          </View>
        ) : null}
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          contentFit="contain"
          source={customerV21Assets.usageRankLeaf}
          style={[
            styles.leaf,
            { height: metrics.leaf.height, right: metrics.leaf.right, top: metrics.leaf.top, width: metrics.leaf.width },
          ]}
          testID={`${testID}-leaf`}
        />

        <View
          style={[
            styles.column,
            {
              marginLeft: metrics.content.left,
              marginRight: metrics.content.right,
              paddingBottom: metrics.content.bottom,
              paddingTop: metrics.content.top,
            },
          ]}
        >
          <View
            {...decorative}
            style={[
              styles.accent,
              { height: metrics.accent.height, marginBottom: metrics.accent.gap, width: metrics.accent.width },
            ]}
            testID={`${testID}-accent`}
          />
          <Text
            adjustsFontSizeToFit={!wrapText}
            maxFontSizeMultiplier={1.3}
            minimumFontScale={0.8}
            numberOfLines={wrapText ? 2 : 1}
            {...webSerif}
            style={[
              styles.title,
              {
                fontSize: metrics.title.fontSize,
                letterSpacing: metrics.title.letterSpacing,
                lineHeight: metrics.title.lineHeight,
              },
            ]}
            testID={`${testID}-title`}
          >
            {title}
          </Text>
          <View
            style={[
              styles.pill,
              {
                borderRadius: metrics.pill.radius,
                borderWidth: metrics.pill.ring,
                marginTop: metrics.pill.marginTop,
                minHeight: metrics.pill.minHeight,
                minWidth: metrics.pill.minWidth,
                paddingHorizontal: metrics.pill.paddingHorizontal,
              },
            ]}
            testID={`${testID}-status-pill`}
          >
            <Text
              adjustsFontSizeToFit={!wrapText}
              maxFontSizeMultiplier={1.3}
              minimumFontScale={0.7}
              numberOfLines={wrapText ? 2 : 1}
              style={[
                styles.status,
                {
                  fontSize: metrics.pill.status.fontSize,
                  letterSpacing: metrics.pill.status.letterSpacing,
                  lineHeight: metrics.pill.status.lineHeight,
                },
              ]}
              testID={`${testID}-points`}
            >
              {statusLabel}
            </Text>
          </View>

          <View style={{ flexGrow: 1, minHeight: metrics.tagline.gap }} />
          <View {...decorative} testID={`${testID}-meta`}>
            <View
              style={[
                styles.rule,
                { height: metrics.tagline.ruleHeight, marginBottom: metrics.tagline.ruleGap, width: metrics.tagline.ruleWidth },
              ]}
            />
            <Text
              maxFontSizeMultiplier={1.15}
              {...webSerif}
              style={[
                styles.tagline,
                {
                  fontSize: metrics.tagline.fontSize,
                  letterSpacing: metrics.tagline.letterSpacing,
                  lineHeight: metrics.tagline.lineHeight,
                },
              ]}
              testID={`${testID}-tagline`}
            >
              {taglineText}
            </Text>
          </View>
        </View>

        {/* Drawn last so it sits over the border already baked into the watercolor plate. */}
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderColor: colors.border, borderRadius: metrics.card.radius, borderWidth: metrics.card.ring },
          ]}
          testID={`${testID}-ring`}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  accent: { backgroundColor: colors.accent, borderRadius: 999, opacity: 0.96 },
  art: { bottom: 0, left: 0, position: 'absolute', top: 0 },
  // Covers the last 24% of the plate, where a cropped plate would otherwise end in a hard edge.
  artFade: { bottom: 0, position: 'absolute', top: 0 },
  clip: { overflow: 'hidden', width: '100%' },
  column: { flexGrow: 1 },
  frame: { alignSelf: 'center', backgroundColor: colors.surface, maxWidth: 640, width: '100%' },
  leaf: { position: 'absolute' },
  pill: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.statusSurface,
    borderColor: colors.statusRing,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  rule: { backgroundColor: colors.taglineRule, borderRadius: 999 },
  // Centered on both axes inside the pill; includeFontPadding off keeps Android from adding uneven top and bottom space.
  status: { color: colors.status, fontWeight: '600', includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' },
  tagline: { color: colors.tagline, fontFamily: serifFamily, fontStyle: 'italic' },
  title: { color: colors.title, fontFamily: serifFamily, fontWeight: '500' },
})
