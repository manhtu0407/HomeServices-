import type { IntakeCoverage } from '@nestscout/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'

const REQUIRED_FIELD_LABELS: Record<IntakeCoverage['missing_required_fields'][number], Record<AppLanguage, string>> = {
  address_district: { en: 'District', vi: 'Quận' },
  address_label: { en: 'Service address', vi: 'Địa chỉ dịch vụ' },
  description: { en: 'Issue description', vi: 'Mô tả vấn đề' },
  problem_slug: { en: 'Issue type', vi: 'Loại vấn đề' },
  scheduled_at: { en: 'Service time', vi: 'Thời gian dịch vụ' },
  service_type: { en: 'Service', vi: 'Dịch vụ' },
}

export function IntakeCoverageResponse({
  busy,
  coverage,
  language,
  onConfirm,
  tokens,
}: {
  busy: boolean
  coverage: IntakeCoverage
  language: AppLanguage
  onConfirm: () => void
  tokens: CustomerThemeTokens
}) {
  const requiredCount = coverage.missing_required_fields.length
  const enrichmentCount = coverage.missing_enrichment_slots.length
  const canConfirm = coverage.order_eligible && requiredCount === 0 && coverage.confirmation_kind !== 'none'
  const copy = modeCopy(coverage.quote_mode, language)
  const blocker = coverage.safety_blocker
    ? (language === 'vi' ? coverage.safety_blocker.message_vi : coverage.safety_blocker.message_en)
    : null

  return (
    <View
      accessibilityLabel={copy.title}
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}
      testID="customer-stage1-intake-coverage"
    >
      <Text style={[styles.eyebrow, { color: tokens.primary }]}>
        {language === 'vi' ? 'Thông tin yêu cầu' : 'Request details'}
      </Text>
      <Text style={[styles.title, { color: tokens.text }]}>{copy.title}</Text>
      <Text style={[styles.body, { color: tokens.muted }]}>{copy.detail}</Text>
      {requiredCount > 0 ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: tokens.text }]}>
            {language === 'vi' ? `Bắt buộc trước khi gửi (${requiredCount})` : `Required before sending (${requiredCount})`}
          </Text>
          {coverage.missing_required_fields.map((field) => (
            <Text key={field} style={[styles.item, { color: tokens.danger }]}>{REQUIRED_FIELD_LABELS[field][language]}</Text>
          ))}
        </View>
      ) : (
        <Text style={[styles.item, { color: tokens.statusText }]}>
          {language === 'vi' ? 'Thông tin bắt buộc đã đủ' : 'Required information is complete'}
        </Text>
      )}
      {enrichmentCount > 0 ? (
        <Text style={[styles.item, { color: tokens.muted }]}>
          {language === 'vi' ? `Thông tin nên bổ sung (${enrichmentCount})` : `Helpful details to add (${enrichmentCount})`}
        </Text>
      ) : null}
      {blocker ? <Text style={[styles.blocker, { color: tokens.danger }]}>{blocker}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: !canConfirm || busy }}
        disabled={!canConfirm || busy}
        onPress={onConfirm}
        style={[styles.button, { backgroundColor: canConfirm && !busy ? tokens.primary : tokens.disabled }]}
        testID="customer-stage1-intake-confirm"
      >
        <Text style={[styles.buttonText, { color: tokens.primaryText }]}>{copy.action}</Text>
      </Pressable>
    </View>
  )
}

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

function modeCopy(mode: IntakeCoverage['quote_mode'], language: AppLanguage) {
  const copy = {
    vi: {
      blocked: { action: 'Chưa thể tiếp tục', detail: 'Kael cần xử lý điều kiện an toàn hoặc chính sách trước.', title: 'Yêu cầu đang tạm dừng' },
      inspection_only: { action: 'Gửi yêu cầu khảo sát', detail: 'Thợ sẽ khảo sát trước. Chưa có giá được xác nhận ở bước này.', title: 'Yêu cầu khảo sát' },
      kael_auto_quote: { action: 'Xem đề nghị giá', detail: 'Giá chỉ được xác nhận khi biên nhận phân tích của Kael đã sẵn sàng.', title: 'Báo giá tự động của Kael' },
      rfq: { action: 'Gửi yêu cầu báo giá', detail: 'Thợ sẽ báo giá sau khi xem yêu cầu. Chưa có giá được xác nhận ở bước này.', title: 'Yêu cầu báo giá' },
    },
    en: {
      blocked: { action: 'Cannot continue yet', detail: 'Kael must resolve a safety or policy condition first.', title: 'Request on hold' },
      inspection_only: { action: 'Request an inspection', detail: 'A worker will inspect first. No price is confirmed at this step.', title: 'Inspection request' },
      kael_auto_quote: { action: 'Review price offer', detail: 'The price can be confirmed only when Kael’s reasoning receipt is ready.', title: 'Kael auto quote' },
      rfq: { action: 'Send quote request', detail: 'A worker will quote after reviewing the request. No price is confirmed at this step.', title: 'Request a quote' },
    },
  } as const
  return copy[language][mode]
}

const styles = StyleSheet.create({
  blocker: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  body: { fontSize: 15, lineHeight: 22 },
  button: { alignItems: 'center', borderRadius: 16, minHeight: 48, justifyContent: 'center', paddingHorizontal: 18 },
  buttonText: { fontSize: 15, fontWeight: '800' },
  card: { borderRadius: 22, borderWidth: 1, gap: 12, padding: 18 },
  eyebrow: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  item: { fontSize: 14, lineHeight: 20 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 14, fontWeight: '800' },
  title: { fontSize: 20, fontWeight: '800', lineHeight: 26 },
})
