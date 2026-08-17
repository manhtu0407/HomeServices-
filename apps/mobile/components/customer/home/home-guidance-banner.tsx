import { scaledTypography, typography } from '@/design/theme'
import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { HomeIcon } from './home-icons'

type HomeGuidanceBannerProps = {
  language: AppLanguage
  onPress?: () => void
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type GuidanceCopy = {
  button: string
  proofs: [string, string, string]
  title: string
}

const guidanceCopy = {
  en: {
    button: 'See how it works',
    proofs: ['Clear scope', 'Confirm before work', 'Protected payment'],
    title: 'Feel confident with a clear process',
  },
  vi: {
    button: 'Xem cách hoạt động',
    proofs: ['Phạm vi rõ ràng', 'Xác nhận trước khi làm', 'Thanh toán an toàn'],
    title: 'An tâm với quy trình rõ ràng',
  },
} satisfies Record<AppLanguage, GuidanceCopy>

const proofIcons = ['check', 'list', 'shield'] as const

export function HomeGuidanceBanner({ language, onPress, reduceTransparency, tokens }: HomeGuidanceBannerProps) {
  const { width } = useWindowDimensions()
  const copy = guidanceCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 847, 1)
  const q = (size: number) => size * scale
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
      <View style={[styles.copy, { left: q(40), top: q(49) }]}>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.title, scaledTypography('title1', scale), { color: tokens.text }]}>{copy.title}</Text>
        <View style={[styles.proofs, { gap: q(18), marginTop: q(20) }]}>
          {copy.proofs.map((proof, index) => (
            <View key={proof} style={[styles.proof, { gap: q(9) }]}>
              <HomeIcon color={tokens.primary} name={proofIcons[index]} size={q(17)} />
              <Text adjustsFontSizeToFit minimumFontScale={0.66} numberOfLines={1} style={[styles.proofText, scaledTypography('subheadline', scale), { color: tokens.muted }]}>{proof}</Text>
            </View>
          ))}
        </View>
        {onPress ? (
          <Pressable
            accessibilityLabel={copy.button}
            accessibilityRole="button"
            onPress={onPress}
            style={[styles.button, { backgroundColor: tokens.primary, borderRadius: q(24), height: q(47), marginTop: q(18), paddingHorizontal: q(21) }]}
            testID="customer-v21-home-promo-action"
          >
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.buttonText, scaledTypography('headline', scale)]}>{copy.button}</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  )
  const cardStyle = [styles.card, { borderColor: tokens.border, borderRadius: q(30), height: q(226) }]

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
  proof: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  proofs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  proofText: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  title: {
    ...typography.title1,
  },
})
