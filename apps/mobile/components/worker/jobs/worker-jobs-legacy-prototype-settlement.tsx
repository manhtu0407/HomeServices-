import { Image } from 'expo-image'
import { View } from 'react-native'
import { color } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { formatVnd, textByLanguage } from '../ui/format'
import { type WorkerV5OfferDetailRow } from './offer'
import type { WorkerJobsLegacyPrototypeRuntime } from './worker-jobs-legacy-prototype-contracts'
import { workerJobsLegacyPrototypeStageElevenWorkart, workerJobsLegacyPrototypeStageTenWorkart } from './worker-jobs-legacy-prototype-contracts'
import { Text } from './worker-jobs-legacy-prototype-shared'
import { WorkerJobsLegacyPrototypeOfferInfoGroup } from './worker-jobs-legacy-prototype-opportunity'
import { WorkerJobsLegacyPrototypeStageActionButton } from './worker-jobs-legacy-prototype-stages'
import { prototypeStyles } from './worker-jobs-legacy-prototype-styles'
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
  const ledgerCredit = deal
    ? runtime.workerEarnings?.recent_transactions.find((entry) => entry.job_id === deal.id && entry.payment_state === 'available')
    : null
  const workerNet = typeof ledgerCredit?.worker_net === 'number' && ledgerCredit.worker_net > 0 ? ledgerCredit.worker_net : null
  const directPaymentRecorded = deal?.payment?.provider === 'direct_worker' && deal.payment.status === 'direct_paid'
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
  const statusLabel = workerNet
    ? textByLanguage(language, 'Sẵn sàng', 'Ready')
    : directPaymentRecorded
      ? textByLanguage(language, 'Đã nhận', 'Received')
      : textByLanguage(language, 'Đang cập nhật', 'Updating')
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
          <Text style={prototypeStyles.stageClosedStatusText}>{statusLabel}</Text>
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

export function WorkerJobsLegacyPrototypePaymentConfirmedBody({
  language,
  navigateToEarnings,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  navigateToEarnings: () => void
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const deal = runtime.state.deal
  const ledgerCredit = deal
    ? runtime.workerEarnings?.recent_transactions.find((entry) => entry.job_id === deal.id && entry.payment_state === 'available')
    : null
  const workerNet = typeof ledgerCredit?.worker_net === 'number' && ledgerCredit.worker_net > 0 ? ledgerCredit.worker_net : null
  const paymentProvider = deal?.payment?.provider ?? deal?.paymentRailProvider
  const paymentMethod = paymentProvider === 'direct_worker' || paymentProvider === 'cash'
    ? textByLanguage(language, 'Tiền mặt', 'Cash')
    : paymentProvider === 'bank_transfer' || paymentProvider === 'platform_bank_manual' || paymentProvider === 'sepay_vietqr'
      ? textByLanguage(language, 'Chuyển khoản', 'Bank transfer')
      : textByLanguage(language, 'Đang cập nhật', 'Updating')
  const paymentRecorded = Boolean(
    workerNet
      || deal?.status === 'paid'
      || deal?.status === 'reviewed'
      || deal?.backendStatus === 'paid'
      || deal?.backendStatus === 'reviewed'
      || deal?.payment?.status === 'direct_paid',
  )
  const amountLabel = workerNet ? formatVnd(workerNet, language) : textByLanguage(language, 'Đang cập nhật', 'Updating')
  const rows: WorkerV5OfferDetailRow[] = [
    {
      icon: 'earnings',
      title: textByLanguage(language, 'Khoản nhận', 'Amount received'),
      meta: textByLanguage(language, 'Từ công việc này', 'From this job'),
      status: amountLabel,
    },
    {
      icon: 'profile',
      title: textByLanguage(language, 'Phương thức', 'Payment method'),
      meta: textByLanguage(language, 'Khách đã xác nhận thanh toán', 'Customer confirmed payment'),
      status: paymentMethod,
    },
  ]

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-eleven-payment-confirmed">
      <View style={[prototypeStyles.offerSummaryCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-eleven-hero">
        <View style={prototypeStyles.offerSummaryCopy}>
          <Text style={prototypeStyles.stagePaymentKicker}>{textByLanguage(language, 'Thanh toán đã ghi nhận', 'Payment recorded')}</Text>
          <Text numberOfLines={1} style={prototypeStyles.offerSummaryTitle}>{paymentRecorded ? textByLanguage(language, 'Chúc mừng!', 'Congratulations!') : textByLanguage(language, 'Đang chờ thanh toán', 'Payment pending')}</Text>
          <Text numberOfLines={1} style={prototypeStyles.stagePaymentAmount} testID="worker-v5-stage-eleven-amount">{amountLabel}</Text>
          <Text numberOfLines={1} style={prototypeStyles.stagePaymentMeta}>{paymentMethod}</Text>
        </View>
        <Image
          accessibilityIgnoresInvertColors
          accessible={false}
          contentFit="contain"
          contentPosition="right center"
          source={workerJobsLegacyPrototypeStageElevenWorkart}
          style={prototypeStyles.offerSummaryArtwork}
          testID="worker-v5-stage-eleven-payment-workart"
        />
      </View>

      <View style={[prototypeStyles.offerInfoCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-eleven-payment-card">
        <WorkerJobsLegacyPrototypeOfferInfoGroup
          rows={rows}
          testID="worker-v5-stage-eleven-payment-list"
          title={textByLanguage(language, 'Chi tiết nhận tiền', 'Payment details')}
        />
      </View>

      <View style={prototypeStyles.stageActionRow}>
        <WorkerJobsLegacyPrototypeStageActionButton
          label={textByLanguage(language, 'Mở thu nhập', 'Open earnings')}
          onPress={navigateToEarnings}
          primary
          testID="worker-v5-stage-eleven-earnings-action"
        />
      </View>
    </View>
  )
}
