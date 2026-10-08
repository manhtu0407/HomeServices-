import { StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'

export function ConfirmationReconciliationResponse({
  language,
  supportCode,
  tokens,
}: {
  language: AppLanguage
  supportCode?: string | null
  tokens: CustomerThemeTokens
}) {
  return (
    <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}>
      <Text style={[styles.title, { color: tokens.text }]}>
        {language === 'vi' ? 'Đang đối soát xác nhận' : 'Reconciling confirmation'}
      </Text>
      <Text style={[styles.body, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael đang kiểm tra kết quả trên máy chủ để tránh tạo trùng yêu cầu.'
          : 'Kael is checking the server result to avoid creating a duplicate request.'}
      </Text>
      {supportCode ? (
        <Text style={[styles.item, { color: tokens.text }]}>
          {language === 'vi' ? 'Mã hỗ trợ' : 'Support code'}: {supportCode}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 15, lineHeight: 22 },
  card: { borderRadius: 22, borderWidth: 1, gap: 12, padding: 18 },
  item: { fontSize: 14, lineHeight: 20 },
  title: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
})
