import { Linking, Pressable, StyleSheet, Text } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

export const NESTSCOUT_PRIVACY_POLICY_URL = 'https://manhtu0407.github.io/nestscout-privacy-policy/'

export function PublicPrivacyPolicyLink({
  color = '#087D72',
  language,
  testID,
}: {
  color?: string
  language: AppLanguage
  testID: string
}) {
  const label = language === 'vi' ? 'Mở Chính sách quyền riêng tư' : 'Open Privacy Policy'
  const hint = language === 'vi'
    ? 'Mở chính sách quyền riêng tư công khai của NestScout'
    : 'Open the public NestScout Privacy Policy'

  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="link"
      hitSlop={8}
      onPress={() => { void Linking.openURL(NESTSCOUT_PRIVACY_POLICY_URL) }}
      style={({ pressed }) => [styles.link, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
  link: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
  },
  pressed: {
    opacity: 0.72,
  },
})
