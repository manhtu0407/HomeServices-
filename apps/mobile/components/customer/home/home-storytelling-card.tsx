import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { customerV21WebTextInputNoOutline } from '../ui/platform-styles'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { HomeIcon } from './home-icons'

type HomeStorytellingCardProps = {
  language: AppLanguage
  onSearch?: (value: string) => void
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type HeroCopy = {
  description: string
  searchPlaceholder: string
  title: string
}

const heroCopy = {
  en: {
    description: 'Skilled workers  •  Fast arrival  •  Clear pricing',
    searchPlaceholder: 'What do you need help with?',
    title: 'Home care made simple,\nso you can enjoy your space',
  },
  vi: {
    description: 'Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch',
    searchPlaceholder: 'Bạn cần hỗ trợ việc gì?',
    title: 'Việc nhà có chúng tôi,\nbạn yên tâm tận hưởng',
  },
} satisfies Record<AppLanguage, HeroCopy>

export function HomeStorytellingCard({ language, onSearch, reduceTransparency, tokens }: HomeStorytellingCardProps) {
  const { width } = useWindowDimensions()
  const [value, setValue] = useState('')
  const copy = heroCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 857, 1)
  const q = (size: number) => size * scale
  const readable = (size: number, minimum: number) => Math.max(q(size), minimum)
  const heroWidth = Math.min(Math.max(width - 32, 280), 857)
  const copyMaxWidth = q(857 * 0.52)
  const searchInset = q(20)
  const searchTop = Math.max(q(228), 142)
  const titleLineHeight = readable(47, 22)
  const descriptionFontSize = readable(16.5, 12)
  const descriptionLineHeight = readable(23, 17)
  const descriptionTop = searchTop - descriptionLineHeight - Math.max(q(7), 4)
  const titleTop = descriptionTop - (titleLineHeight * 2) - Math.max(q(10), 6) - q(8)
  const descriptionWidth = Math.max(heroWidth - q(53), 0)
  const heroHeight = Math.max(q(336), 190)
  const content = (
    <>
      {!reduceTransparency ? (
        <Svg height="100%" pointerEvents="none" preserveAspectRatio="none" style={StyleSheet.absoluteFill} viewBox="0 0 100 100" width="100%">
          <Defs>
            <LinearGradient id="customer-home-v4-hero-gradient" x1="0" x2="1" y1="0.5" y2="0.5">
              <Stop offset="0" stopColor={tokens.primary} />
              <Stop offset="0.34" stopColor="#BDEBE7" />
              <Stop offset="0.58" stopColor="#D0F2EE" />
              <Stop offset="1" stopColor="#BAE7E3" />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#customer-home-v4-hero-gradient)" height="100" width="100" />
        </Svg>
      ) : null}
      <Image
        accessible={false}
        contentFit="contain"
        pointerEvents="none"
        source={customerV21HomeV4Assets.hero}
        style={[styles.heroImage, { height: q(250), right: q(-11), top: q(-20), width: q(375), opacity: reduceTransparency ? 0 : 1 }]}
        testID="customer-v21-home-hero-image"
      />

      <View style={[styles.heroCopy, { left: q(43), top: titleTop, width: copyMaxWidth }]} testID="customer-v21-home-hero-copy">
        <Text adjustsFontSizeToFit minimumFontScale={0.86} numberOfLines={2} style={[styles.title, { fontSize: readable(42, 17), lineHeight: titleLineHeight, marginTop: q(5) }]}>{copy.title}</Text>
      </View>

      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.description, { fontSize: descriptionFontSize, left: q(43), lineHeight: descriptionLineHeight, position: 'absolute', top: descriptionTop, width: descriptionWidth }]}>{copy.description}</Text>

      <View style={[styles.search, { borderRadius: q(40), height: q(80), left: searchInset, paddingHorizontal: q(28), right: searchInset, top: searchTop }]} testID="customer-v21-home-search">
        <HomeIcon color={tokens.muted} name="search" size={q(38)} />
        <TextInput
          accessibilityLabel={copy.searchPlaceholder}
          onChangeText={setValue}
          onSubmitEditing={() => onSearch?.(value.trim())}
          placeholder={copy.searchPlaceholder}
          placeholderTextColor={tokens.muted}
          returnKeyType="search"
          style={[styles.searchInput, customerV21WebTextInputNoOutline, { fontSize: readable(24, 16), height: q(68), paddingHorizontal: q(19) }]}
          value={value}
        />
      </View>
    </>
  )

  const sharedStyle = [styles.frame, { borderColor: tokens.border, borderRadius: q(32), height: heroHeight }]
  if (reduceTransparency) {
    return <View style={[sharedStyle, { backgroundColor: tokens.raised }]} testID="customer-v21-home-hero">{content}</View>
  }

  return (
    <View style={sharedStyle} testID="customer-v21-home-hero">{content}</View>
  )
}

const styles = StyleSheet.create({
  description: {
    color: '#294C52',
    fontWeight: '500',
  },
  frame: {
    alignSelf: 'center',
    maxWidth: 857,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  heroCopy: {
    position: 'absolute',
    zIndex: 1,
  },
  heroImage: {
    position: 'absolute',
    zIndex: 0,
  },
  search: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderWidth: 3,
    flexDirection: 'row',
    position: 'absolute',
  },
  searchInput: {
    color: '#35555D',
    flex: 1,
  },
  title: {
    color: '#16343B',
    fontWeight: '700',
    letterSpacing: -1.5,
    marginTop: 5,
  },
})
