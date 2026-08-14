import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { LocalScopeChange } from '@nestscout/shared'
import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import {
  canCustomerDecideScopeChange,
  customerBaselineEvidenceFromReview,
} from '../kael-chat/case-work-money-display-model'

type ScopeChangeModalTokens = {
  aqua: string
  base: string
  border: string
  borderStrong: string
  copper: string
  danger: string
  glassStrong: string
  muted: string
  primary: string
  primaryText: string
  raised: string
  text: string
  warm: string
}

type ScopeChangeHardStopModalProps = {
  busy?: boolean
  language: AppLanguage
  newScopeLabel: string
  originalEstimateLabel: string
  originalScopeLabel: string
  onApprove: () => void
  onReject: () => void
  scopeChange: LocalScopeChange | null
  tokens: ScopeChangeModalTokens
  visible: boolean
}

// Kael owns price computation; the customer remains the explicit authority for
// every work- or money-impacting scope adjustment.
const copy = {
  vi: {
    approve: 'Xác nhận thay đổi',
    currentEstimate: 'Ước tính ban đầu (Kael)',
    currentScope: 'Phạm vi ban đầu',
    explanation: 'Kael đã đối chiếu',
    fallback: 'Cần kiểm tra trong ứng dụng trước khi quyết định.',
    factsUsed: 'Facts Kael dùng để tính case này',
    finalPriceRule: 'Quy tắc giá cuối',
    hardStop: 'Phần thay đổi đang tạm dừng. Kael đã phân tích, nhưng chỉ bạn mới có thể xác nhận thay đổi hoặc giữ phạm vi cũ.',
    kaelBadge: 'Kael đối chiếu · hệ thống khóa giá',
    kaelBadgeHint: 'Kael phân loại phạm vi từ báo cáo và bằng chứng. Giá chỉ được lấy từ mốc đã xác minh cho đúng loại việc.',
    newEstimate: 'Ước tính mới (Kael)',
    newScope: 'Phạm vi mới',
    notVerified: 'Giới hạn xác minh',
    noCriticalUnknowns: 'Không còn unknown quyết định giá trong phạm vi đang đề xuất.',
    pending: 'Kael đang xét',
    priceBasis: 'Căn cứ giá đã xác minh',
    priceDisclaimer: 'Khoảng mới là tổng giá cho toàn bộ phạm vi thay thế đang đề xuất, không phải khoản cộng thêm vào giá cũ.',
    reason: 'Thợ báo cáo',
    reject: 'Giữ phạm vi cũ',
    risk: 'Lưu ý',
    title: 'Kael xét đổi phạm vi',
    timing: 'Thời điểm điều chỉnh',
    timingOnSite: 'Tại hiện trường',
    timingPreArrival: 'Trước khi thợ đến',
    unknowns: 'Điểm chưa biết',
  },
  en: {
    approve: 'Confirm change',
    currentEstimate: 'Original estimate (Kael)',
    currentScope: 'Original scope',
    explanation: 'Kael cross-check',
    fallback: 'Review this in the app before deciding.',
    factsUsed: 'Facts Kael used for this case',
    finalPriceRule: 'Final-price rule',
    hardStop: 'The changed work is paused. Kael has analyzed it, but only you can confirm the change or keep the original scope.',
    kaelBadge: 'Kael cross-check · system-priced',
    kaelBadgeHint: 'Kael classifies the report and evidence. Pricing comes only from a verified baseline for the exact work type.',
    newEstimate: 'New estimate (Kael)',
    newScope: 'New scope',
    notVerified: 'Verification boundary',
    noCriticalUnknowns: 'No price-critical unknown remains in the proposed scope.',
    pending: 'Kael reviewing',
    priceBasis: 'Verified pricing basis',
    priceDisclaimer: 'The new range is the total for the proposed replacement scope, not an amount added to the old estimate.',
    reason: 'Worker report',
    reject: 'Keep original scope',
    risk: 'Notes',
    title: 'Kael scope review',
    timing: 'Adjustment timing',
    timingOnSite: 'On site',
    timingPreArrival: 'Before arrival',
    unknowns: 'Unknowns',
  },
} satisfies Record<AppLanguage, Record<string, string>>

const vndFormatter = new Intl.NumberFormat('vi-VN')

export function ScopeChangeHardStopModal({
  busy = false,
  language,
  newScopeLabel,
  originalEstimateLabel,
  originalScopeLabel,
  onApprove,
  onReject,
  scopeChange,
  tokens,
  visible,
}: ScopeChangeHardStopModalProps) {
  const text = copy[language]
  const problemSummary = readString(scopeChange?.kaelReview, 'problem_summary') ?? text.fallback
  const advisory = readString(scopeChange?.kaelReview, 'advisory')
  const complexity = readString(scopeChange?.kaelReview, 'complexity_assessment')
  const confidence = readNumber(scopeChange?.kaelReview, 'confidence')
  const fallbackUsed = readBoolean(scopeChange?.kaelReview, 'fallback_used')
  const confirmedFacts = readStringArray(scopeChange?.kaelReview, 'confirmed_facts')
  const unknowns = readStringArray(scopeChange?.kaelReview, 'unknowns')
  const priceSource = readString(scopeChange?.kaelReview, 'price_source')
  const baselineSource = readString(scopeChange?.kaelReview, 'baseline_source')
  const baselineEvidence = customerBaselineEvidenceFromReview(scopeChange?.kaelReview)
  const referencePriceMin = readNumber(scopeChange?.kaelReview, 'reference_price_min')
  const referencePriceMax = readNumber(scopeChange?.kaelReview, 'reference_price_max')
  const pricingBasis = readRecord(scopeChange?.kaelReview, 'pricing_basis')
  const stakeholderBalance = readRecord(scopeChange?.kaelReview, 'stakeholder_balance')
  const workerConfirmation = readRecord(scopeChange?.kaelReview, 'worker_price_confirmation')
  const customerTotal = readNumber(stakeholderBalance, 'customer_total')
  const platformFee = readNumber(stakeholderBalance, 'platform_fee')
  const workerNet = readNumber(stakeholderBalance, 'worker_net')
  const commissionRateBps = readNumber(stakeholderBalance, 'commission_rate_bps')
  const decisionEnabled = Boolean(scopeChange && canCustomerDecideScopeChange(scopeChange))
  const evidencePhotoUrls = scopeChange?.evidencePhotoUrls ?? []
  const newEstimate = decisionEnabled && scopeChange?.priceMin && scopeChange.priceMax
    ? formatPriceRange(scopeChange.priceMin, scopeChange.priceMax)
    : text.pending
  const reason = scopeChange?.reason?.trim() || text.pending
  const metadataLabel = language === 'vi' ? 'Độ tin cậy' : 'Confidence'
  const photosLabel = language === 'vi' ? 'Ảnh minh chứng' : 'Evidence photos'
  const fallbackLabel = language === 'vi' ? 'Ước tính dự phòng' : 'Fallback estimate'
  const confidenceLabel = confidence !== null
    ? `${Math.round(confidence * 100)}%${fallbackUsed ? ` · ${fallbackLabel}` : ''}`
    : fallbackUsed ? fallbackLabel : text.pending
  const timingLabel = scopeChange?.requestTiming === 'pre_arrival'
    ? text.timingPreArrival
    : text.timingOnSite
  const priceBasisLabel = buildPriceBasisLabel(
    pricingBasis,
    referencePriceMin,
    referencePriceMax,
    scopeChange,
    language,
  )
  const sourceLabel = verifiedPriceSourceLabel(priceSource, baselineSource, language)
  const sourceEvidenceLabel = baselineEvidence
    ? [
        language === 'vi'
          ? `Đủ số nguồn ${baselineEvidence.acceptedSourceCount}/${baselineEvidence.requiredQuorum}.`
          : `Quorum met ${baselineEvidence.acceptedSourceCount}/${baselineEvidence.requiredQuorum}.`,
        ...baselineEvidence.sources.map((source) =>
          `${source.domain} · T${source.effectiveTier} · ${source.observedAt} · ${formatSinglePrice(source.priceMin)}–${formatSinglePrice(source.priceMax)}`
        ),
      ].join('\n')
    : (language === 'vi'
        ? 'Biên nhận chưa chứng minh đủ nguồn độc lập.'
        : 'The receipt does not prove enough independent sources.')
  const verificationBoundary = language === 'vi'
    ? 'Kael đã đối chiếu nội dung thợ báo, lý do và ảnh được gắn với công việc; Kael không tự có mặt để xác minh vật lý độc lập. Phần thay đổi vẫn bị khóa cho tới quyết định của bạn.'
    : 'Kael compared the worker report, reason, and job-linked photos; Kael was not physically present to verify the site independently. Changed work stays locked until your decision.'
  const finalPriceRule = decisionEnabled && scopeChange?.priceMax
    ? (language === 'vi'
        ? `Nếu bạn xác nhận, đúng mức ${formatSinglePrice(scopeChange.priceMax)} đã được thợ xem trước sẽ trở thành giá cuối của công việc. Thợ không thể tự sửa con số này.`
        : `If you confirm, the exact ${formatSinglePrice(scopeChange.priceMax)} amount already reviewed by the worker becomes the job's final price. The worker cannot edit it.`)
    : text.pending

  return (
    <Modal animationType="fade" onRequestClose={() => undefined} transparent visible={visible}>
      <View accessibilityViewIsModal style={styles.scrim} testID="customer-scope-change-hard-stop-modal">
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View style={[styles.sheet, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}>
          <Text style={[styles.eyebrow, { color: tokens.copper }]}>
            {text.pending}
          </Text>
          <Text style={[styles.title, { color: tokens.text }]}>{text.title}</Text>
          <Text style={[styles.body, { color: tokens.muted }]}>{text.hardStop}</Text>

          <View style={[styles.kaelBadge, { backgroundColor: tokens.aqua, borderColor: tokens.borderStrong }]} testID="customer-scope-change-modal-kael-badge">
            <Text style={[styles.kaelBadgeLabel, { color: tokens.primary }]}>
              ✦ {text.kaelBadge}
            </Text>
            <Text style={[styles.kaelBadgeHint, { color: tokens.muted }]}>
              {text.kaelBadgeHint}
            </Text>
          </View>

          <View style={styles.compareGrid}>
            <InfoBlock label={text.timing} tokens={tokens} value={timingLabel} />
            <InfoBlock label={text.currentScope} tokens={tokens} value={originalScopeLabel || text.pending} />
            <InfoBlock label={text.newScope} tokens={tokens} value={newScopeLabel || text.pending} />
            <InfoBlock label={text.currentEstimate} tokens={tokens} value={originalEstimateLabel || text.pending} />
            <InfoBlock label={text.newEstimate} tokens={tokens} value={newEstimate} />
          </View>
          <Text style={[styles.priceDisclaimer, { color: tokens.muted }]}>{text.priceDisclaimer}</Text>

          <View style={[styles.noteBox, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>
              {text.reason}
            </Text>
            <Text style={[styles.noteValue, { color: tokens.text }]}>{reason}</Text>
          </View>

          <View style={[styles.noteBox, { backgroundColor: tokens.warm, borderColor: tokens.border }]}>
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>
              {text.explanation}
            </Text>
            <Text style={[styles.noteValue, { color: tokens.text }]}>{problemSummary}</Text>
            {advisory ? (
              <Text style={[styles.riskText, { color: tokens.muted }]}>{advisory}</Text>
            ) : null}
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>{text.factsUsed}</Text>
            <Text style={[styles.riskText, { color: tokens.text }]}>
              {confirmedFacts.length > 0 ? confirmedFacts.map((fact) => `• ${fact}`).join('\n') : text.fallback}
            </Text>
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>{text.unknowns}</Text>
            <Text style={[styles.riskText, { color: tokens.muted }]}>
              {unknowns.length > 0 ? unknowns.map((unknown) => `• ${unknown}`).join('\n') : text.noCriticalUnknowns}
            </Text>
            <Text style={[styles.riskText, { color: tokens.copper }]}>
              {metadataLabel}: {confidenceLabel}{complexity ? ` · ${complexity}` : ''}
            </Text>
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>{text.notVerified}</Text>
            <Text style={[styles.riskText, { color: tokens.muted }]}>{verificationBoundary}</Text>
            {evidencePhotoUrls.length > 0 ? (
              <View style={styles.evidenceGrid}>
                <Text style={[styles.noteLabel, { color: tokens.copper }]}>
                  {photosLabel}
                </Text>
                <JobEvidenceGallery
                  language={language}
                  refs={evidencePhotoUrls}
                  stageLabel={photosLabel}
                  testID="customer-scope-change-evidence-gallery"
                />
              </View>
            ) : null}
          </View>

          <View
            style={[styles.noteBox, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
            testID="customer-scope-change-price-receipt"
          >
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>{text.priceBasis}</Text>
            <Text style={[styles.noteValue, { color: tokens.text }]}>{priceBasisLabel}</Text>
            <Text style={[styles.riskText, { color: tokens.muted }]}>{sourceLabel}</Text>
            <Text style={[styles.riskText, { color: tokens.muted }]}>{sourceEvidenceLabel}</Text>
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>
              {language === 'vi' ? 'Cân bằng quyền lợi' : 'Two-sided balance'}
            </Text>
            <Text style={[styles.riskText, { color: tokens.text }]}>
              {customerTotal !== null && platformFee !== null && workerNet !== null && commissionRateBps !== null
                ? (language === 'vi'
                    ? `Khách trả ${formatSinglePrice(customerTotal)} · phí nền tảng ${formatSinglePrice(platformFee)} (${commissionRateBps / 100}%) · thợ dự kiến nhận ${formatSinglePrice(workerNet)}.`
                    : `Customer total ${formatSinglePrice(customerTotal)} · platform fee ${formatSinglePrice(platformFee)} (${commissionRateBps / 100}%) · projected worker earnings ${formatSinglePrice(workerNet)}.`)
                : text.pending}
            </Text>
            <Text style={[styles.riskText, { color: tokens.muted }]}>
              {workerConfirmation?.confirmed === true
                ? (language === 'vi'
                    ? 'Thợ đã xem đúng bảng giá chi tiết này và xác nhận trước khi đề xuất được gửi cho bạn.'
                    : 'The worker reviewed this exact breakdown and confirmed it before the proposal reached you.')
                : (language === 'vi' ? 'Chưa có xác nhận giá từ thợ.' : 'Worker price confirmation is missing.')}
            </Text>
            <Text style={[styles.noteLabel, { color: tokens.primary }]}>{text.finalPriceRule}</Text>
            <Text style={[styles.riskText, { color: tokens.text }]}>{finalPriceRule}</Text>
          </View>

          <View style={styles.actionRow}>
            <KaelButton
              accessibilityState={{ busy, disabled: busy || !decisionEnabled }}
              disabled={busy || !decisionEnabled}
              label={text.reject}
              onPress={onReject}
              showPrimaryGradient={false}
              size="small"
              style={[styles.secondaryButton, { backgroundColor: tokens.glassStrong, borderColor: tokens.danger }]}
              testID="customer-scope-change-modal-reject"
              textStyle={[styles.secondaryText, { color: tokens.danger }]}
              variant="destructive"
            />
            <KaelButton
              accessibilityState={{ busy, disabled: busy || !decisionEnabled }}
              disabled={busy || !decisionEnabled}
              label={text.approve}
              onPress={onApprove}
              showPrimaryGradient={false}
              size="small"
              style={[styles.primaryButton, { backgroundColor: tokens.primary, borderColor: tokens.primary }]}
              testID="customer-scope-change-modal-approve"
              textStyle={[styles.primaryText, { color: tokens.primaryText }]}
            />
          </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

function InfoBlock({ label, tokens, value }: { label: string; tokens: ScopeChangeModalTokens; value: string }) {
  return (
    <View style={[styles.infoBlock, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]}>
        {label}
      </Text>
      <Text style={[styles.infoValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

function readString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function readRecord(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readStringArray(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function buildPriceBasisLabel(
  basis: Record<string, unknown> | null,
  referencePriceMin: number | null,
  referencePriceMax: number | null,
  scopeChange: LocalScopeChange | null,
  language: AppLanguage,
) {
  const quantity = readNumber(basis, 'quantity')
  const unit = readString(basis, 'unit')
  const unitMin = readNumber(basis, 'unit_price_min')
  const unitMax = readNumber(basis, 'unit_price_max')
  if (
    quantity === 1 && unit === 'cabinet_door_scope' && unitMin !== null &&
    unitMax !== null && referencePriceMin !== null && referencePriceMax !== null &&
    scopeChange?.priceMin && scopeChange.priceMax
  ) {
    return language === 'vi'
      ? `Khoảng tổng hợp theo một cánh tủ: ${formatSinglePrice(referencePriceMin)}–${formatSinglePrice(referencePriceMax)}. Với đúng hai bản lề tiêu chuẩn, không hỏng gỗ và tiếp cận bình thường, Kael chọn trung điểm trung lập: ${formatSinglePrice(scopeChange.priceMin)}.`
      : `Aggregated one-cabinet-door range: ${formatSinglePrice(referencePriceMin)}–${formatSinglePrice(referencePriceMax)}. With exactly two standard hinges, no wood damage, and normal access, Kael selects the neutral midpoint: ${formatSinglePrice(scopeChange.priceMin)}.`
  }
  if (
    quantity === 2 && unit === 'cabinet_hinge' && unitMin !== null &&
    unitMax !== null && scopeChange?.priceMin && scopeChange.priceMax
  ) {
    const referenceUnitMin = referencePriceMin === null ? null : referencePriceMin / quantity
    const referenceUnitMax = referencePriceMax === null ? null : referencePriceMax / quantity
    if (referenceUnitMin !== null && referenceUnitMax !== null) {
      return language === 'vi'
        ? `Khoảng nguồn: 2 bản lề × ${formatSinglePrice(referenceUnitMin)}–${formatSinglePrice(referenceUnitMax)} = ${formatSinglePrice(referencePriceMin!)}–${formatSinglePrice(referencePriceMax!)}. Với case đã xác nhận là vật tư tiêu chuẩn, không hỏng gỗ và tiếp cận bình thường, Kael chọn trung điểm: 2 × ${formatSinglePrice(unitMin)} = ${formatSinglePrice(scopeChange.priceMin)}.`
        : `Source band: 2 hinges × ${formatSinglePrice(referenceUnitMin)}–${formatSinglePrice(referenceUnitMax)} = ${formatSinglePrice(referencePriceMin!)}–${formatSinglePrice(referencePriceMax!)}. With standard parts, no wood damage, and normal access confirmed, Kael selects the midpoint: 2 × ${formatSinglePrice(unitMin)} = ${formatSinglePrice(scopeChange.priceMin)}.`
    }
    return language === 'vi'
      ? `2 bản lề × ${formatSinglePrice(unitMin)}–${formatSinglePrice(unitMax)} = ${formatSinglePrice(scopeChange.priceMin)}–${formatSinglePrice(scopeChange.priceMax)}.`
      : `2 hinges × ${formatSinglePrice(unitMin)}–${formatSinglePrice(unitMax)} = ${formatSinglePrice(scopeChange.priceMin)}–${formatSinglePrice(scopeChange.priceMax)}.`
  }
  if (scopeChange?.priceMin && scopeChange.priceMax) {
    return language === 'vi'
      ? `Tổng phạm vi mới theo mốc đã xác minh: ${formatPriceRange(scopeChange.priceMin, scopeChange.priceMax)}.`
      : `Verified total for the new scope: ${formatPriceRange(scopeChange.priceMin, scopeChange.priceMax)}.`
  }
  return language === 'vi' ? 'Chưa có căn cứ giá hợp lệ.' : 'No valid pricing basis is available.'
}

function verifiedPriceSourceLabel(
  priceSource: string | null,
  baselineSource: string | null,
  language: AppLanguage,
) {
  if (priceSource !== 'verified_baseline' || !baselineSource) {
    return language === 'vi'
      ? 'Chưa xác minh được nguồn giá; quyết định phải tiếp tục bị khóa.'
      : 'Pricing provenance is not verified; the decision must remain locked.'
  }
  if (baselineSource === 'multi_source_hcmc_cabinet_door_2026_08') {
    return language === 'vi'
      ? 'Nguồn: khoảng tổng hợp từ nhiều bảng giá dịch vụ độc lập tại TP.HCM.'
      : 'Source: an aggregate of independent HCMC service price tables.'
  }
  return language === 'vi'
    ? 'Nguồn: mốc giá dịch vụ đã được hệ thống xác minh.'
    : 'Source: a service baseline verified by the system.'
}

function formatPriceRange(min: number, max: number) {
  if (min === max) return `${vndFormatter.format(min)}đ`
  return `${vndFormatter.format(min)}đ - ${vndFormatter.format(max)}đ`
}

function formatSinglePrice(value: number) {
  return `${vndFormatter.format(value)}đ`
}

function readNumber(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function readBoolean(record: Record<string, unknown> | null | undefined, key: string) {
  return record?.[key] === true
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  body: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  compareGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  evidenceGrid: {
    gap: 8,
    paddingTop: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  infoBlock: {
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 5,
    minHeight: 86,
    padding: 12,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  kaelBadge: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  kaelBadgeHint: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 16,
  },
  kaelBadgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 20,
  },
  noteBox: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
    padding: 13,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  noteValue: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 20,
  },
  priceDisclaimer: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 17,
  },
  primaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  riskList: {
    gap: 5,
    paddingTop: 4,
  },
  riskText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0,
    lineHeight: 19,
  },
  scrim: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  scroll: {
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
  },
  sheet: {
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    maxWidth: 430,
    padding: 18,
    width: '100%',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 27,
  },
})
