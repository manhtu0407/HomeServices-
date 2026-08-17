import { scaledTypography, typography } from '@/design/theme'
import { Image } from 'expo-image'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import Svg, { Defs, Rect } from 'react-native-svg'

import type { CustomerServiceId } from '@nestscout/shared'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21HomeV4Assets } from '../ui/assets'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { HomeIcon } from './home-icons'

type HomeStorytellingCardProps = {
  language: AppLanguage
  onQuickPress?: (service: CustomerServiceId) => void
  onSearch?: (value: string) => void
  reduceTransparency: boolean
  tokens: CustomerThemeTokens
}

type HeroCopy = {
  badge: string
  chips: Record<QuickServiceId, string>
  description: string
  searchPlaceholder: string
  title: string
}

type QuickServiceId = 'electrical' | 'home_cleaning' | 'hvac_basic_maintenance'

const heroCopy = {
  en: {
    badge: 'Need a hand now?',
    chips: {
      electrical: 'Urgent electrical repair',
      home_cleaning: 'Book weekend cleaning',
      hvac_basic_maintenance: 'Service your air conditioner',
    },
    description: 'Skilled workers  •  Fast arrival  •  Clear pricing',
    searchPlaceholder: 'What do you need help with?',
    title: 'Home care made simple,\nso you can enjoy your space',
  },
  vi: {
    badge: 'Cần hỗ trợ ngay?',
    chips: {
      electrical: 'Sửa điện gấp',
      home_cleaning: 'Đặt vệ sinh cuối tuần',
      hvac_basic_maintenance: 'Bảo dưỡng điều hòa',
    },
    description: 'Kết nối thợ lành nghề  •  Đến nhanh  •  Giá minh bạch',
    searchPlaceholder: 'Bạn cần hỗ trợ việc gì?',
    title: 'Việc nhà có chúng tôi,\nbạn yên tâm tận hưởng',
  },
} satisfies Record<AppLanguage, HeroCopy>

const quickServices: { icon: 'calendar' | 'flash' | 'snow'; service: QuickServiceId }[] = [
  { icon: 'flash', service: 'electrical' },
  { icon: 'calendar', service: 'home_cleaning' },
  { icon: 'snow', service: 'hvac_basic_maintenance' },
]

export function HomeStorytellingCard({ language, onQuickPress, onSearch, reduceTransparency, tokens }: HomeStorytellingCardProps) {
  const { width } = useWindowDimensions()
  const [value, setValue] = useState('')
  const copy = heroCopy[language]
  const scale = Math.min(Math.max(width - 32, 280) / 857, 1)
  const q = (size: number) => size * scale
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

      <View style={[styles.heroCopy, { left: q(43), right: q(235), top: q(33) }]} testID="customer-v21-home-hero-copy">
        <View style={[styles.badge, { borderRadius: q(14), gap: q(11), height: q(48), paddingHorizontal: q(18) }]}>
          <HomeIcon color="#FFFFFF" name="flash" size={q(22)} />
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.badgeText, scaledTypography('title3', scale)]}>{copy.badge}</Text>
        </View>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.title, scaledTypography('largeTitle', scale)]}>{copy.title}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.description, scaledTypography('subheadline', scale), { marginTop: q(4) }]}>{copy.description}</Text>
      </View>

      <View style={[styles.search, { borderRadius: q(40), height: q(80), left: q(33), paddingHorizontal: q(28), right: q(33), top: q(228) }]} testID="customer-v21-home-search">
        <HomeIcon color={tokens.muted} name="search" size={q(38)} />
        <TextInput
          accessibilityLabel={copy.searchPlaceholder}
          onChangeText={setValue}
          onSubmitEditing={() => onSearch?.(value.trim())}
          placeholder={copy.searchPlaceholder}
          placeholderTextColor={tokens.muted}
          returnKeyType="search"
          style={[styles.searchInput, scaledTypography('body', scale), { height: q(68), paddingHorizontal: q(19) }]}
          value={value}
        />
      </View>

      <View style={[styles.quickRow, { bottom: q(28), gap: q(14), left: q(33), right: q(33) }]} testID="customer-v21-home-quick-suggestions">
        {quickServices.map((item, index) => {
          const selected = value === copy.chips[item.service]
          return (
            <Pressable
              accessibilityLabel={copy.chips[item.service]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={item.service}
              onPress={() => {
                setValue(copy.chips[item.service])
                onQuickPress?.(item.service)
              }}
              style={[styles.quickChip, { borderRadius: q(29), flex: index === 0 ? 1 : 1.24, gap: q(12), height: q(58), paddingHorizontal: q(18) }, selected ? styles.quickChipSelected : null]}
              testID={`customer-v21-home-quick-${item.service}`}
            >
              <HomeIcon color={tokens.primary} name={item.icon} size={q(25)} />
              <Text adjustsFontSizeToFit minimumFontScale={0.62} numberOfLines={1} style={[styles.quickChipText, scaledTypography('callout', scale), { color: selected ? tokens.text : tokens.muted }]}>{copy.chips[item.service]}</Text>
            </Pressable>
          )
        })}
      </View>
    </>
  )

  const sharedStyle = [styles.frame, { borderColor: tokens.border, borderRadius: q(32), height: q(408) }]
  if (reduceTransparency) {
    return <View style={[sharedStyle, { backgroundColor: tokens.raised }]} testID="customer-v21-home-hero">{content}</View>
  }

  return (
    <View style={sharedStyle} testID="customer-v21-home-hero">{content}</View>
  )
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    flexDirection: 'row',
  },
  badgeText: {
    ...typography.title3,
    color: '#FFFFFF',
    fontWeight: '600',
  },
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
  quickChip: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  quickChipSelected: {
    backgroundColor: '#E5F9F6',
    borderColor: 'rgba(19,191,181,0.42)',
    borderWidth: 2,
  },
  quickChipText: {
    ...typography.callout,
    fontWeight: '600',
  },
  quickRow: {
    flexDirection: 'row',
    position: 'absolute',
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
