import { Image } from 'expo-image'
import { Text, TextInput, View, type ViewStyle } from 'react-native'
import { HCMC_DISTRICTS, type DistrictSlug } from '@home-services/shared'
import { type AppLanguage } from '@/lib/app-language'
import { inferKaelChatDistrict } from './address-district'
import { styles } from './styles'

const clientAddressIcon = require('../../../assets/client-image-icons/client-address.png')

type AddressContextTokens = {
  border: string
  borderStrong: string
  glassHighlight: string
  glassShadow: string
  mode: 'dark' | 'light'
  primary: string
  raised: string
  service: string
  subtleText: string
  text: string
}

export function KaelAddressContextBar({
  addressLabel,
  language,
  onBlur,
  onChangeText,
  onFocus,
  placeholder,
  tokens,
}: {
  addressLabel: string
  language: AppLanguage
  onBlur?: () => void
  onChangeText: (value: string) => void
  onFocus?: () => void
  placeholder: string
  tokens: AddressContextTokens
}) {
  const district = inferKaelChatDistrict(addressLabel)

  return (
    <View style={[styles.addressBar, addressContextSurface(tokens)]} testID="customer-kael-chat-address-context">
      <View pointerEvents="none" style={[styles.addressBarSheen, addressContextSheen(tokens)]} testID="customer-kael-chat-address-keyline" />
      <View style={[styles.addressIconDisk, addressIconDiskSurface(tokens)]}>
        <ChatPinIcon />
      </View>
      <TextInput
        onBlur={onBlur}
        onChangeText={onChangeText}
        onFocus={onFocus}
        placeholder={placeholder}
        placeholderTextColor={tokens.subtleText}
        style={[styles.addressInput, { color: tokens.text }]}
        testID="customer-kael-chat-address-input"
        value={addressLabel}
      />
      {district ? (
        <Text style={[styles.addressDistrictPill, { backgroundColor: tokens.service, borderColor: tokens.border, color: tokens.primary }]} numberOfLines={1} testID="customer-kael-chat-district-detected">
          {localizedDistrictLabel(district, language)}
        </Text>
      ) : null}
    </View>
  )
}

function addressContextSurface(tokens: AddressContextTokens): ViewStyle {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
  const dark = tokens.mode === 'dark'
  const gradient = dark
    ? 'linear-gradient(145deg, rgba(24,50,46,0.94), rgba(17,45,41,0.82))'
    : 'linear-gradient(145deg, rgba(255,255,255,0.82), rgba(239,255,250,0.62))'

  return {
    backgroundColor: dark ? 'rgba(22,43,40,0.90)' : 'rgba(255,255,255,0.72)',
    backgroundImage: reduceTransparency ? undefined : gradient,
    borderColor: dark ? 'rgba(190,210,205,0.18)' : 'rgba(255,255,255,0.82)',
    boxShadow: reduceTransparency
      ? 'none'
      : dark
        ? '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.12)'
        : '0 8px 18px rgba(16,74,66,0.045), inset 0 1px 0 rgba(255,255,255,0.92)',
    experimental_backgroundImage: reduceTransparency ? undefined : gradient,
  } as ViewStyle
}

function addressContextSheen(tokens: AddressContextTokens): ViewStyle {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.72)',
  }
}

function addressIconDiskSurface(tokens: AddressContextTokens): ViewStyle {
  return {
    backgroundColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.060)' : 'rgba(255,255,255,0.56)',
    borderColor: tokens.mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.76)',
  }
}

function localizedDistrictLabel(district: DistrictSlug, language: AppLanguage) {
  if (language === 'en' && district.startsWith('q')) return `District ${district.slice(1)}`
  return HCMC_DISTRICTS[district]
}

function ChatPinIcon() {
  return <Image accessibilityRole="image" contentFit="contain" source={clientAddressIcon} style={styles.addressImageIcon} />
}
