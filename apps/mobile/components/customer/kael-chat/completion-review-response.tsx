import { typography } from '@/design/theme'
import { StyleSheet, Text, View } from 'react-native'

import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'
import { formatShortClockTime, formatVnd } from './case-work-money-display-model'
import { CaseWorkReceipt, CaseWorkReceiptLine } from './case-work-receipt-line'
import { kaelActionPrimaryStyle } from './kael-next-action-chips'

export function CompletionReviewResponse({
  busy,
  deal,
  language,
  onConfirm,
  onReportIssue,
  reduceMotion = true,
  tokens,
}: {
  busy: boolean
  deal: LocalDeal
  language: AppLanguage
  onConfirm: () => void
  onReportIssue: () => void
  reduceMotion?: boolean
  tokens: CustomerThemeTokens
}) {
  const vi = language === 'vi'
  const model = buildCaseWorkResponseModel({ deal, language, phase: 'completed_by_worker' })
  const customerEvidencePhotoUrls = deal.customerEvidencePhotoUrls ?? []
  const fieldEvidencePhotoUrls = deal.fieldEvidencePhotoUrls ?? []
  const completionPhotoUrls = deal.completionPhotoUrls ?? []
  const workerNote = deal.completionNotes?.trim() || null
  const completedAt = formatShortClockTime(deal.completedAt, language)
  const agreedPrice = typeof deal.finalPrice === 'number' ? formatVnd(deal.finalPrice, language) : null

  return (
    <CaseWorkResponse
      controls={(
        <View style={styles.actionStack}>
          <KaelButton
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            label={busy
              ? (vi ? 'Đang xác nhận…' : 'Confirming…')
              : (vi ? 'Xác nhận hoàn tất' : 'Confirm completion')}
            onPress={onConfirm}
            style={kaelActionPrimaryStyle}
            testID="customer-v21-completion-confirm"
          />
          <KaelButton
            disabled={busy}
            label={vi ? 'Có vấn đề' : 'Report an issue'}
            onPress={onReportIssue}
            size="small"
            style={styles.secondaryAction}
            testID="customer-v21-completion-report-issue"
            variant="secondary"
          />
        </View>
      )}
      details={(
        <View style={styles.details}>
          <View style={styles.report}>
            <Text style={[styles.heading, { color: tokens.primary }]}>{model.noteTitle}</Text>
            <Text style={[styles.reportNote, { color: tokens.text }]} testID="customer-v21-completion-worker-note">
              {workerNote ?? model.noteCopy}
            </Text>
          </View>
          {completedAt || agreedPrice ? (
            <CaseWorkReceipt tokens={tokens}>
              {completedAt ? <CaseWorkReceiptLine label={vi ? 'Thợ báo xong lúc' : 'Worker finished at'} tokens={tokens} value={completedAt} /> : null}
              {agreedPrice ? <CaseWorkReceiptLine label={vi ? 'Giá đã chốt' : 'Agreed price'} tokens={tokens} value={agreedPrice} /> : null}
            </CaseWorkReceipt>
          ) : null}
          {customerEvidencePhotoUrls.length > 0 ? (
            <JobEvidenceGallery
              language={language}
              refs={customerEvidencePhotoUrls}
              stageLabel={vi ? 'Ảnh hiện trạng từ khách' : 'Customer condition photos'}
              testID="customer-completion-customer-gallery"
            />
          ) : null}
          {fieldEvidencePhotoUrls.length > 0 ? (
            <JobEvidenceGallery
              language={language}
              refs={fieldEvidencePhotoUrls}
              stageLabel={vi ? 'Ảnh hiện trường của thợ' : 'Worker on-site photos'}
              testID="customer-completion-field-gallery"
            />
          ) : null}
          {completionPhotoUrls.length > 0 ? (
            <JobEvidenceGallery
              language={language}
              refs={completionPhotoUrls}
              stageLabel={vi ? 'Ảnh hoàn tất' : 'Completion photos'}
              testID="customer-completion-after-gallery"
            />
          ) : null}
          <Text style={[styles.paymentGate, { color: tokens.muted }]}>
            {vi
              ? 'Thanh toán chỉ mở sau bước xác nhận này.'
              : 'Payment unlocks only after this confirmation.'}
          </Text>
        </View>
      )}
      hideNoteSummary
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-completion-review"
      tokens={tokens}
    />
  )
}

const styles = StyleSheet.create({
  actionStack: { alignSelf: 'stretch', gap: 12 },
  details: { gap: 18 },
  heading: { ...typography.subheadline, fontWeight: '600' },
  paymentGate: { ...typography.footnote },
  report: { gap: 7 },
  reportNote: { ...typography.body },
  secondaryAction: { alignSelf: 'stretch', minHeight: 44, paddingHorizontal: 12 },
})
