import { scaledTypography, typography } from '@/design/theme'
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
  onSearchFocus?: () => void
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

export function HomeStorytellingCard({ language, onSearch, onSearchFocus, reduceTransparency, tokens }: HomeStorytellingCardProps) {
  const { width } = useWindowDimensions()
  const [value, setValue] = useState('')
  const copy = heroCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 857, 1)
  const q = (size: number) => size * scale
  const titleTypography = scaledTypography('largeTitle', scale)
  const descriptionTypography = scaledTypography('subheadline', scale)
  const searchTypography = scaledTypography('body', Math.min(scale * 1.35, 1))
  // Without the light artwork the solid dark card needs theme ink; the light hero keeps its own palette.
  const solidDark = reduceTransparency && tokens.mode === 'dark'
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

      <View style={[styles.heroCopy, { left: q(43), right: q(235), top: q(33) + 5 }]} testID="customer-v21-home-hero-copy">
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.72}
          numberOfLines={2}
          style={[
            styles.title,
            titleTypography,
            solidDark && { color: tokens.text },
            {
              fontSize: (titleTypography.fontSize ?? 0) + 3,
              lineHeight: (titleTypography.lineHeight ?? 0) + 3,
            },
          ]}
        >
          {copy.title}
        </Text>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.62}
          numberOfLines={1}
          style={[
            styles.description,
            descriptionTypography,
            solidDark && { color: tokens.muted },
            {
              fontSize: (descriptionTypography.fontSize ?? 0) + 1,
              lineHeight: (descriptionTypography.lineHeight ?? 0) + 1,
              marginTop: q(4) + 5,
            },
          ]}
        >
          {copy.description}
        </Text>
      </View>

      <View style={[styles.search, solidDark && { backgroundColor: tokens.base, borderColor: tokens.border }, { borderRadius: q(40), height: q(80), left: q(33), paddingHorizontal: q(28), right: q(33), top: q(228) }]} testID="customer-v21-home-search">
        <HomeIcon color={tokens.muted} name="search" size={q(38)} />
        <TextInput spellCheck={false}
          accessibilityLabel={copy.searchPlaceholder}
          onChangeText={setValue}
          onFocus={onSearchFocus}
          onSubmitEditing={() => onSearch?.(value.trim())}
          maxLength={2000}
          placeholder={copy.searchPlaceholder}
          placeholderTextColor={tokens.muted}
          returnKeyType="search"
          style={[customerV21WebTextInputNoOutline, styles.searchInput, searchTypography, solidDark && { color: tokens.text }, { borderWidth: 0, height: q(68), includeFontPadding: false, paddingHorizontal: q(19), paddingVertical: 0, textAlignVertical: 'center' }]}
          value={value}
        />
      </View>
    </>
  )

  const sharedStyle = [styles.frame, { borderColor: tokens.border, borderRadius: q(32), height: q(340) }]
  if (reduceTransparency) {
    return <View style={[sharedStyle, { backgroundColor: tokens.raised }]} testID="customer-v21-home-hero">{content}</View>
  }

  return (
    <View style={sharedStyle} testID="customer-v21-home-hero">{content}</View>
  )
}

const styles = StyleSheet.create({
  description: {
    ...typography.subheadline,
    color: '#294C52',
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
    ...typography.body,
    color: '#35555D',
    flex: 1,
  },
  title: {
    ...typography.largeTitle,
    color: '#16343B',
    marginTop: 5,
  },
})
