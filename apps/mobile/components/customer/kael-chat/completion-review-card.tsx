import { StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { V21Card } from '../v21/shared-surfaces'

export function CompletionReviewCard({
  busy,
  deal,
  language,
  onConfirm,
  onReportIssue,
  tokens,
}: {
  busy: boolean
  deal: LocalDeal
  language: AppLanguage
  onConfirm: () => void
  onReportIssue: () => void
  tokens: CustomerThemeTokens
}) {
  const photoCount = deal.completionPhotoUrls?.length ?? 0
  const note = deal.completionNotes?.trim()

  return (
    <V21Card
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
      testID="customer-v21-completion-review"
    >
      <Text style={[styles.title, { color: tokens.text }]}>
        {language === 'vi' ? 'Xác nhận công việc đã hoàn tất' : 'Confirm the work is complete'}
      </Text>
      <Text style={[styles.body, { color: tokens.muted }]}>
        {language === 'vi'
          ? `Thợ đã gửi ${photoCount} ảnh hoàn tất${note ? ` và ghi chú: ${note}` : ''}. Chỉ xác nhận khi bạn đã kiểm tra kết quả.`
          : `The worker submitted ${photoCount} completion photo${photoCount === 1 ? '' : 's'}${note ? ` and this note: ${note}` : ''}. Confirm only after checking the result.`}
      </Text>
      <View style={styles.actions}>
        <KaelButton
          disabled={busy}
          label={language === 'vi' ? 'Có vấn đề' : 'Report an issue'}
          onPress={onReportIssue}
          size="small"
          style={styles.action}
          testID="customer-v21-completion-report-issue"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy, disabled: busy }}
          disabled={busy}
          label={busy
            ? (language === 'vi' ? 'Đang xác nhận…' : 'Confirming…')
            : (language === 'vi' ? 'Xác nhận hoàn tất' : 'Confirm completion')}
          onPress={onConfirm}
          size="small"
          style={styles.action}
          testID="customer-v21-completion-confirm"
        />
      </View>
      <Text style={[styles.note, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Thanh toán chỉ mở sau bước xác nhận này.'
          : 'Payment unlocks only after this confirmation.'}
      </Text>
    </V21Card>
  )
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  body: { fontSize: 13, lineHeight: 19 },
  card: { gap: 12, marginTop: 10 },
  note: { fontSize: 12, lineHeight: 17 },
  title: { fontSize: 16, fontWeight: '700', lineHeight: 21 },
})
