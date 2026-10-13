import { StyleSheet, Text, View } from 'react-native'
import type { PropsWithChildren } from 'react'
import type { LocalDeal } from '@nestscout/shared'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import {
  customerBaselineEvidenceFromReview,
  customerPricingComponentsFromReview,
  formatVnd,
} from './case-work-money-display-model'

export function ScopeChangeProposalDetails({
  deal,
  language,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const scope = deal.scopeChange
  if (!scope) return null
  const review = scope.kaelReview
  const baselineEvidence = customerBaselineEvidenceFromReview(review)
  const pricingComponents = customerPricingComponentsFromReview(review)
  const facts = readStringArray(review, 'confirmed_facts')
  const unknowns = readStringArray(review, 'unknowns')
  const referenceMin = readNumber(review, 'reference_price_min')
  const referenceMax = readNumber(review, 'reference_price_max')
  const selectedPrice = scope.priceMax === scope.priceMin ? scope.priceMax : null
  const priceBasis = readRecord(review, 'pricing_basis')
  const stakeholderBalance = readRecord(review, 'stakeholder_balance')
  const workerConfirmation = readRecord(review, 'worker_price_confirmation')
  const customerTotal = readNumber(stakeholderBalance, 'customer_total')
  const platformFee = readNumber(stakeholderBalance, 'platform_fee')
  const workerNet = readNumber(stakeholderBalance, 'worker_net')
  const commissionRateBps = readNumber(stakeholderBalance, 'commission_rate_bps')
  const workerConfirmed = workerConfirmation?.confirmed === true
  const quantity = readNumber(priceBasis, 'quantity')
  const unitPrice = readNumber(priceBasis, 'unit_price_min')
  const pricingUnit = readString(priceBasis, 'unit')
  const sourceBand = referenceMin && referenceMax
    ? `${formatVnd(referenceMin, language)}–${formatVnd(referenceMax, language)}`
    : null
  const selectedCalculation = selectedPrice && pricingUnit === 'cabinet_door_scope'
    ? (language === 'vi'
        ? `Trung điểm của khoảng giá theo một cánh tủ = ${formatVnd(selectedPrice, language)}`
        : `Midpoint of the verified one-cabinet-door range = ${formatVnd(selectedPrice, language)}`)
    : selectedPrice && quantity && unitPrice
    ? `${quantity} × ${formatVnd(unitPrice, language)} = ${formatVnd(selectedPrice, language)}`
    : selectedPrice ? formatVnd(selectedPrice, language) : null
  const sourceDetails = baselineEvidence?.sources.map((source) =>
    `• ${source.domain} · T${source.effectiveTier} · ${source.observedAt} · ${formatVnd(source.priceMin, language)}–${formatVnd(source.priceMax, language)}`
  ).join('\n') ?? null
  const componentSourceDetails = pricingComponents?.map((component) => {
    const receipt = component.evidenceReceipt
    const label = component.kind === 'original_confirmed_scope'
      ? (language === 'vi' ? 'Phạm vi khảo sát đã xác nhận' : 'Confirmed diagnostic scope')
      : (language === 'vi' ? 'Phần sửa chữa phát sinh' : 'Added repair scope')
    const sources = receipt.sources.map((source) =>
      `• ${source.domain} · T${source.effectiveTier} · ${source.observedAt} · ${formatVnd(source.priceMin, language)}–${formatVnd(source.priceMax, language)}`
    ).join('\n')
    const quorum = language === 'vi'
      ? `Đủ nguồn ${receipt.acceptedSourceCount}/${receipt.requiredQuorum}`
      : `Quorum met ${receipt.acceptedSourceCount}/${receipt.requiredQuorum}`
    return `${label}: ${formatVnd(component.priceMin, language)}–${formatVnd(component.priceMax, language)} → ${formatVnd(component.selectedPrice, language)}\n${quorum}\n${sources}`
  }).join('\n\n') ?? null
  const displayedSourceDetails = componentSourceDetails ?? sourceDetails
  const compositePriceSelectionCopy = pricingComponents
    ? (language === 'vi'
        ? `${pricingComponents.map((component) => formatVnd(component.selectedPrice, language)).join(' + ')} = ${formatVnd(selectedPrice ?? 0, language)}. Kael chọn trung điểm riêng của từng cấu phần đã đủ nguồn, giữ nguyên giá trị phần khảo sát đã xác nhận và chỉ cộng phần sửa chữa mới đã được khoanh vùng.`
        : `${pricingComponents.map((component) => formatVnd(component.selectedPrice, language)).join(' + ')} = ${formatVnd(selectedPrice ?? 0, language)}. Kael selects the neutral midpoint of each independently verified component, preserving the confirmed diagnostic work and adding only the newly bounded repair work.`)
    : null

  return (
    <View style={styles.container} testID="customer-v21-case-work-scope-proposal-receipt">
      <Section label={language === 'vi' ? '1. Thợ đã báo cáo' : '1. Worker report'} tokens={tokens}>
        <Fact
          label={language === 'vi' ? 'Phần việc đề nghị' : 'Requested work'}
          tokens={tokens}
          value={scope.requestedDescription || (language === 'vi' ? 'Chưa có mô tả.' : 'No description.')}
        />
        <Fact
          label={language === 'vi' ? 'Lý do thay đổi' : 'Reason for the change'}
          tokens={tokens}
          value={scope.reason || (language === 'vi' ? 'Chưa có lý do.' : 'No reason.')}
        />
        <Fact
          label={language === 'vi' ? 'Bằng chứng gắn với báo cáo' : 'Evidence linked to report'}
          tokens={tokens}
          value={language === 'vi'
            ? `${scope.evidencePhotoUrls.length} ảnh hiện trường`
            : `${scope.evidencePhotoUrls.length} on-site photo${scope.evidencePhotoUrls.length === 1 ? '' : 's'}`}
        />
      </Section>

      <Section label={language === 'vi' ? '2. Kael đã đối chiếu' : '2. Kael cross-check'} tokens={tokens}>
        <Fact
          label={language === 'vi' ? 'Dữ kiện đã dùng' : 'Facts used'}
          tokens={tokens}
          value={facts.length > 0 ? facts.map((fact) => `• ${fact}`).join('\n') : (language === 'vi' ? 'Chưa đủ dữ kiện.' : 'Facts are incomplete.')}
        />
        <Fact
          label={language === 'vi' ? 'Điểm chưa biết còn lại' : 'Remaining unknowns'}
          tokens={tokens}
          value={unknowns.length > 0
            ? unknowns.map((unknown) => `• ${unknown}`).join('\n')
            : (language === 'vi' ? 'Không còn điểm chưa biết nào ảnh hưởng đến giá của phạm vi này.' : 'No price-critical unknown remains for this scope.')}
        />
        <Fact
          label={language === 'vi' ? 'Giới hạn nhận định' : 'Assessment boundary'}
          tokens={tokens}
          value={language === 'vi'
            ? 'Kael đối chiếu dữ liệu và ảnh do các bên cung cấp, không tuyên bố đã tự xác minh vật lý tại hiện trường.'
            : 'Kael cross-checks party-supplied data and photos; it does not claim independent physical verification.'}
        />
        <Fact
          label={language === 'vi' ? 'Cách xử lý phần chưa biết' : 'How unknowns are handled'}
          tokens={tokens}
          value={language === 'vi'
            ? 'Kael không dùng các điểm chưa biết trên để tự động tăng giá. Mức giá chỉ áp dụng cho phạm vi, số lượng và điều kiện tiếp cận đã nêu; nếu hiện trường xuất hiện thêm hạng mục, vật tư hoặc phần hoàn thiện ngoài phạm vi thì phải lập đề xuất mới để bạn duyệt.'
            : 'Kael does not use these unknowns to increase the price automatically. The amount applies only to the stated scope, quantity, and access conditions; any additional work item, material, or finishing work requires a new proposal for your approval.'}
        />
      </Section>

      <Section label={language === 'vi' ? '3. Căn cứ giá cho công việc này' : '3. Case pricing basis'} tokens={tokens}>
        <Fact
          inline
          label={language === 'vi' ? 'Khoảng giá nguồn' : 'Source price band'}
          tokens={tokens}
          value={sourceBand || (language === 'vi' ? 'Chưa có nguồn hợp lệ.' : 'No valid source.')}
        />
        <Fact
          label={language === 'vi' ? 'Nguồn, mức tin cậy và ngày đối chiếu' : 'Sources, tiers, and checked dates'}
          tokens={tokens}
          value={displayedSourceDetails
            ? `${pricingComponents ? '' : language === 'vi' ? `Đủ số nguồn ${baselineEvidence?.acceptedSourceCount}/${baselineEvidence?.requiredQuorum}\n` : `Quorum met ${baselineEvidence?.acceptedSourceCount}/${baselineEvidence?.requiredQuorum}\n`}${displayedSourceDetails}`
            : (language === 'vi' ? 'Biên nhận chưa chứng minh đủ nguồn độc lập.' : 'The receipt does not prove enough independent sources.')}
        />
        <Fact
          label={language === 'vi' ? 'Cách chọn mức hợp lý' : 'Case-price selection'}
          tokens={tokens}
          value={pricingComponents && compositePriceSelectionCopy ? compositePriceSelectionCopy : selectedCalculation
            ? (language === 'vi'
                ? `${selectedCalculation}. Chọn trung điểm của đơn giá nguồn vì đã xác nhận vật tư tiêu chuẩn, không hỏng gỗ và tiếp cận bình thường.`
                : `${selectedCalculation}. The source unit midpoint is used because standard parts, no wood damage, and normal access are confirmed.`)
            : (language === 'vi' ? 'Chưa thể chọn mức giá cụ thể.' : 'A case-specific price cannot yet be selected.')}
        />
        <Fact
          label={language === 'vi' ? 'Giá cuối nếu bạn xác nhận' : 'Final price if confirmed'}
          tokens={tokens}
          value={selectedPrice
            ? (language === 'vi'
                ? `${formatVnd(selectedPrice, language)} cho toàn bộ phạm vi mới; không cộng vào giá cũ và thợ không thể tự sửa.`
                : `${formatVnd(selectedPrice, language)} for the full new scope; it is not added to the old price and the worker cannot edit it.`)
            : (language === 'vi' ? 'Chưa khóa được giá cuối.' : 'Final price is not locked.')}
        />
      </Section>

      <Section label={language === 'vi' ? '4. Cân bằng quyền lợi hai bên' : '4. Two-sided balance'} tokens={tokens}>
        <Fact
          inline
          label={language === 'vi' ? 'Khách thanh toán' : 'Customer total'}
          tokens={tokens}
          value={customerTotal ? formatVnd(customerTotal, language) : (language === 'vi' ? 'Chưa khóa.' : 'Not locked.')}
        />
        <Fact
          inline
          label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'}
          tokens={tokens}
          value={platformFee !== null && commissionRateBps !== null
            ? `${formatVnd(platformFee, language)} · ${commissionRateBps / 100}%`
            : (language === 'vi' ? 'Chưa khóa.' : 'Not locked.')}
        />
        <Fact
          inline
          label={language === 'vi' ? 'Thu nhập dự kiến của thợ' : 'Projected worker earnings'}
          tokens={tokens}
          value={workerNet ? formatVnd(workerNet, language) : (language === 'vi' ? 'Chưa khóa.' : 'Not locked.')}
        />
        <Fact
          label={language === 'vi' ? 'Đồng thuận của thợ' : 'Worker consent'}
          tokens={tokens}
          value={workerConfirmed
            ? (language === 'vi' ? 'Thợ đã xem đúng bảng giá chi tiết này và xác nhận gửi bạn.' : 'The worker reviewed this exact breakdown and confirmed it for you.')
            : (language === 'vi' ? 'Chưa có; bạn chưa thể duyệt.' : 'Missing; you cannot approve yet.')}
        />
      </Section>
    </View>
  )
}

function Section({ children, label, tokens }: PropsWithChildren<{ label: string; tokens: CustomerThemeTokens }>) {
  return (
    <View style={[styles.section, { borderTopColor: tokens.border }]}>
      <Text style={[styles.sectionLabel, { color: tokens.text }]}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

// A short figure reads as one receipt line, label left and number right; prose keeps the stacked form.
function Fact({ inline = false, label, tokens, value }: { inline?: boolean; label: string; tokens: CustomerThemeTokens; value: string }) {
  if (inline) {
    return (
      <View style={styles.factInline}>
        <Text numberOfLines={1} style={[styles.factInlineLabel, { color: tokens.muted }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.factInlineValue, { color: tokens.text }]}>{value}</Text>
      </View>
    )
  }
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: tokens.text }]}>{label}</Text>
      <Text style={[styles.factValue, { color: tokens.muted }]}>{value}</Text>
    </View>
  )
}

function readRecord(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readNumber(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readStringArray(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function readString(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key]
  return typeof value === 'string' ? value : null
}

const styles = StyleSheet.create({
  container: { gap: 18 },
  fact: { gap: 3 },
  factInline: { alignItems: 'baseline', columnGap: 12, flexDirection: 'row', justifyContent: 'space-between' },
  factInlineLabel: { ...typography.footnote, flexShrink: 1 },
  factInlineValue: { ...typography.subheadline, flexShrink: 0, fontVariant: ['tabular-nums'], fontWeight: '600', textAlign: 'right' },
  factLabel: { ...typography.footnote, fontWeight: '600' },
  factValue: { ...typography.footnote },
  section: { borderTopWidth: StyleSheet.hairlineWidth, gap: 10, paddingTop: 16 },
  sectionBody: { gap: 12 },
  sectionLabel: { ...typography.subheadline, fontWeight: '600' },
})
