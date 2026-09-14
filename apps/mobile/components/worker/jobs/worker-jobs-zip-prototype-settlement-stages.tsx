import { Image } from 'expo-image'
import { View } from 'react-native'

import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { isDealPaymentProtected } from '@/lib/frontend-workflow/payment-proof'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'
import { formatVnd, textByLanguage } from '../ui/format'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import type { WorkerV5OfferDetailRow } from './offer'
import { StageTenContent } from './stage-ten/stage-ten-content'
import { buildWorkerStageTenRuntime } from './stage-ten/stage-ten-runtime'
import {
  Text,
  WorkerJobsLegacyPrototypeStageActionButton,
  type WorkerJobsLegacyPrototypeRuntime,
  workerJobsLegacyPrototypeStageElevenWorkart,
  workerJobsLegacyPrototypeStageNineWorkart,
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
  const { model, photoRef } = buildWorkerStageTenRuntime(runtime, language)
  const [photoPreview] = useJobMediaPreviewUrls([photoRef])

  return (
    <StageTenContent
      actions={{
        onEarnings: navigateToEarnings,
        onRanking: navigateToRanking,
      }}
      language={language}
      model={model}
      photoSource={photoPreview ? { uri: photoPreview } : null}
      reduceTransparency={reduceTransparency}
    />
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
  const paymentRecorded = isDealPaymentProtected(deal)
  const ledgerCredit = deal && paymentRecorded
    ? runtime.workerEarnings?.recent_transactions.find((entry) => entry.job_id === deal.id && entry.payment_state === 'available')
    : null
  const workerNet = typeof ledgerCredit?.worker_net === 'number' && ledgerCredit.worker_net > 0 ? ledgerCredit.worker_net : null
  const paymentProvider = deal?.payment?.provider ?? deal?.paymentRailProvider
  const isBankTransfer = paymentProvider === 'bank_transfer' || paymentProvider === 'platform_bank_manual' || paymentProvider === 'sepay_vietqr'
  const bankAmount = paymentRecorded && isBankTransfer && typeof deal?.payment?.amountReceived === 'number' && deal.payment.amountReceived > 0
    ? deal.payment.amountReceived
    : null
  const paymentAmount = bankAmount ?? workerNet
  const paymentMethod = paymentProvider === 'direct_worker' || paymentProvider === 'cash'
    ? textByLanguage(language, 'Tiền mặt', 'Cash')
    : isBankTransfer
      ? textByLanguage(language, 'Chuyển khoản', 'Bank transfer')
      : textByLanguage(language, 'Đang cập nhật', 'Updating')
  const amountLabel = paymentAmount
    ? formatVnd(paymentAmount, language)
    : textByLanguage(language, 'Chưa có số tiền được ghi nhận', 'Amount not recorded yet')
  const rows: WorkerV5OfferDetailRow[] = [
    {
      icon: 'earnings',
      title: bankAmount ? textByLanguage(language, 'Số tiền chuyển khoản', 'Bank transfer amount') : textByLanguage(language, 'Thu nhập đã ghi sổ', 'Ledger earnings'),
      meta: paymentRecorded ? textByLanguage(language, 'Số liệu đã được xác minh cho công việc', 'Verified for this job') : textByLanguage(language, 'Chưa có bản ghi đã xác minh', 'No verified record yet'),
      status: amountLabel,
    },
    {
      icon: 'profile',
      title: textByLanguage(language, 'Phương thức', 'Payment method'),
      meta: paymentRecorded ? textByLanguage(language, 'Bản ghi thanh toán đã xác minh', 'Verified payment record') : textByLanguage(language, 'Chờ xác minh giao dịch', 'Awaiting transaction verification'),
      status: paymentMethod,
    },
  ]

  return (
    <View style={prototypeStyles.bodyStack} testID="worker-v5-stage-eleven-payment-confirmed">
      <View style={[prototypeStyles.offerSummaryCard, reduceTransparency && { backgroundColor: color.mint.white }]} testID="worker-v5-stage-eleven-hero">
        <View style={prototypeStyles.offerSummaryCopy}>
          <Text style={prototypeStyles.stagePaymentKicker}>{paymentRecorded ? textByLanguage(language, 'Thanh toán đã ghi nhận', 'Payment recorded') : textByLanguage(language, 'Trạng thái thanh toán', 'Payment status')}</Text>
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
