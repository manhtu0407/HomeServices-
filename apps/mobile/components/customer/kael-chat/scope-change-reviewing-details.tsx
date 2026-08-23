import { StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { formatVnd } from './case-work-money-display-model'

export function ScopeChangeReviewingDetails({
  deal,
  language,
  tokens,
}: {
  deal: LocalDeal
  language: AppLanguage
  tokens: CustomerThemeTokens
}) {
  const review = deal.scopeReview
  if (!review) return null

  const heldPrice = typeof deal.finalPrice === 'number'
    ? formatVnd(deal.finalPrice, language)
    : null
  const isEvidenceReady = review.evidenceStatus === 'ready' && review.evidenceCount > 0
  const evidenceCopy = language === 'vi'
    ? `${review.evidenceCount} ảnh hiện trường do thợ gửi${isEvidenceReady ? ' đã được gắn với báo cáo này' : '; Kael vẫn cần thêm căn cứ trước khi lập đề xuất'}.`
    : `${review.evidenceCount} on-site photo${review.evidenceCount === 1 ? '' : 's'} submitted by the worker${isEvidenceReady ? ' are linked to this report' : '; Kael still needs more evidence before drafting a proposal'}.`
  const readinessLabel = language === 'vi'
    ? (isEvidenceReady ? 'Đủ dữ liệu để lập đề xuất' : 'Chưa đủ dữ liệu để lập đề xuất')
    : (isEvidenceReady ? 'Enough data to draft a proposal' : 'More data is required')
  const kaelFinding = [review.lastSummary, review.lastQuestion].filter(Boolean).join(' ')
  const originalScope = deal.draft.description.trim()
  const kaelBoundary = language === 'vi'
    ? `Kael đối chiếu mô tả, lý do và ${review.evidenceCount} ảnh thợ đã gửi; Kael chưa xác minh vật lý độc lập tại hiện trường. ${isEvidenceReady ? 'Kết luận hiện tại chỉ cho phép lập một đề xuất mới để khách xem xét, chưa cho phép thi công.' : 'Chưa thể kết luận phần phát sinh hợp lệ hoặc tính giá mới.'}`
    : `Kael compared the description, reason, and ${review.evidenceCount} worker-submitted photo${review.evidenceCount === 1 ? '' : 's'}; Kael has not independently verified the physical site. ${isEvidenceReady ? 'The current conclusion only permits drafting a new proposal for Customer review, not performing the changed work.' : 'The changed work and a new price cannot yet be concluded.'}`
  const customerDecision = language === 'vi'
    ? `${heldPrice ? `Mức đang giữ cho phạm vi cũ: ${heldPrice}. ` : ''}Kael chưa xác nhận giá mới. Bạn chỉ cần quyết định sau khi đề xuất hiển thị riêng phần việc thêm, căn cứ giá và tổng tiền mới.`
    : `${heldPrice ? `Price held for the prior scope: ${heldPrice}. ` : ''}Kael has not confirmed a new price. Decide only after the proposal separately shows the added work, pricing basis, and new total.`

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.container, { backgroundColor: tokens.base, borderColor: tokens.border }]}
      testID="customer-v21-case-work-scope-reviewing"
    >
      <ReviewSection
        label={language === 'vi' ? 'Báo cáo từ thợ' : 'Worker report'}
        testID="customer-v21-case-work-scope-review-worker"
        tokens={tokens}
      >
        <FactRow
          body={review.reportedDescription || (language === 'vi' ? 'Thợ chưa mô tả rõ phần việc phát sinh.' : 'The changed work has not been described clearly.')}
          label={language === 'vi' ? 'Phần việc thợ đề nghị' : 'Work requested by the worker'}
          tokens={tokens}
        />
        <FactRow
          body={review.reportedReason || (language === 'vi' ? 'Thợ chưa nêu lý do thay đổi.' : 'No reason for the change was supplied.')}
          label={language === 'vi' ? 'Lý do thợ cung cấp' : 'Reason supplied by the worker'}
          tokens={tokens}
        />
        <FactRow
          body={evidenceCopy}
          label={language === 'vi' ? 'Bằng chứng thợ cung cấp' : 'Worker-provided evidence'}
          tokens={tokens}
        />
      </ReviewSection>

      <ReviewSection
        label={language === 'vi' ? 'Nhận định khách quan của Kael' : 'Kael objective assessment'}
        testID="customer-v21-case-work-scope-review-kael"
        tokens={tokens}
      >
        <FactRow
          body={originalScope || (language === 'vi' ? 'Chưa tải được mô tả phạm vi cũ.' : 'The prior scope description is unavailable.')}
          label={language === 'vi' ? 'Phạm vi khách đã duyệt' : 'Customer-approved scope'}
          tokens={tokens}
        />
        <FactRow
          body={review.reportedDescription || (language === 'vi' ? 'Chưa xác định được điểm thay đổi.' : 'The changed work is not yet clear.')}
          label={language === 'vi' ? 'Điểm thay đổi cần xem xét' : 'Change requiring review'}
          tokens={tokens}
        />
        <FactRow
          body={kaelFinding || (language === 'vi' ? 'Kael đang đối chiếu dữ liệu đã nhận.' : 'Kael is comparing the submitted data.')}
          label={language === 'vi' ? 'Kael đối chiếu theo dữ liệu đã nhận' : 'Kael comparison of submitted data'}
          tokens={tokens}
        />
        <FactRow body={kaelBoundary} label={readinessLabel} tokens={tokens} />
      </ReviewSection>

      <ReviewSection
        label={language === 'vi' ? 'Quyết định của bạn' : 'Your decision'}
        testID="customer-v21-case-work-scope-review-customer"
        tokens={tokens}
      >
        <Text style={[styles.body, { color: tokens.muted }]}>{customerDecision}</Text>
      </ReviewSection>

      <Text style={[styles.locked, { color: tokens.primary }]} testID="customer-v21-case-work-scope-review-lock">
        {language === 'vi'
          ? 'Phần phát sinh vẫn bị khóa cho tới khi bạn xác nhận đề xuất mới.'
          : 'Changed work remains locked until you confirm the new proposal.'}
      </Text>
    </View>
  )
}

function ReviewSection({
  children,
  label,
  testID,
  tokens,
}: {
  children: ReactNode
  label: string
  testID: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.section} testID={testID}>
      <Text style={[styles.sectionLabel, { color: tokens.text }]}>{label}</Text>
      <View style={[styles.sectionBody, { borderLeftColor: tokens.primary }]}>{children}</View>
    </View>
  )
}

function FactRow({
  body,
  label,
  tokens,
}: {
  body: string
  label: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.factRow}>
      <Text style={[styles.factLabel, { color: tokens.text }]}>{label}</Text>
      <Text style={[styles.body, { color: tokens.muted }]}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19 },
  container: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  factLabel: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  factRow: { gap: 3 },
  locked: { fontSize: 12, fontWeight: '700', lineHeight: 18 },
  section: { gap: 7 },
  sectionBody: { borderLeftWidth: 2, gap: 10, paddingLeft: 12 },
  sectionLabel: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
})
