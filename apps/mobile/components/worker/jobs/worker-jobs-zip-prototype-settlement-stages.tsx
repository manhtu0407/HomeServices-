import { WorkerStageElevenRuntime, type WorkerStageElevenRuntimeProps } from './stage-eleven/stage-eleven-runtime'
import { Image } from 'expo-image'
import { View } from 'react-native'

import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { isDealPaymentProtected } from '@/lib/frontend-workflow/payment-proof'
import { formatVnd, textByLanguage } from '../ui/format'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import type { WorkerV5OfferDetailRow } from './offer'
import {
  Text,
  WorkerJobsLegacyPrototypeStageActionButton,
  type WorkerJobsLegacyPrototypeRuntime,
  workerJobsLegacyPrototypeStageNineWorkart,
  workerJobsLegacyPrototypeStageTenWorkart,
} from './worker-jobs-zip-prototype-shared'
import { prototypeStyles } from './worker-jobs-zip-prototype-styles'
import { WorkerJobsLegacyPrototypeOfferInfoGroup } from './worker-jobs-zip-prototype-early-stages'

export function WorkerJobsLegacyPrototypeStageNineBody({
  actionBusy,
  language,
  navigateNext,
  navigateToEvidence,
  reduceTransparency,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateNext: () => void
  navigateToEvidence: () => void
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const paymentRecorded = isDealPaymentProtected(deal)
  const sourceCount = (deal?.completionPhotoUrls?.length ?? 0) + (deal?.completionNotes?.trim() ? 1 : 0)
  const customerConfirmed = deal?.status === 'confirmed_by_customer' || deal?.status === 'payment_pending' || deal?.status === 'paid' || deal?.status === 'reviewed'
  const awaitingDirectPaymentConfirmation = deal?.payment?.provider === 'direct_worker'
    && (deal.payment.status === 'direct_awaiting_worker_confirmation'
      || (deal.payment.status === 'direct_awaiting_confirmation' && Boolean(deal.payment.directCustomerConfirmedAt)))
    && !deal.payment.directWorkerConfirmedAt
  const hasSubmittedArtifact = Boolean(deal && (sourceCount > 0 || deal.completionPhotoUrls?.length || deal.completionNotes?.trim()))
  const heroTitle = customerConfirmed
    ? textByLanguage(language, 'Khách đã xác nhận', 'Customer confirmed')
    : hasSubmittedArtifact
      ? textByLanguage(language, 'Đã gửi hồ sơ', 'Completion record sent')
      : textByLanguage(language, 'Chưa có hồ sơ đã gửi', 'No submitted record')
  const heroMeta = customerConfirmed
    ? textByLanguage(language, 'Công việc đã chuyển sang bước kết thúc.', 'The job moved to its closing step.')
    : hasSubmittedArtifact
      ? textByLanguage(language, 'Khách đang kiểm tra bằng chứng và thanh toán.', 'The customer is reviewing evidence and payment.')
      : textByLanguage(language, 'Chỉ hiện khi hệ thống ghi nhận hồ sơ hoàn tất.', 'Shown when the system records completion.')
  const statusLabel = customerConfirmed
    ? textByLanguage(language, 'Đã xác nhận', 'Confirmed')
    : hasSubmittedArtifact
      ? textByLanguage(language, 'Đang chờ', 'Waiting')
      : textByLanguage(language, 'Chưa có', 'Not ready')
  const rows: WorkerV5OfferDetailRow[] = [
    {
      icon: 'document',
      title: textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion record'),
      meta: textByLanguage(language, 'Ảnh và ghi chú đã gửi', 'Photos and note submitted'),
      status: sourceCount > 0 ? textByLanguage(language, `${sourceCount} mục`, `${sourceCount} items`) : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      icon: 'profile',
      title: textByLanguage(language, 'Khách kiểm tra', 'Customer review'),
      meta: textByLanguage(language, 'Phản hồi từ khách', 'Customer response'),
      status: customerConfirmed ? textByLanguage(language, 'Đã xác nhận', 'Confirmed') : textByLanguage(language, 'Đang chờ', 'Waiting'),
    },
    {
      icon: 'wallet',
      title: textByLanguage(language, 'Thanh toán', 'Payment'),
      meta: textByLanguage(language, 'Theo phương thức đã chọn', 'Selected payment method'),
      status: awaitingDirectPaymentConfirmation
        ? textByLanguage(language, 'Cần đối soát', 'Needs reconciliation')
        : paymentRecorded
          ? textByLanguage(language, 'Đã ghi nhận', 'Recorded')
          : textByLanguage(language, 'Đang chờ', 'Waiting'),
    },
  ]

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-nine-prototype">
      <View style={[prototypeStyles.stageSubmissionHero, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-nine-hero">
        <View style={prototypeStyles.stageSubmissionCopy}>
          <Text style={prototypeStyles.stageSubmissionKicker}>{textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion record')}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageSubmissionTitle}>{heroTitle}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageSubmissionMeta}>{heroMeta}</Text>
        </View>
        <View style={prototypeStyles.stageSubmissionStatus}>
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            contentFit="contain"
            source={workerJobsLegacyPrototypeStageNineWorkart}
            style={prototypeStyles.stageSubmissionStatusArtwork}
            testID="worker-v5-stage-nine-status-workart"
          />
          <Text style={prototypeStyles.stageSubmissionStatusText}>{statusLabel}</Text>
        </View>
      </View>

      <View style={[prototypeStyles.offerInfoCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-nine-status-card">
        <WorkerJobsLegacyPrototypeOfferInfoGroup
          rows={rows}
          testID="worker-v5-stage-nine-status-list"
          title={textByLanguage(language, 'Trạng thái xử lý', 'Processing status')}
        />
      </View>

      {awaitingDirectPaymentConfirmation ? (
        <WorkerV5BoundaryNote
          body={textByLanguage(
            language,
            'Phương thức thanh toán trực tiếp cũ chỉ được giữ để bộ phận vận hành đối soát. Thợ không thể tự xác nhận đã nhận tiền trong ứng dụng.',
            'The legacy direct-payment method is retained for admin reconciliation only. A worker cannot mark it received in the app.',
          )}
          title={textByLanguage(language, 'Chờ nền tảng đối soát', 'Awaiting platform reconciliation')}
        />
      ) : null}

      {runtime.state.lastError ? (
        <WorkerV5BoundaryNote
          body={runtime.state.lastError}
          reduceTransparency={reduceTransparency}
          title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
        />
      ) : null}

      <View style={prototypeStyles.stageActionRow}>
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Xem hồ sơ', 'View record')}
          onPress={navigateToEvidence}
          testID="worker-v5-completion-submitted-timeline-action"
        />
        <WorkerJobsLegacyPrototypeStageActionButton
          disabled={!paymentRecorded || actionBusy}
          label={awaitingDirectPaymentConfirmation
            ? textByLanguage(language, 'Chờ đối soát', 'Awaiting reconciliation')
            : paymentRecorded ? textByLanguage(language, 'Mở công việc đã hoàn tất', 'Open completed job')
              : customerConfirmed ? textByLanguage(language, 'Chờ xác minh thanh toán', 'Awaiting payment verification')
                : textByLanguage(language, 'Chờ khách xác nhận', 'Waiting for customer')}
          onPress={navigateNext}
          primary
          testID="worker-v5-completion-submitted-next-action"
        />
      </View>
    </View>
  )
}
export function WorkerJobsLegacyPrototypeStageTenBody({
  language,
  navigateToEarnings,
  navigateToRanking,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToEarnings: () => void
  navigateToRanking: () => void
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const paymentRecorded = isDealPaymentProtected(deal)
  const ledgerCredit = deal && paymentRecorded
    ? runtime.workerEarnings?.recent_transactions.find((entry) => entry.job_id === deal.id && entry.payment_state === 'available')
    : null
  const workerNet = typeof ledgerCredit?.worker_net === 'number' && ledgerCredit.worker_net > 0 ? ledgerCredit.worker_net : null
  const directPaymentRecorded = paymentRecorded && deal?.payment?.provider === 'direct_worker'
  const rating = runtime.workerPerformanceInsights?.average_rating ?? runtime.workerProfile?.rating ?? null
  const hasRating = typeof rating === 'number' && rating > 0
  const rankingDelta = runtime.workerPerformanceInsights?.performance_score ?? null
  const heroTitle = workerNet
    ? textByLanguage(language, 'Đã ghi nhận thu nhập', 'Earnings recorded')
    : directPaymentRecorded
      ? textByLanguage(language, 'Đã ghi nhận thanh toán', 'Payment recorded')
      : deal
        ? textByLanguage(language, 'Đã hoàn tất công việc', 'Job completed')
        : textByLanguage(language, 'Chưa có công việc hoàn tất', 'No completed job')
  const heroMeta = workerNet
    ? textByLanguage(language, 'Khoản thu nhập đã sẵn sàng.', 'Your earnings are ready.')
    : directPaymentRecorded
      ? textByLanguage(language, 'Thanh toán trực tiếp đã được ghi nhận.', 'Direct payment was recorded.')
      : deal
        ? textByLanguage(language, 'Đang chờ dữ liệu thanh toán.', 'Payment data is still pending.')
        : textByLanguage(language, 'Chỉ hiện khi công việc hoàn tất.', 'Shown when a job is completed.')
  const rows: WorkerV5OfferDetailRow[] = [
    {
      icon: 'earnings',
      title: textByLanguage(language, 'Thu nhập', 'Earnings'),
      meta: workerNet ? textByLanguage(language, 'Đã ghi vào sổ thu nhập', 'Added to your earnings ledger') : textByLanguage(language, 'Chưa có số liệu khả dụng', 'No available amount yet'),
      status: workerNet ? formatVnd(workerNet, language) : directPaymentRecorded ? textByLanguage(language, 'Đã nhận trực tiếp', 'Received directly') : textByLanguage(language, 'Đang cập nhật', 'Updating'),
    },
    {
      icon: 'profile',
      title: textByLanguage(language, 'Đánh giá', 'Rating'),
      meta: textByLanguage(language, 'Phản hồi từ khách', 'Customer feedback'),
      status: hasRating ? `${rating.toFixed(rating % 1 === 0 ? 0 : 1)} ★` : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      icon: 'earnings',
      title: textByLanguage(language, 'Điểm hạng', 'Ranking points'),
      meta: textByLanguage(language, 'Cập nhật theo hiệu suất', 'Updated from performance'),
      status: rankingDelta && rankingDelta > 0 ? `+${Math.round(rankingDelta)}` : textByLanguage(language, 'Chưa có', 'None'),
    },
  ]

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-ten-prototype">
      <View style={[prototypeStyles.stageClosedHero, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-ten-hero">
        <View style={prototypeStyles.stageClosedCopy}>
          <Text style={prototypeStyles.stageClosedKicker}>{textByLanguage(language, 'Công việc đã hoàn tất', 'Job completed')}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageClosedTitle}>{heroTitle}</Text>
          <Text numberOfLines={2} style={prototypeStyles.stageClosedMeta}>{heroMeta}</Text>
        </View>
        <View style={prototypeStyles.stageClosedStatus}>
          <Image
            accessibilityIgnoresInvertColors
            accessible={false}
            contentFit="contain"
            source={workerJobsLegacyPrototypeStageTenWorkart}
            style={prototypeStyles.stageClosedStatusArtwork}
            testID="worker-v5-stage-ten-status-workart"
          />
        </View>
      </View>

      <View style={[prototypeStyles.offerInfoCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-ten-summary-card">
        <WorkerJobsLegacyPrototypeOfferInfoGroup
          rows={rows}
          testID="worker-v5-stage-ten-summary-list"
          title={textByLanguage(language, 'Tóm tắt', 'Summary')}
        />
      </View>

      <View style={prototypeStyles.stageActionRow}>
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Xem điểm hạng', 'View ranking')}
          onPress={navigateToRanking}
          testID="worker-v5-case-closed-ranking-action"
        />
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Mở thu nhập', 'Open earnings')}
          onPress={navigateToEarnings}
          primary
          testID="worker-v5-case-closed-earnings-action"
        />
      </View>
    </View>
  )
}

export function WorkerJobsLegacyPrototypePaymentConfirmedBody(props: WorkerStageElevenRuntimeProps) {
  return <WorkerStageElevenRuntime {...props} />
}
