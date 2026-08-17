import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'

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
    title: 'An tâm tuyệt đối\nvới thợ được xác thực',
  },
} satisfies Record<AppLanguage, GuidanceCopy>

export function HomeGuidanceBanner({ language, onPress, reduceTransparency, tokens }: HomeGuidanceBannerProps) {
  const { width } = useWindowDimensions()
  const copy = guidanceCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 847, 1)
  const q = (size: number) => size * scale
  const readable = (size: number, minimum: number) => Math.max(q(size), minimum)
  const cardHeight = Math.max(q(226), 120)
  const content = (
    <>
      {!reduceTransparency ? (
        <Svg height="100%" pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" width="100%">
          <Defs>
            <LinearGradient id="customer-home-v4-promo-gradient" x1="0" x2="1" y1="0.5" y2="0.5">
              <Stop offset="0" stopColor="#FFFFFF" />
              <Stop offset="0.48" stopColor="#FBFFFE" />
              <Stop offset="1" stopColor="#D9F8F3" />
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
      <View style={[styles.copy, { height: cardHeight, justifyContent: 'center', left: q(40), top: 0 }]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.86} numberOfLines={2} style={[styles.title, { color: tokens.text, fontSize: readable(26, 15), lineHeight: readable(31, 19) }]}>{copy.title}</Text>
        {onPress ? (
          <Pressable
            accessibilityLabel={copy.button}
            accessibilityRole="button"
            onPress={onPress}
            style={[styles.button, { backgroundColor: tokens.guidanceAction, borderRadius: Math.max(q(24), 18), height: Math.max(q(47), 36), marginTop: Math.max(q(24), 16), paddingHorizontal: Math.max(q(18), 14) }]}
            testID="customer-v21-home-promo-action"
          >
            <Text adjustsFontSizeToFit minimumFontScale={0.86} numberOfLines={1} style={[styles.buttonText, { fontSize: readable(17, 14) }]}>{copy.button}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  )
  const cardStyle = [styles.card, { borderColor: tokens.border, borderRadius: q(30), height: cardHeight }]

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
    color: '#FFFFFF',
    fontWeight: '800',
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
    fontWeight: '700',
    letterSpacing: -1,
  },
})
