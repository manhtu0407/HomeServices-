import { Text, TextInput, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { HCMC_DISTRICTS, normalizeDistrict, type DistrictSlug } from '@home-services/shared'
import { type AppLanguage } from '@/lib/app-language'
import { styles } from './styles'

type AddressContextTokens = {
  border: string
  primary: string
  raised: string
  service: string
  subtleText: string
  text: string
}

export function inferKaelChatDistrict(value: string): DistrictSlug | null {
  const normalized = normalizeDistrict(value)
  return normalized === 'hcmc_all' ? null : normalized
}

export function KaelAddressContextBar({
  addressLabel,
  language,
  onChangeText,
  placeholder,
  tokens,
}: {
  addressLabel: string
  language: AppLanguage
  onChangeText: (value: string) => void
  placeholder: string
  tokens: AddressContextTokens
}) {
  const district = inferKaelChatDistrict(addressLabel)

  return (
    <View style={[styles.addressBar, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-kael-chat-address-context">
      <ChatPinIcon color={tokens.primary} />
      <TextInput
        onChangeText={onChangeText}
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

function localizedDistrictLabel(district: DistrictSlug, language: AppLanguage) {
  if (language === 'en' && district.startsWith('q')) return `District ${district.slice(1)}`
  return HCMC_DISTRICTS[district]
}

function ChatPinIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11Z" stroke={color} strokeWidth={2.1} strokeLinejoin="round" />
      <Path d="M12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z" stroke={color} strokeWidth={2.1} />
    </Svg>
  )
}
