import { StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { OriginalScopePriceQuote, WorkerCandidateView } from '@/lib/api-types'
import type { CustomerThemeTokens } from '../customer-theme'

type WorkerProposal = NonNullable<WorkerCandidateView['worker_proposal']>

function priceConfidenceLabel(
  confidence: 'low' | 'medium' | 'high',
  language: AppLanguage,
) {
  if (language === 'en') return confidence
  if (confidence === 'high') return 'cao'
  if (confidence === 'medium') return 'trung bình'
  return 'thấp'
}

export function CandidatePriceReceipt({
  formatCurrency,
  language,
  proposal,
  quote,
  tokens,
}: {
  formatCurrency: (value: number) => string
  language: AppLanguage
  proposal: WorkerProposal | null
  quote: OriginalScopePriceQuote | null
  tokens: CustomerThemeTokens
}) {
  if (!quote?.worker_confirmed_at && proposal) {
    return (
      <WorkerProposalReceipt
        formatCurrency={formatCurrency}
        language={language}
        proposal={proposal}
        tokens={tokens}
      />
    )
  }

  if (!quote?.worker_confirmed_at) {
    return (
      <View
        accessible
        accessibilityLabel={language === 'vi'
          ? 'Chưa có báo giá đã được thợ xác nhận. Không thể chọn thợ.'
          : 'No worker-confirmed quote is available. The worker cannot be selected.'}
        style={[styles.priceReceipt, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
        testID="customer-v21-worker-candidate-price-blocked"
      >
        <Text style={[styles.paymentTitle, { color: tokens.text }]}>
          {language === 'vi' ? 'Giá chưa sẵn sàng để xác nhận' : 'Price is not ready to confirm'}
        </Text>
        <Text style={[styles.body, { color: tokens.muted }]}>
          {language === 'vi'
            ? 'Kael cần tải lại biên nhận giá bất biến đã được thợ xác nhận. Công việc chưa thể ghép thợ ở trạng thái này.'
            : 'Kael must reload the immutable worker-confirmed price receipt. The job cannot be matched in this state.'}
        </Text>
      </View>
    )
  }

  const confidenceLabel = priceConfidenceLabel(quote.evidence_summary.confidence, language)
  return (
    <View
      accessible
      accessibilityLabel={language === 'vi'
        ? `Giá hai bên xác nhận. Khách trả ${formatCurrency(quote.customer_total)}. Phí nền tảng ${formatCurrency(quote.platform_fee)}. Thợ nhận ${formatCurrency(quote.worker_net)}.`
        : `Bilateral price confirmation. Customer total ${formatCurrency(quote.customer_total)}. Platform fee ${formatCurrency(quote.platform_fee)}. Worker keeps ${formatCurrency(quote.worker_net)}.`}
      style={[styles.priceReceipt, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
      testID="customer-v21-worker-candidate-price-receipt"
    >
      <View style={styles.priceHeader}>
        <View style={styles.priceHeaderCopy}>
          <Text style={[styles.paymentTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Giá đã được thợ xác nhận' : 'Worker-confirmed price'}
          </Text>
          <Text style={[styles.meta, { color: tokens.primary }]}>
            {language === 'vi' ? 'Chờ bạn chốt lần cuối' : 'Awaiting your final confirmation'}
          </Text>
        </View>
        <Text style={[styles.priceTotal, { color: tokens.text }]}>{formatCurrency(quote.customer_total)}</Text>
      </View>
      <View style={styles.priceRows}>
        <PriceReceiptRow
          label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'}
          tokens={tokens}
          value={`${formatCurrency(quote.platform_fee)} · ${quote.commission_rate_bps / 100}%`}
        />
        <PriceReceiptRow
          label={language === 'vi' ? 'Thợ nhận' : 'Worker keeps'}
          tokens={tokens}
          value={formatCurrency(quote.worker_net)}
        />
        <PriceReceiptRow
          label={language === 'vi' ? 'Khoảng tham chiếu' : 'Reference range'}
          tokens={tokens}
          value={`${formatCurrency(quote.reference_price_min)} – ${formatCurrency(quote.reference_price_max)}`}
        />
      </View>
      <Text style={[styles.body, { color: tokens.muted }]}>
        {language === 'vi'
          ? `Kael chọn điểm giữa trung lập sau khi đối chiếu ${quote.evidence_summary.baseline_source_count} nguồn giá nền và ${quote.evidence_summary.market_source_count} nguồn thị trường; độ tin cậy ${confidenceLabel}.`
          : `Kael selected the neutral midpoint after checking ${quote.evidence_summary.baseline_source_count} baseline sources and ${quote.evidence_summary.market_source_count} market sources; ${confidenceLabel} confidence.`}
      </Text>
      <Text style={[styles.priceCap, { color: tokens.primary }]}>
        {language === 'vi'
          ? 'Chỉ áp dụng cho phạm vi hiện tại. Phát sinh vẫn bị khóa cho tới khi bạn duyệt biên nhận mới.'
          : 'Current scope only. Extra work stays locked until you approve a new receipt.'}
      </Text>
    </View>
  )
}

function WorkerProposalReceipt({
  formatCurrency,
  language,
  proposal,
  tokens,
}: {
  formatCurrency: (value: number) => string
  language: AppLanguage
  proposal: WorkerProposal
  tokens: CustomerThemeTokens
}) {
  const hasPriceRange = proposal.price_min !== null && proposal.price_max !== null
  const priceRange = hasPriceRange
    ? `${formatCurrency(proposal.price_min!)} – ${formatCurrency(proposal.price_max!)}`
    : null
  const title = hasPriceRange
    ? (language === 'vi' ? 'Phạm vi và khoảng giá thợ đề xuất' : 'Worker-proposed scope and range')
    : (language === 'vi' ? 'Yêu cầu khảo sát của thợ' : 'Worker inspection request')
  const body = hasPriceRange
    ? (language === 'vi'
        ? 'Đây là khoảng dự kiến do thợ đề xuất từ thông tin hiện có, chưa phải giá cuối đã khóa. Sau khi kiểm tra thực tế, mọi báo giá hoặc thay đổi phạm vi vẫn cần bạn duyệt.'
        : 'This is the worker’s estimated range from the available information, not a locked final price. After an on-site check, you must still approve any quote or scope change.')
    : (language === 'vi'
        ? 'Chưa có giá sửa chữa ở bước này. Xác nhận chỉ chọn thợ để khảo sát; mọi báo giá và phạm vi sửa chữa sau khảo sát vẫn cần bạn duyệt.'
        : 'There is no repair price at this step. Confirmation only selects the worker for inspection; you must still approve the repair scope and quote afterward.')

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${proposal.scope_summary}. ${priceRange ?? ''} ${body}`.trim()}
      style={[styles.priceReceipt, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
      testID={hasPriceRange
        ? 'customer-v21-worker-candidate-rfq-proposal'
        : 'customer-v21-worker-candidate-inspection-proposal'}
    >
      <View style={styles.priceHeader}>
        <View style={styles.priceHeaderCopy}>
          <Text style={[styles.paymentTitle, { color: tokens.text }]}>{title}</Text>
          <Text style={[styles.meta, { color: tokens.primary }]}>
            {language === 'vi' ? 'Chờ bạn xác nhận chọn thợ' : 'Awaiting your worker selection'}
          </Text>
        </View>
        {priceRange ? <Text style={[styles.proposalRange, { color: tokens.text }]}>{priceRange}</Text> : null}
      </View>
      <Text style={[styles.proposalScope, { color: tokens.text }]}>{proposal.scope_summary}</Text>
      <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text>
      <Text style={[styles.priceCap, { color: tokens.primary }]}>
        {language === 'vi'
          ? 'Khách hàng vẫn phải xác nhận trước khi ghép thợ chính thức.'
          : 'Customer confirmation remains required before the worker is officially matched.'}
      </Text>
    </View>
  )
}

function PriceReceiptRow({ label, tokens, value }: {
  label: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={styles.priceRow}>
      <Text style={[styles.body, { color: tokens.muted }]}>{label}</Text>
      <Text style={[styles.priceValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19 },
  meta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  paymentTitle: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  priceCap: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  priceHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  priceHeaderCopy: { flex: 1, gap: 2 },
  priceReceipt: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 10, padding: 12 },
  priceRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  priceRows: { gap: 6 },
  priceTotal: { fontSize: 18, fontWeight: '800', lineHeight: 23 },
  priceValue: { flexShrink: 1, fontSize: 13, fontWeight: '700', lineHeight: 19, textAlign: 'right' },
  proposalRange: { flexShrink: 1, fontSize: 15, fontWeight: '800', lineHeight: 21, textAlign: 'right' },
  proposalScope: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
})
