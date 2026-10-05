import { component, scaledTypography, typography } from '@/design/theme'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { PrimaryCtaFill, primaryCtaFrame } from '@/components/ui/primary-cta-fill'

type HomeGuidanceBannerProps = {
  language: AppLanguage
  onPress?: () => void
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type GuidanceCopy = {
  button: string
  title: string
}

const guidanceCopy = {
  en: {
    button: 'See how it works',
    title: 'Feel confident with a clear process',
  },
  vi: {
    button: 'Xem cách hoạt động',
    title: 'An tâm với quy trình rõ ràng',
  },
} satisfies Record<AppLanguage, GuidanceCopy>

export function HomeGuidanceBanner({ language, onPress, reduceTransparency, tokens }: HomeGuidanceBannerProps) {
  const { width } = useWindowDimensions()
  const copy = guidanceCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 847, 1)
  const q = (size: number) => size * scale
  const buttonTypography = scaledTypography('headline', scale)
  const titleTypography = scaledTypography('title1', scale)
  // Dark keeps the card on the neutral elevated surface with only a faint mint end, so the
  // token-coloured title stays readable.
  const dark = tokens.mode === 'dark'
  const content = (
    <>
      {!reduceTransparency ? (
        <Svg height="100%" pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" width="100%">
          <Defs>
            <LinearGradient id="customer-home-v4-promo-gradient" x1="0" x2="1" y1="0.5" y2="0.5">
              <Stop offset="0" stopColor={dark ? tokens.base : '#FFFFFF'} />
              <Stop offset="0.48" stopColor={dark ? tokens.base : '#FBFFFE'} />
              <Stop offset="1" stopColor={dark ? tokens.service : '#D9F8F3'} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#customer-home-v4-promo-gradient)" height="100" width="100" />
        </Svg>
      ) : null}
      <Image
        accessible={false}
        contentFit="contain"
        pointerEvents="none"
        source={customerV21HomeV4Assets.promoWorker}
        style={[styles.image, { height: q(240), opacity: reduceTransparency ? 0 : 1, right: q(-6), top: q(8), width: q(415) }]}
        testID="customer-v21-home-promo-image"
      />
      <View style={[styles.copy, { left: q(40), top: q(49) }]}>
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
              lineHeight: (titleTypography.lineHeight ?? 0) + 3,
            },
          ]}
        >
          {copy.title}
        </Text>
        {onPress ? (
          <Pressable
            accessibilityLabel={copy.button}
            accessibilityRole="button"
            onPress={onPress}
            style={[styles.button, primaryCtaFrame, { borderRadius: q(24) + 2, height: q(47) + 4, marginTop: q(18), paddingHorizontal: q(21) + 4 }]}
            testID="customer-v21-home-promo-action"
          >
            <PrimaryCtaFill radius={q(24) + 2} />
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              style={[
                styles.buttonText,
                buttonTypography,
                {
                  color: component.button.primary.text,
                  fontSize: (buttonTypography.fontSize ?? 0) + 3,
                  lineHeight: (buttonTypography.lineHeight ?? 0) + 3,
                },
              ]}
            >
              {copy.button}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </>
  )
  const cardStyle = [styles.card, { borderColor: tokens.border, borderRadius: q(30), height: q(226), marginTop: q(20) }]

  if (reduceTransparency) {
    return <View style={[cardStyle, { backgroundColor: tokens.raised }]} testID="customer-v21-home-guidance">{content}</View>
  }

  return <View style={cardStyle} testID="customer-v21-home-guidance">{content}</View>
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  buttonText: {
    ...typography.headline,
    color: '#FFFFFF',
    position: 'relative',
    zIndex: 1,
  },
  card: {
    alignSelf: 'center',
    maxWidth: 847,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  copy: {
    position: 'absolute',
    zIndex: 1,
  },
  image: {
    position: 'absolute',
  },
  title: {
    ...typography.title1,
  },
})
