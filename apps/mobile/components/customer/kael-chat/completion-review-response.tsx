import { StyleSheet, Text, View } from 'react-native'

import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { LocalDeal } from '@nestscout/shared'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'

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
  const model = buildCaseWorkResponseModel({ deal, language, phase: 'completed_by_worker' })
  const customerEvidencePhotoUrls = deal.customerEvidencePhotoUrls ?? []
  const fieldEvidencePhotoUrls = deal.fieldEvidencePhotoUrls ?? []
  const completionPhotoUrls = deal.completionPhotoUrls ?? []

  return (
    <CaseWorkResponse
      controls={(
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
      )}
      details={(
        <View style={styles.details}>
          {customerEvidencePhotoUrls.length > 0 ? (
            <JobEvidenceGallery
              language={language}
              refs={customerEvidencePhotoUrls}
              stageLabel={language === 'vi' ? 'Ảnh hiện trạng từ khách' : 'Customer condition photos'}
              testID="customer-completion-customer-gallery"
            />
          ) : null}
          {fieldEvidencePhotoUrls.length > 0 ? (
            <JobEvidenceGallery
              language={language}
              refs={fieldEvidencePhotoUrls}
              stageLabel={language === 'vi' ? 'Ảnh hiện trường của thợ' : 'Worker on-site photos'}
              testID="customer-completion-field-gallery"
            />
          ) : null}
          {completionPhotoUrls.length > 0 ? (
            <JobEvidenceGallery
              language={language}
              refs={completionPhotoUrls}
              stageLabel={language === 'vi' ? 'Ảnh hoàn tất' : 'Completion photos'}
              testID="customer-completion-after-gallery"
            />
          ) : null}
          <Text style={[styles.paymentGate, { color: tokens.muted }]}>
            {language === 'vi'
              ? 'Thanh toán chỉ mở sau bước xác nhận này.'
              : 'Payment unlocks only after this confirmation.'}
          </Text>
        </View>
      )}
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-completion-review"
      tokens={tokens}
    />
  )
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  details: { gap: 12 },
  paymentGate: { fontSize: 12, lineHeight: 18 },
})
