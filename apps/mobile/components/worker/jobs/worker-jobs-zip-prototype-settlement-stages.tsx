import { WorkerStageElevenRuntime, type WorkerStageElevenRuntimeProps } from './stage-eleven/stage-eleven-runtime'
import { Image } from 'expo-image'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { color } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'
import { formatVnd, textByLanguage } from '../ui/format'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import type { WorkerV5OfferDetailRow } from './offer'
import { StageNineEmptyStage } from './stage-nine/stage-nine-empty-stage'
import { isStageNineRecordEmpty, readStageNineRecordState } from './stage-nine/stage-nine-model'
import { stageNineTokens } from './stage-nine/stage-nine-tokens'
import { StageTenContent } from './stage-ten/stage-ten-content'
import { buildWorkerStageTenRuntime } from './stage-ten/stage-ten-runtime'
import {
  Text,
  WorkerJobsLegacyPrototypeStageActionButton,
  type WorkerJobsLegacyPrototypeRuntime,
  workerJobsLegacyPrototypeStageNineWorkart,
} from './worker-jobs-zip-prototype-shared'
import { prototypeStyles as prototypeStylesLight } from './worker-jobs-zip-prototype-styles'
import { WorkerJobsLegacyPrototypeOfferInfoGroup } from './worker-jobs-zip-prototype-early-stages'
import { useWorkerThemedStyles } from '../ui/worker-dark-styles'

export function WorkerJobsLegacyPrototypeStageNineBody({
  actionBusy,
  language,
  navigateNext,
  navigateToEvidence,
  prototypeMode,
  reduceMotion,
  reduceTransparency,
  runtime,
}: {
  actionBusy: boolean
  language: AppLanguage
  navigateNext: () => void
  navigateToEvidence: () => void
  prototypeMode: boolean
  reduceMotion: boolean
  reduceTransparency: boolean
  runtime: WorkerJobsLegacyPrototypeRuntime
}) {
  const prototypeStyles = useWorkerThemedStyles(prototypeStylesLight)
  const insets = useSafeAreaInsets()
  const record = readStageNineRecordState(runtime.state.deal)
  const { awaitingDirectPaymentConfirmation, customerConfirmed, hasSubmittedArtifact, paymentRecorded, sourceCount } = record
  const updateError = runtime.state.lastError ? (
    <WorkerV5BoundaryNote
      body={runtime.state.lastError}
      reduceTransparency={reduceTransparency}
      title={textByLanguage(language, 'Chưa cập nhật được', 'Could not update')}
    />
  ) : null

  if (isStageNineRecordEmpty(record)) {
    return (
      <StageNineEmptyStage
        bottomClearance={prototypeMode ? 0 : stageNineTokens.layout.dockClearance}
        footer={updateError}
        language={language}
        onSubmit={navigateToEvidence}
        reduceMotion={reduceMotion}
        topInset={prototypeMode ? 0 : insets.top}
      />
    )
  }

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

      {updateError}

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

export function WorkerJobsLegacyPrototypePaymentConfirmedBody(props: WorkerStageElevenRuntimeProps) {
  return <WorkerStageElevenRuntime {...props} />
}
