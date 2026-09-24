import type { MatchingDeliveryReceipt } from '@nestscout/shared'
import { StyleSheet, Text, View } from 'react-native'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

const DELIVERY_STATE_COPY = {
  vi: {
    accepted: 'Đã ghi nhận nhận việc',
    delivered: 'Đã giao đến hộp việc',
    expired: 'Lời mời đã hết hạn',
    queued: 'Đang xếp gửi',
    seen: 'Bạn đã xem',
  },
  en: {
    accepted: 'Acceptance recorded',
    delivered: 'Delivered to job inbox',
    expired: 'Invite expired',
    queued: 'Queued for delivery',
    seen: 'Seen by you',
  },
} as const

export function WorkerMatchingDeliveryStatus({
  confirmedRecipientCount,
  language,
  receipt,
}: {
  confirmedRecipientCount?: number | null
  language: AppLanguage
  receipt: MatchingDeliveryReceipt
}) {
  const count = Number.isInteger(confirmedRecipientCount) && (confirmedRecipientCount ?? -1) >= 0
    ? confirmedRecipientCount
    : null

  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="summary" style={styles.container} testID="worker-stage1-delivery-status">
      <Text style={styles.status}>{DELIVERY_STATE_COPY[language][receipt.state]}</Text>
      {count !== null ? (
        <Text style={styles.detail}>
          {language === 'vi' ? `Máy chủ xác nhận ${count} người nhận` : `Server confirmed ${count} recipients`}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#F2F7F5', borderColor: '#C9DDD5', borderRadius: 14, borderWidth: 1, gap: 3, paddingHorizontal: 12, paddingVertical: 9 },
  detail: { ...typography.caption1, color: '#52645D' },
  status: { ...typography.footnote, color: '#123B31', fontWeight: '700' },
})
