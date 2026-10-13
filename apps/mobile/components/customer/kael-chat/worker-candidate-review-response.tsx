import { typography } from '@/design/theme'
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerCandidateView } from '@/lib/api-types'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'
import type { SavedWorkerSummary, SavedWorkersStatus } from './customer-saved-workers'
import { SavedWorkerConfirmationList } from './saved-worker-confirmation-list'
import { CandidatePriceReceipt } from './worker-candidate-review-price-receipt'
import { WorkerIdentitySummary } from './worker-identity-summary'

const VND_FORMATTER = new Intl.NumberFormat('vi-VN')

type WorkerCandidateReviewResponseProps = {
  busy: boolean
  candidate: WorkerCandidateView | null
  error: string | null
  language: AppLanguage
  onConfirm: () => void
  onReject: () => void
  onRetry: () => void
  onRetrySavedWorkers: () => void
  onToggleFavorite: (isFavorite: boolean) => void
  reduceMotion?: boolean
  savedWorkers: readonly SavedWorkerSummary[]
  savedWorkersEmptyMessage?: string
  savedWorkersStatus: SavedWorkersStatus
  tokens: CustomerThemeTokens
}

export function WorkerCandidateReviewResponse(props: WorkerCandidateReviewResponseProps) {
  return (
    <WorkerCandidateReviewContent
      key={props.candidate?.candidate_id ?? 'empty-candidate'}
      {...props}
    />
  )
}

function WorkerCandidateReviewContent({
  busy,
  candidate,
  error,
  language,
  onConfirm,
  onReject,
  onRetry,
  onRetrySavedWorkers,
  onToggleFavorite,
  reduceMotion = true,
  savedWorkers,
  savedWorkersEmptyMessage,
  savedWorkersStatus,
  tokens,
}: WorkerCandidateReviewResponseProps) {
  const [finalReviewOpen, setFinalReviewOpen] = useState(false)
  const displayName = candidate?.display_name?.trim() || (language === 'vi' ? 'Hồ sơ thợ' : 'Worker profile')
  const priceQuote = candidate?.original_scope_price_quote ?? null
  const workerProposal = candidate?.worker_proposal ?? null
  const confirmationReady = Boolean(
    priceQuote?.worker_confirmed_at || workerProposal?.status === 'proposed',
  )
  const confirmationCopy = candidateConfirmationCopy(displayName, priceQuote, workerProposal, language)
  const model = buildCaseWorkResponseModel({
    language,
    phase: 'worker_candidate_review',
    workerName: candidate?.display_name,
  })

  return (
    <CaseWorkResponse
      controls={candidate?.status === 'proposed' && finalReviewOpen && confirmationReady ? (
        <View style={styles.finalReview} testID="customer-v21-worker-candidate-final-review">
          <View style={styles.savedHeader}>
            <Text style={[styles.savedTitle, { color: tokens.text }]}>
              {language === 'vi' ? 'Thợ đã lưu từ Hoạt động' : 'Workers saved from Activity'}
            </Text>
            <Text style={[styles.body, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Đối chiếu danh sách bạn đã lưu trước khi đưa ra quyết định cuối.'
                : 'Compare your saved list before making the final decision.'}
            </Text>
          </View>
          <SavedWorkerConfirmationList
            candidateWorkerId={candidate.worker_id}
            emptyMessage={savedWorkersEmptyMessage}
            language={language}
            onRetry={onRetrySavedWorkers}
            status={savedWorkersStatus}
            tokens={tokens}
            workers={savedWorkers}
          />
          <Text style={[styles.notice, { color: tokens.muted }]}>
            {confirmationCopy.notice}
          </Text>
          <View style={styles.actions}>
            <KaelButton
              disabled={busy}
              label={language === 'vi' ? 'Quay lại' : 'Go back'}
              onPress={() => setFinalReviewOpen(false)}
              size="small"
              style={styles.action}
              testID="customer-v21-worker-candidate-final-back"
              variant="secondary"
            />
            <KaelButton
              accessibilityState={{ busy, disabled: busy || !confirmationReady }}
              disabled={busy || !confirmationReady}
              label={busy
                ? (language === 'vi' ? 'Đang xử lý' : 'Processing')
                : confirmationCopy.finalLabel}
              onPress={onConfirm}
              size="small"
              style={styles.action}
              testID="customer-v21-worker-candidate-final-confirm"
            />
          </View>
        </View>
      ) : candidate?.status === 'proposed' ? (
        <View style={styles.actionStack}>
          <KaelButton
            accessibilityState={{ busy, disabled: busy || !confirmationReady }}
            disabled={busy || !confirmationReady}
            label={busy
              ? (language === 'vi' ? 'Đang xử lý' : 'Processing')
              : confirmationCopy.reviewLabel}
            onPress={() => {
              if (confirmationReady) setFinalReviewOpen(true)
            }}
            style={styles.primaryAction}
            testID="customer-v21-worker-candidate-confirm"
          />
          <View style={styles.secondaryActions}>
            <KaelButton
              disabled={busy}
              label={language === 'vi' ? 'Tìm thợ khác' : 'Find another worker'}
              onPress={onReject}
              size="small"
              style={styles.secondaryAction}
              textStyle={styles.secondaryActionLabel}
              testID="customer-v21-worker-candidate-reject"
              variant="secondary"
            />
            <KaelButton
              accessibilityState={{ disabled: busy, selected: candidate.is_favorite }}
              disabled={busy}
              label={candidate.is_favorite
                ? (language === 'vi' ? 'Bỏ lưu thợ này' : 'Remove saved worker')
                : (language === 'vi' ? 'Lưu thợ yêu thích' : 'Save favorite worker')}
              onPress={() => onToggleFavorite(!candidate.is_favorite)}
              size="small"
              style={styles.secondaryAction}
              textStyle={styles.secondaryActionLabel}
              testID="customer-v21-worker-candidate-favorite-toggle"
              variant="secondary"
            />
          </View>
        </View>
      ) : !candidate && !busy ? (
        <KaelButton
          label={language === 'vi' ? 'Tải lại' : 'Retry'}
          onPress={onRetry}
          size="small"
          testID="customer-v21-worker-candidate-retry"
          variant="secondary"
        />
      ) : undefined}
      details={(
        <View style={styles.details}>
          {!candidate && busy && !error ? (
            <View style={styles.loading} testID="customer-v21-worker-candidate-loading">
              <ActivityIndicator color={tokens.primary} />
              <Text style={[styles.body, { color: tokens.muted }]}>
                {language === 'vi' ? 'Đang tải hồ sơ an toàn' : 'Loading the safe profile'}
              </Text>
            </View>
          ) : null}
          {candidate ? (
            <>
              <WorkerIdentitySummary
                identity={{
                  avatarUrl: candidate.avatar_url,
                  birthYear: candidate.birth_year,
                  displayName,
                  gender: candidate.gender,
                  rating: candidate.rating,
                  totalJobs: candidate.total_jobs,
                  yearsExperience: candidate.years_experience,
                }}
                language={language}
                meta={(
                  <>
                    {candidate.is_favorite ? (
                      <Text style={[styles.meta, { color: tokens.primary }]} testID="customer-v21-worker-candidate-favorite">
                        {language === 'vi' ? 'Đã lưu trong danh sách yêu thích' : 'Saved as a favorite worker'}
                      </Text>
                    ) : null}
                    {candidate.verification_status === 'approved' ? (
                      <Text style={[styles.meta, { color: tokens.primary }]}>
                        {language === 'vi' ? 'Hồ sơ đã xác minh' : 'Profile verified'}
                      </Text>
                    ) : null}
                  </>
                )}
                testIDPrefix="customer-v21-worker-candidate"
                tokens={tokens}
              />
              <CandidatePriceReceipt
                formatCurrency={formatVnd}
                language={language}
                proposal={workerProposal}
                quote={priceQuote}
                tokens={tokens}
              />
              <Text style={[styles.notice, { color: tokens.muted }]} testID="customer-v21-worker-candidate-address-lock">
                {language === 'vi'
                  ? 'Địa chỉ chi tiết vẫn được khóa cho tới khi bạn chọn thợ này.'
                  : 'Your detailed address stays locked until you choose this worker.'}
              </Text>
            </>
          ) : null}
          {error ? (
            <>
              <Text accessibilityLiveRegion="polite" style={[styles.error, { color: tokens.primary }]}>{error}</Text>
              <KaelButton
                label={language === 'vi' ? 'Kiểm tra lại trạng thái' : 'Check status again'}
                onPress={onRetry}
                size="small"
                testID="customer-v21-worker-candidate-reconcile"
                variant="secondary"
              />
            </>
          ) : null}
        </View>
      )}
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-worker-candidate-review"
      tokens={tokens}
    />
  )
}

function candidateConfirmationCopy(
  displayName: string,
  priceQuote: WorkerCandidateView['original_scope_price_quote'],
  workerProposal: WorkerCandidateView['worker_proposal'],
  language: AppLanguage,
) {
  if (priceQuote?.worker_confirmed_at) {
    return language === 'vi'
      ? {
          finalLabel: `Xác nhận thợ & giá ${formatVnd(priceQuote.customer_total)}`,
          notice: `Xác nhận này ghép ${displayName} và khóa giá ${formatVnd(priceQuote.customer_total)} cho phạm vi hiện tại. Mọi phát sinh phải có biên nhận mới để bạn duyệt.`,
          reviewLabel: `Xem thợ & giá ${formatVnd(priceQuote.customer_total)}`,
        }
      : {
          finalLabel: `Confirm worker & ${formatVnd(priceQuote.customer_total)}`,
          notice: `This confirms ${displayName} and locks ${formatVnd(priceQuote.customer_total)} for the current scope. Any extra work needs a new receipt for your approval.`,
          reviewLabel: `Review worker & ${formatVnd(priceQuote.customer_total)}`,
        }
  }
  if (workerProposal?.price_min !== null && workerProposal?.price_min !== undefined &&
    workerProposal.price_max !== null && workerProposal.price_max !== undefined) {
    const range = `${formatVnd(workerProposal.price_min)} – ${formatVnd(workerProposal.price_max)}`
    return language === 'vi'
      ? {
          finalLabel: 'Xác nhận thợ & phạm vi',
          notice: `Xác nhận này ghép ${displayName} cho phạm vi “${workerProposal.scope_summary}”. Khoảng ${range} là đề xuất ban đầu của thợ, chưa phải giá cuối đã khóa; mọi báo giá hoặc thay đổi vẫn cần bạn duyệt.`,
          reviewLabel: 'Xem thợ & đề xuất',
        }
      : {
          finalLabel: 'Confirm worker & scope',
          notice: `This matches ${displayName} for “${workerProposal.scope_summary}”. The ${range} range is the worker’s initial proposal, not a locked final price; you must still approve any quote or change.`,
          reviewLabel: 'Review worker & proposal',
        }
  }
  if (workerProposal) {
    return language === 'vi'
      ? {
          finalLabel: 'Xác nhận thợ khảo sát',
          notice: `Xác nhận này chỉ ghép ${displayName} để khảo sát phạm vi “${workerProposal.scope_summary}”. Bạn chưa xác nhận giá hoặc phạm vi sửa chữa; mọi báo giá sau khảo sát vẫn cần bạn duyệt.`,
          reviewLabel: 'Xem thợ khảo sát',
        }
      : {
          finalLabel: 'Confirm inspection worker',
          notice: `This only matches ${displayName} to inspect “${workerProposal.scope_summary}”. You are not confirming a repair price or scope; you must still approve any quote after inspection.`,
          reviewLabel: 'Review inspection worker',
        }
  }
  return language === 'vi'
    ? {
        finalLabel: 'Chưa thể xác nhận',
        notice: 'Dữ liệu xác nhận chưa sẵn sàng.',
        reviewLabel: 'Chờ Kael tải giá',
      }
    : {
        finalLabel: 'Cannot confirm yet',
        notice: 'Confirmation data is not ready.',
        reviewLabel: 'Waiting for Kael price',
      }
}

function formatVnd(value: number) {
  return `${VND_FORMATTER.format(value)}đ`
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actionStack: { gap: 12 },
  actions: { flexDirection: 'row', gap: 10 },
  body: { ...typography.subheadline },
  details: { gap: 14 },
  error: { ...typography.footnote },
  finalReview: { gap: 12 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  meta: { ...typography.footnote, fontWeight: '600' },
  notice: { ...typography.footnote },
  primaryAction: { alignSelf: 'stretch' },
  secondaryAction: { flexBasis: '48%', flexGrow: 0, flexShrink: 0, minHeight: 44, paddingHorizontal: 12 },
  secondaryActionLabel: { ...typography.footnote, fontWeight: '600' },
  secondaryActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  savedHeader: { gap: 3 },
  savedTitle: { ...typography.subheadline, fontWeight: '600' },
})
