import { color, scaledTypography, shadow, typography } from '@/design/theme'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Defs, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FillSvg } from '@/components/ui/fill-svg'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'

type HomeGuidanceBannerProps = {
  language: AppLanguage
  onPress?: () => void
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type GuidanceCopy = {
  action: string
  subtitle: string
  titleAccent: string
  titleLead: string
}

const guidanceCopy = {
  en: {
    action: 'See how it works',
    subtitle: 'Know the worker, scope and price.',
    titleAccent: 'a clear process',
    titleLead: 'Feel confident with\n',
  },
  vi: {
    action: 'Xem cách hoạt động',
    subtitle: 'Rõ thợ, rõ phạm vi, rõ giá.',
    titleAccent: 'quy trình rõ ràng',
    titleLead: 'An tâm với\n',
  },
} satisfies Record<AppLanguage, GuidanceCopy>

export function HomeGuidanceBanner({ language, onPress, reduceTransparency, tokens }: HomeGuidanceBannerProps) {
  const { width } = useWindowDimensions()
  const copy = guidanceCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 847, 1)
  const q = (size: number) => size * scale
  const { reduceMotion } = useGlassAccessibility()
  const titleTypography = scaledTypography('title1', scale)
  // Dark keeps the card on the neutral elevated surface with only a faint mint end, so the
  // token-coloured title stays readable.
  const dark = tokens.mode === 'dark'
  // The accent words use the deep mint on light (4.9:1 on the card) and the theme mint on dark.
  const accentColor = dark ? tokens.primary : color.brand.primaryDark
  const content = (
    <>
      {!reduceTransparency ? (
        <FillSvg preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="customer-home-v4-promo-gradient" x1="0" x2="1" y1="0.5" y2="0.5">
              <Stop offset="0" stopColor={dark ? tokens.base : '#FFFFFF'} />
              <Stop offset="0.48" stopColor={dark ? tokens.base : '#FBFFFE'} />
              <Stop offset="1" stopColor={dark ? tokens.service : '#D9F8F3'} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#customer-home-v4-promo-gradient)" height="100" width="100" />
        </FillSvg>
      ) : null}
      <Image
        accessible={false}
        contentFit="contain"
        pointerEvents="none"
        source={customerV21HomeV4Assets.promoWorker}
        style={[styles.image, { height: q(240), opacity: reduceTransparency ? 0 : 1, right: q(-6), top: q(8), width: q(415) }]}
        testID="customer-v21-home-promo-image"
      />
      <View style={[styles.copy, { left: q(40), maxWidth: q(400) }]}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={2}
          style={[
            styles.title,
            titleTypography,
            {
              color: tokens.text,
              fontSize: (titleTypography.fontSize ?? 0) + 3,
              fontWeight: '600',
              lineHeight: (titleTypography.lineHeight ?? 0) + 3,
            },
          ]}
          testID="customer-v21-home-promo-title"
        >
          {copy.titleLead}
          <Text style={{ color: accentColor }}>{copy.titleAccent}</Text>
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          numberOfLines={1}
          style={[styles.subtitle, { color: tokens.muted, marginTop: q(10) }]}
          testID="customer-v21-home-promo-subtitle"
        >
          {copy.subtitle}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.link, { color: accentColor, marginTop: q(12) }]}
          testID="customer-v21-home-promo-link"
        >
          {`${copy.action} ›`}
        </Text>
      </View>
    </>
  )
  const cardRadius = q(30)
  // Outer frame carries the hairline and the soft lift; the inner view clips the artwork, because
  // overflow: hidden on the same view would cut its own shadow.
  const cardStyle = [
    styles.card,
    dark ? null : shadow.soft,
    { borderColor: tokens.border, borderRadius: cardRadius, height: q(226), marginTop: q(20) },
    reduceTransparency ? { backgroundColor: tokens.raised } : null,
  ]
  const clipped = <View style={[styles.clip, { borderRadius: cardRadius }]}>{content}</View>

  // The whole card is the action; there is no separate button on top of the artwork.
  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={`${copy.titleLead.trim()} ${copy.titleAccent}. ${copy.action}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [cardStyle, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
        testID="customer-v21-home-guidance"
      >
        {clipped}
      </Pressable>
    )
  }

  return <View style={cardStyle} testID="customer-v21-home-guidance">{clipped}</View>
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    borderWidth: 1,
    maxWidth: 847,
    position: 'relative',
    width: '100%',
  },
  clip: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  copy: {
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
  image: {
    position: 'absolute',
  },
  link: {
    ...typography.footnote,
    fontWeight: '600',
  },
  subtitle: {
    ...typography.caption1,
    fontWeight: '500',
  },
  title: {
    ...typography.title1,
  },
})
