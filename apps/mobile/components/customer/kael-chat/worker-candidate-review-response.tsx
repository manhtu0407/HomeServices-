import { typography } from '@/design/theme'
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerCandidateView } from '@/lib/api-types'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'
import type { SavedWorkerSummary, SavedWorkersStatus } from './customer-saved-workers'
import { SavedWorkerConfirmationList } from './saved-worker-confirmation-list'
import { CandidatePriceReceipt } from './worker-candidate-review-price-receipt'

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
  const facts = candidate ? candidateFacts(candidate, language) : []
  const personalFacts = candidate ? candidatePersonalFacts(candidate, language) : []
  const paymentEligibility = candidate
    ? paymentEligibilityCopy(candidate.direct_payment_available, language)
    : null
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
        <View style={styles.actions}>
          <KaelButton
            disabled={busy}
            label={language === 'vi' ? 'Tìm thợ khác' : 'Find another worker'}
            onPress={onReject}
            size="small"
            style={styles.action}
            testID="customer-v21-worker-candidate-reject"
            variant="secondary"
          />
          <KaelButton
            accessibilityState={{ busy, disabled: busy || !confirmationReady }}
            disabled={busy || !confirmationReady}
            label={busy
              ? (language === 'vi' ? 'Đang xử lý' : 'Processing')
              : confirmationCopy.reviewLabel}
            onPress={() => {
              if (confirmationReady) setFinalReviewOpen(true)
            }}
            size="small"
            style={styles.action}
            testID="customer-v21-worker-candidate-confirm"
          />
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
          {!candidate && busy ? (
            <View style={styles.loading} testID="customer-v21-worker-candidate-loading">
              <ActivityIndicator color={tokens.primary} />
              <Text style={[styles.body, { color: tokens.muted }]}>
                {language === 'vi' ? 'Đang tải hồ sơ an toàn' : 'Loading the safe profile'}
              </Text>
            </View>
          ) : null}
          {candidate ? (
            <>
              <View style={styles.identity} testID="customer-v21-worker-candidate-identity">
                <View style={[styles.avatarFrame, { backgroundColor: tokens.raised, borderColor: tokens.borderStrong }]}>
                  {candidate.avatar_url ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      accessibilityLabel={language === 'vi' ? `Ảnh đại diện của ${displayName}` : `${displayName}'s profile photo`}
                      contentFit="cover"
                      source={{ uri: candidate.avatar_url }}
                      style={styles.avatar}
                      testID="customer-v21-worker-candidate-avatar"
                    />
                  ) : (
                    <Text
                      accessibilityLabel={language === 'vi' ? `Chưa có ảnh đại diện của ${displayName}` : `${displayName} has no profile photo`}
                      style={[styles.avatarFallback, { color: tokens.primary }]}
                      testID="customer-v21-worker-candidate-avatar-fallback"
                    >
                      {initialsForCandidate(displayName)}
                    </Text>
                  )}
                </View>
                <View style={styles.identityCopy}>
                  <Text style={[styles.name, { color: tokens.text }]}>{displayName}</Text>
                  {personalFacts.length > 0 ? (
                    <Text style={[styles.personalFacts, { color: tokens.muted }]} testID="customer-v21-worker-candidate-personal-facts">
                      {personalFacts.join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
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
              {facts.length > 0 ? (
                <Text accessibilityLabel={facts.join(', ')} style={[styles.facts, { color: tokens.text }]} testID="customer-v21-worker-candidate-facts">
                  {facts.join(' · ')}
                </Text>
              ) : (
                <Text style={[styles.body, { color: tokens.muted }]}>
                  {language === 'vi' ? 'Chưa có lịch sử công việc đủ để hiển thị thêm.' : 'There is not enough completed-job history to show more yet.'}
                </Text>
              )}
              <Text style={[styles.body, { color: tokens.muted }]} testID="customer-v21-worker-candidate-address-lock">
                {language === 'vi'
                  ? 'Địa chỉ chi tiết vẫn được khóa cho tới khi bạn chọn thợ này.'
                  : 'Your detailed address stays locked until you choose this worker.'}
              </Text>
              <CandidatePriceReceipt
                formatCurrency={formatVnd}
                language={language}
                proposal={workerProposal}
                quote={priceQuote}
                tokens={tokens}
              />
              {paymentEligibility ? (
                <View
                  accessible
                  accessibilityLabel={`${paymentEligibility.title}. ${paymentEligibility.body}`}
                  style={[styles.paymentEligibility, { backgroundColor: tokens.base, borderColor: tokens.border }]}
                  testID={paymentEligibility.testID}
                >
                  <Text style={[styles.paymentTitle, { color: tokens.text }]}>{paymentEligibility.title}</Text>
                  <Text style={[styles.body, { color: tokens.muted }]}>{paymentEligibility.body}</Text>
                </View>
              ) : null}
              {!finalReviewOpen ? (
                <KaelButton
                  accessibilityState={{ disabled: busy, selected: candidate.is_favorite }}
                  disabled={busy}
                  label={candidate.is_favorite
                    ? (language === 'vi' ? 'Bỏ lưu thợ này' : 'Remove saved worker')
                    : (language === 'vi' ? 'Lưu thợ yêu thích' : 'Save favorite worker')}
                  onPress={() => onToggleFavorite(!candidate.is_favorite)}
                  size="small"
                  testID="customer-v21-worker-candidate-favorite-toggle"
                  variant="secondary"
                />
              ) : null}
            </>
          ) : null}
          {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: tokens.primary }]}>{error}</Text> : null}
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
          notice: `Xác nhận này ghép ${displayName} và khóa giá ${formatVnd(priceQuote.customer_total)} cho phạm vi hiện tại. Mọi phát sinh phải có receipt mới để bạn duyệt.`,
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

function paymentEligibilityCopy(availability: boolean | null | undefined, language: AppLanguage) {
  if (availability === true) {
    return language === 'vi'
      ? {
          body: 'Theo điều kiện hiện tại, Kael có thể mở trả trực tiếp có bảo đảm sau khi hoàn tất. Kael sẽ kiểm tra lại mọi điều kiện trước khi mở thanh toán.',
          testID: 'customer-v21-worker-candidate-payment-direct-available',
          title: 'Trả trực tiếp đang đủ điều kiện',
        }
      : {
          body: 'Under the current conditions, Kael can open protected direct payment after completion. Kael checks every condition again before payment opens.',
          testID: 'customer-v21-worker-candidate-payment-direct-available',
          title: 'Protected direct payment is currently eligible',
        }
  }
  if (availability === false) {
    return language === 'vi'
      ? {
          body: 'Với thợ này, Kael chưa thể mở trả trực tiếp có bảo đảm. Kael sẽ xác nhận phương thức thanh toán an toàn khi hoàn tất.',
          testID: 'customer-v21-worker-candidate-payment-direct-unavailable',
          title: 'Trả trực tiếp chưa được mở',
        }
      : {
          body: 'For this worker, Kael cannot open protected direct payment yet. Kael confirms the safe payment method after completion.',
          testID: 'customer-v21-worker-candidate-payment-direct-unavailable',
          title: 'Protected direct payment is not open',
        }
  }
  return language === 'vi'
    ? {
        body: 'Kael sẽ kiểm tra phương thức thanh toán an toàn trước khi mở bước thanh toán.',
        testID: 'customer-v21-worker-candidate-payment-checking',
        title: 'Phương thức thanh toán đang được xác nhận',
      }
    : {
        body: 'Kael checks the safe payment method before opening the payment step.',
        testID: 'customer-v21-worker-candidate-payment-checking',
        title: 'Payment method is being verified',
      }
}

function candidateFacts(candidate: WorkerCandidateView, language: AppLanguage) {
  const facts: string[] = []
  if (candidate.rating !== null && candidate.total_jobs > 0) facts.push(`${candidate.rating.toFixed(1)} ★`)
  if (candidate.total_jobs > 0) facts.push(language === 'vi' ? `${candidate.total_jobs} việc đã hoàn tất` : `${candidate.total_jobs} completed jobs`)
  if (candidate.years_experience > 0) facts.push(language === 'vi' ? `${candidate.years_experience} năm kinh nghiệm` : `${candidate.years_experience} years experience`)
  return facts
}

function candidatePersonalFacts(candidate: WorkerCandidateView, language: AppLanguage) {
  const facts: string[] = []
  if (typeof candidate.birth_year === 'number' && Number.isSafeInteger(candidate.birth_year)) {
    facts.push(language === 'vi' ? `Sinh năm ${candidate.birth_year}` : `Born ${candidate.birth_year}`)
  }
  if (candidate.gender) {
    const labels = language === 'vi'
      ? { female: 'Nữ', male: 'Nam', other: 'Khác' }
      : { female: 'Female', male: 'Male', other: 'Other' }
    facts.push(labels[candidate.gender])
  }
  return facts
}

function initialsForCandidate(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(-2).map((part) => part[0]?.toLocaleUpperCase() ?? '').join('') || 'K'
}

function formatVnd(value: number) {
  return `${VND_FORMATTER.format(value)}đ`
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  avatar: { height: '100%', width: '100%' },
  avatarFallback: { ...typography.headline },
  avatarFrame: {
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    height: 64,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 64,
  },
  body: { ...typography.footnote },
  details: { gap: 9 },
  error: { ...typography.caption1 },
  facts: { ...typography.footnote, fontWeight: '600' },
  finalReview: { gap: 12 },
  identity: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 5 },
  identityCopy: { flex: 1, gap: 3 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  meta: { ...typography.caption1, fontWeight: '600' },
  name: { ...typography.headline },
  notice: { ...typography.caption1 },
  personalFacts: { ...typography.caption1 },
  paymentEligibility: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 3, padding: 12 },
  paymentTitle: { ...typography.footnote, fontWeight: '600' },
  savedHeader: { gap: 3 },
  savedTitle: { ...typography.subheadline, fontWeight: '600' },
})
