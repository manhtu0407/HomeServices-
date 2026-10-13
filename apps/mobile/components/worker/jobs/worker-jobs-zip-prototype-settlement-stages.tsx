import { WorkerStageElevenRuntime, type WorkerStageElevenRuntimeProps } from './stage-eleven/stage-eleven-runtime'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import type { AppLanguage } from '@/lib/app-language'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'
import { formatVnd, textByLanguage } from '../ui/format'
import { WorkerV5BoundaryNote } from '../ui/metrics-surfaces'
import { StageNineEmptyStage } from './stage-nine/stage-nine-empty-stage'
import { StageNineSubmittedStage, type StageNineSubmittedStep } from './stage-nine/stage-nine-submitted-stage'
import { isStageNineRecordEmpty, readStageNineRecordState } from './stage-nine/stage-nine-model'
import { stageNineTokens } from './stage-nine/stage-nine-tokens'
import { StageTenContent } from './stage-ten/stage-ten-content'
import { buildWorkerStageTenRuntime } from './stage-ten/stage-ten-runtime'
import {
  type WorkerJobsLegacyPrototypeRuntime,
} from './worker-jobs-zip-prototype-shared'

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
  const recordDone = sourceCount > 0
  const paymentDone = paymentRecorded && !awaitingDirectPaymentConfirmation
  const steps: StageNineSubmittedStep[] = [
    {
      title: textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion record'),
      meta: textByLanguage(language, 'Ảnh và ghi chú đã gửi', 'Photos and note submitted'),
      state: recordDone ? 'done' : 'pending',
      status: sourceCount > 0 ? textByLanguage(language, `${sourceCount} mục`, `${sourceCount} items`) : textByLanguage(language, 'Chưa có', 'None'),
    },
    {
      title: textByLanguage(language, 'Khách kiểm tra', 'Customer review'),
      meta: textByLanguage(language, 'Phản hồi từ khách', 'Customer response'),
      state: customerConfirmed ? 'done' : recordDone ? 'current' : 'pending',
      status: customerConfirmed ? textByLanguage(language, 'Đã xác nhận', 'Confirmed') : textByLanguage(language, 'Đang chờ', 'Waiting'),
    },
    {
      title: textByLanguage(language, 'Thanh toán', 'Payment'),
      meta: textByLanguage(language, 'Theo phương thức đã chọn', 'Selected payment method'),
      state: paymentDone ? 'done' : customerConfirmed || awaitingDirectPaymentConfirmation ? 'current' : 'pending',
      status: awaitingDirectPaymentConfirmation
        ? textByLanguage(language, 'Cần đối soát', 'Needs reconciliation')
        : paymentRecorded
          ? textByLanguage(language, 'Đã ghi nhận', 'Recorded')
          : textByLanguage(language, 'Đang chờ', 'Waiting'),
    },
  ]

  const nextLabel = awaitingDirectPaymentConfirmation
    ? textByLanguage(language, 'Chờ đối soát', 'Awaiting reconciliation')
    : paymentRecorded ? textByLanguage(language, 'Mở công việc đã hoàn tất', 'Open completed job')
      : customerConfirmed ? textByLanguage(language, 'Chờ xác minh thanh toán', 'Awaiting payment verification')
        : textByLanguage(language, 'Chờ khách xác nhận', 'Waiting for customer')

  return (
    <StageNineSubmittedStage
      actionLabels={{ next: nextLabel, view: textByLanguage(language, 'Xem hồ sơ', 'View record') }}
      heroMeta={heroMeta}
      heroTitle={heroTitle}
      nextDisabled={!paymentRecorded || actionBusy}
      note={(
        <>
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
        </>
      )}
      onNext={navigateNext}
      onView={navigateToEvidence}
      sectionTitle={textByLanguage(language, 'Trạng thái xử lý', 'Processing status')}
      statusLabel={statusLabel}
      statusTone={customerConfirmed ? 'done' : hasSubmittedArtifact ? 'waiting' : 'idle'}
      steps={steps}
    />
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
