import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerCandidateView } from '@/lib/api-types'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkResponse } from '../v21/case-work-response'
import { buildCaseWorkResponseModel } from '../v21/case-work-response-model'
import type { SavedWorkerSummary, SavedWorkersStatus } from './customer-saved-workers'
import { SavedWorkerConfirmationList } from './saved-worker-confirmation-list'

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
  const facts = candidate ? candidateFacts(candidate, language) : []
  const model = buildCaseWorkResponseModel({
    language,
    phase: 'worker_candidate_review',
    workerName: candidate?.display_name,
  })

  return (
    <CaseWorkResponse
      controls={candidate?.status === 'proposed' && finalReviewOpen ? (
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
            {language === 'vi'
              ? 'Công việc chỉ ghép thợ và gửi thông báo sau lần xác nhận này.'
              : 'The job is matched and notifications are sent only after this confirmation.'}
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
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              label={busy
                ? (language === 'vi' ? 'Đang xử lý' : 'Processing')
                : (language === 'vi' ? 'Xác nhận thợ này' : 'Confirm this worker')}
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
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            label={busy
              ? (language === 'vi' ? 'Đang xử lý' : 'Processing')
              : (language === 'vi' ? 'Chọn thợ này' : 'Choose this worker')}
            onPress={() => setFinalReviewOpen(true)}
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
              <Text style={[styles.name, { color: tokens.text }]}>{displayName}</Text>
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

function candidateFacts(candidate: WorkerCandidateView, language: AppLanguage) {
  const facts: string[] = []
  if (candidate.rating !== null && candidate.total_jobs > 0) facts.push(`${candidate.rating.toFixed(1)} ★`)
  if (candidate.total_jobs > 0) facts.push(language === 'vi' ? `${candidate.total_jobs} việc đã hoàn tất` : `${candidate.total_jobs} completed jobs`)
  if (candidate.years_experience > 0) facts.push(language === 'vi' ? `${candidate.years_experience} năm kinh nghiệm` : `${candidate.years_experience} years experience`)
  return facts
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  body: { fontSize: 13, lineHeight: 19 },
  details: { gap: 8 },
  error: { fontSize: 12, lineHeight: 18 },
  facts: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  finalReview: { gap: 12 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  meta: { fontSize: 12, fontWeight: '600', lineHeight: 18 },
  name: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  notice: { fontSize: 12, lineHeight: 18 },
  savedHeader: { gap: 3 },
  savedTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
})
