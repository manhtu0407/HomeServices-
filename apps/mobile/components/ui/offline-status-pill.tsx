import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { typography } from '@/design/theme'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'
import { getLastServerResponseAt, useConnectivity } from '@/lib/connectivity'

function clockTime(timestamp: number) {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function offlineStatusCopy(language: AppLanguage, lastServerResponseAt: number | null) {
  if (language === 'vi') {
    return lastServerResponseAt === null
      ? 'Đang ngoại tuyến'
      : `Đang ngoại tuyến · cập nhật lúc ${clockTime(lastServerResponseAt)}`
  }
  return lastServerResponseAt === null
    ? 'Offline'
    : `Offline · updated at ${clockTime(lastServerResponseAt)}`
}

// Solid and static on purpose: it reports a fact about the data on screen, it is not an alert.
// It floats over the top inset so the tab plane and the dock keep their geometry.
export function OfflineStatusPill({ tokens }: { tokens: CustomerThemeTokens }) {
  const connectivity = useConnectivity()
  const language = useAppLanguage()
  const insets = useSafeAreaInsets()
  if (connectivity !== 'offline') return null

  return (
    <View pointerEvents="none" style={[styles.anchor, { top: insets.top + 6 }]}>
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="text"
        style={[styles.pill, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
        testID="offline-status-pill"
      >
        <Text style={[styles.label, { color: tokens.text }]}>{offlineStatusCopy(language, getLastServerResponseAt())}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: {
    alignItems: 'center',
    left: 16,
    position: 'absolute',
    right: 16,
    zIndex: 50,
  },
  label: {
    ...typography.footnote,
    fontWeight: '600',
  },
  pill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
})
