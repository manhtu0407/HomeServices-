import { Image } from 'expo-image'
import { Modal, StyleSheet, Text, View } from 'react-native'
import type { LocalScopeChange } from '@nestscout/shared'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'
import { canCustomerDecideScopeChange } from '../v21/case-work-money-display-model'

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
    explanation: 'Đánh giá của Kael',
    fallback: 'Cần kiểm tra trong ứng dụng trước khi quyết định.',
    hardStop: 'Phần thay đổi đang tạm dừng. Kael đã phân tích, nhưng chỉ bạn mới có thể xác nhận thay đổi hoặc giữ phạm vi cũ.',
    kaelBadge: 'Kael tự tính',
    kaelBadgeHint: 'Ước tính mới do Kael tính lại dựa trên phạm vi thợ báo cáo.',
    newEstimate: 'Ước tính mới (Kael)',
    newScope: 'Phạm vi mới',
    pending: 'Kael đang xét',
    priceDisclaimer: 'Đây là ước tính do Kael tính theo dữ liệu hiện có. Kael có thể cập nhật khi có bằng chứng phạm vi mới.',
    reason: 'Lý do từ thợ',
    reject: 'Giữ phạm vi cũ',
    risk: 'Lưu ý',
    title: 'Kael xét đổi phạm vi',
    timing: 'Thời điểm điều chỉnh',
    timingOnSite: 'Tại hiện trường',
    timingPreArrival: 'Trước khi thợ đến',
  },
  en: {
    approve: 'Confirm change',
    currentEstimate: 'Original estimate (Kael)',
    currentScope: 'Original scope',
    explanation: 'Kael review',
    fallback: 'Review this in the app before deciding.',
    hardStop: 'The changed work is paused. Kael has analyzed it, but only you can confirm the change or keep the original scope.',
    kaelBadge: 'Computed by Kael',
    kaelBadgeHint: 'The new estimate is recomputed by Kael based on the scope the worker reported.',
    newEstimate: 'New estimate (Kael)',
    newScope: 'New scope',
    pending: 'Kael reviewing',
    priceDisclaimer: 'This is a Kael estimate from the current evidence. Kael may update it when new scope evidence is added.',
    reason: 'Worker reason',
    reject: 'Keep original scope',
    risk: 'Notes',
    title: 'Kael scope review',
    timing: 'Adjustment timing',
    timingOnSite: 'On site',
    timingPreArrival: 'Before arrival',
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
  const decisionEnabled = Boolean(scopeChange && canCustomerDecideScopeChange(scopeChange))
  const evidencePhotoUrls = scopeChange?.evidencePhotoUrls ?? []
  const evidencePreviewUrls = useJobMediaPreviewUrls(evidencePhotoUrls)
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

  return (
    <Modal animationType="fade" onRequestClose={() => undefined} transparent visible={visible}>
      <View accessibilityViewIsModal style={styles.scrim} testID="customer-scope-change-hard-stop-modal">
        <View style={[styles.sheet, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}>
          <Text style={[styles.eyebrow, { color: tokens.copper }]} numberOfLines={1}>
            {text.pending}
          </Text>
          <Text style={[styles.title, { color: tokens.text }]}>{text.title}</Text>
          <Text style={[styles.body, { color: tokens.muted }]}>{text.hardStop}</Text>

          <View style={[styles.kaelBadge, { backgroundColor: tokens.aqua, borderColor: tokens.borderStrong }]} testID="customer-scope-change-modal-kael-badge">
            <Text style={[styles.kaelBadgeLabel, { color: tokens.primary }]} numberOfLines={1}>
              ✦ {text.kaelBadge}
            </Text>
            <Text style={[styles.kaelBadgeHint, { color: tokens.muted }]} numberOfLines={3}>
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
            <Text style={[styles.noteLabel, { color: tokens.primary }]} numberOfLines={1}>
              {text.reason}
            </Text>
            <Text style={[styles.noteValue, { color: tokens.text }]}>{reason}</Text>
          </View>

          <View style={[styles.noteBox, { backgroundColor: tokens.warm, borderColor: tokens.border }]}>
            <Text style={[styles.noteLabel, { color: tokens.primary }]} numberOfLines={1}>
              {text.explanation}
            </Text>
            <Text style={[styles.noteValue, { color: tokens.text }]}>{problemSummary}</Text>
            {advisory ? (
              <Text style={[styles.riskText, { color: tokens.muted }]}>{advisory}</Text>
            ) : null}
            <Text style={[styles.riskText, { color: tokens.copper }]}>
              {metadataLabel}: {confidenceLabel}{complexity ? ` · ${complexity}` : ''}
            </Text>
            {evidencePhotoUrls.length > 0 ? (
              <View style={styles.evidenceGrid}>
                <Text style={[styles.noteLabel, { color: tokens.copper }]} numberOfLines={1}>
                  {photosLabel}
                </Text>
                <View style={styles.evidenceRow}>
                  {evidencePreviewUrls.slice(0, 3).filter((uri): uri is string => Boolean(uri)).map((uri) => (
                    <Image
                      key={uri}
                      source={{ uri }}
                      style={[styles.evidenceImage, { borderColor: tokens.borderStrong }]}
                    />
                  ))}
                </View>
              </View>
            ) : null}
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
      </View>
    </Modal>
  )
}

function InfoBlock({ label, tokens, value }: { label: string; tokens: ScopeChangeModalTokens; value: string }) {
  return (
    <View style={[styles.infoBlock, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
      <Text style={[styles.infoLabel, { color: tokens.muted }]} numberOfLines={1}>
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

function formatPriceRange(min: number, max: number) {
  return `${vndFormatter.format(min)}đ - ${vndFormatter.format(max)}đ`
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
  evidenceImage: {
    borderRadius: 10,
    borderWidth: 1,
    height: 62,
    width: 62,
  },
  evidenceRow: {
    flexDirection: 'row',
    gap: 8,
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
