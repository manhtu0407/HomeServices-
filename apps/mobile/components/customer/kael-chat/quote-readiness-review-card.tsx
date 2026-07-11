import { StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { V21Card } from '../v21/shared-surfaces'
import { localizedQuoteReviewReason } from './case-work-localization'

export function QuoteReadinessReviewCard({
  language,
  reason,
  safetyMessages = [],
  tokens,
}: {
  language: AppLanguage
  reason?: string
  safetyMessages?: string[]
  tokens: CustomerThemeTokens
}) {
  const safetyBlocked = safetyMessages.length > 0
  return (
    <V21Card
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
      testID="customer-v21-quote-readiness-review"
    >
      <View
        accessibilityLabel={safetyBlocked
          ? (language === 'vi' ? 'Cần xử lý an toàn trước' : 'Safety review required')
          : (language === 'vi' ? 'Báo giá cần rà soát' : 'Quote requires review')}
        accessible
        style={styles.header}
      >
        <View style={[styles.marker, { backgroundColor: tokens.service }]}>
          <Text style={[styles.markerText, { color: tokens.primary }]}>K</Text>
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: tokens.text }]}>
            {safetyBlocked
              ? (language === 'vi' ? 'Cần xử lý an toàn trước' : 'Safety review required')
              : (language === 'vi' ? 'Báo giá cần rà soát' : 'Quote requires review')}
          </Text>
          <Text style={[styles.body, { color: tokens.muted }]}>
            {safetyBlocked
              ? safetyMessages.join(' ')
              : localizedQuoteReviewReason(reason, language)}
          </Text>
        </View>
      </View>
      <Text style={[styles.note, { backgroundColor: tokens.service, color: tokens.text }]}>
        {safetyBlocked
          ? (language === 'vi'
            ? 'Kael đã khóa báo giá và tìm thợ cho tới khi cổng an toàn được giải quyết.'
            : 'Kael has locked offer and matching until the safety gate is resolved.')
          : (language === 'vi'
            ? 'Kael sẽ không hiển thị một con số phỏng đoán.'
            : 'Kael will not display a guessed number.')}
      </Text>
    </V21Card>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19 },
  card: { gap: 12, marginTop: 10 },
  copy: { flex: 1, gap: 4 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 11 },
  marker: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  markerText: { fontSize: 14, fontWeight: '700' },
  note: { borderRadius: 12, fontSize: 12, lineHeight: 18, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 8 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
})
