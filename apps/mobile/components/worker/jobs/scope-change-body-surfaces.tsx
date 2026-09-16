import { useMemo } from 'react'
import { View } from 'react-native'
import type { AppLanguage } from '@/lib/app-language'
import type { ScopeChangeWorkerQuote } from '@/lib/api-types'
import type { LocalScopeChange } from '@nestscout/shared'
import { WorkerV5CustomerCaseWideMintAura, WorkerV5CustomerZipMintAura } from '../ui/aura-surfaces'
import { formatVnd, textByLanguage } from '../ui/format'
import { WorkerV5PrimaryButtonFill, WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WorkerV5ScreenInfoRow } from '../ui/screen-atoms-surfaces'
import { WorkerV5ActionRail } from './advisory-surfaces'
import { WorkerV5EvidenceTray } from './evidence-surfaces'
import { WorkerV5ScopeEvidenceGate } from './scope-surfaces'
import { WorkerV5PriceLines } from './shared-surfaces'
import { WorkerV5ProgressRail } from './progress-surfaces'
import type { WorkerV5ScopeChangeActions } from './use-worker-scope-change-actions'

import { styles } from '../worker-v5-flow-styles'


function WorkerV5ScopePriceSummary({
  evidenceCount,
  language,
  price,
  reduceTransparency,
  scope,
  scopeQuote,
}: {
  evidenceCount: number
  language: AppLanguage
  price: string
  reduceTransparency: boolean
  scope: LocalScopeChange | null
  scopeQuote: ScopeChangeWorkerQuote | null
}) {
  const rows = scopeQuote ? [
    { label: textByLanguage(language, 'Tổng khách trả', 'Customer total'), value: formatVnd(scopeQuote.customer_total, language) },
    { label: textByLanguage(language, 'Phí nền tảng', 'Platform fee'), value: `${formatVnd(scopeQuote.platform_fee, language)} · ${scopeQuote.commission_rate_bps / 100}%` },
    { label: textByLanguage(language, 'Thu nhập thợ', 'Worker earnings'), value: formatVnd(scopeQuote.worker_net, language) },
    { label: textByLanguage(language, 'Khoảng tham chiếu', 'Reference band'), value: `${formatVnd(scopeQuote.reference_price_min, language)}–${formatVnd(scopeQuote.reference_price_max, language)}` },
  ] : [
    { label: textByLanguage(language, 'Hạng mục bổ sung', 'Additional scope'), value: scope?.requestedDescription || textByLanguage(language, 'Chưa có bản nháp thật', 'No real draft') },
    { label: textByLanguage(language, 'Lý do', 'Reason'), value: scope?.reason || textByLanguage(language, 'Chưa có lý do thật', 'No real reason') },
    { label: textByLanguage(language, 'Bằng chứng', 'Evidence'), value: evidenceCount ? `${evidenceCount}` : textByLanguage(language, 'Chưa có ảnh', 'No photos') },
  ]

  return (
    <WorkerV5PriceLines
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      formulaAura
      reduceTransparency={reduceTransparency}
      rows={rows}
      total={{
        label: scopeQuote
          ? textByLanguage(language, 'Giá Kael đề nghị', 'Kael proposed price')
          : textByLanguage(language, 'Khoảng giá', 'Price range'),
        value: scopeQuote ? formatVnd(scopeQuote.customer_total, language) : price,
      }}
      zipAura={WorkerV5CustomerZipMintAura}
    />
  )
}

function WorkerV5ScopeSummary({
  evidenceCount,
  evidenceUrls,
  language,
  price,
  reduceTransparency,
  scope,
  scopeQuote,
}: {
  evidenceCount: number
  evidenceUrls: string[]
  language: AppLanguage
  price: string
  reduceTransparency: boolean
  scope: LocalScopeChange | null
  scopeQuote: ScopeChangeWorkerQuote | null
}) {
  return (
    <>
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Kael hỗ trợ soạn', 'Kael drafts')}
        title={textByLanguage(language, 'Đề xuất thay đổi', 'Change proposal')}
      />
      <WorkerV5ScopePriceSummary
        evidenceCount={evidenceCount}
        language={language}
        price={price}
        reduceTransparency={reduceTransparency}
        scope={scope}
        scopeQuote={scopeQuote}
      />
      <WorkerV5EvidenceTray
        emptyLabel={textByLanguage(language, 'Chưa có', 'None')}
        language={language}
        reduceTransparency={reduceTransparency}
        stageLabel={textByLanguage(language, 'Bằng chứng đổi phạm vi', 'Scope-change evidence')}
        urls={evidenceUrls}
      />
    </>
  )
}

function WorkerV5ScopeActionRail({
  canDraftScopeEvidence,
  hasScopeSubmission,
  incidentStatus,
  language,
  navigateNext,
  onOpenScopeEditPath,
  onPreviewScopeProposal,
  onRejectScopeQuote,
  onSubmitScopeProposal,
  onViewScopeDetails,
  reduceTransparency,
  scopeQuote,
  scopeQuoting,
}: {
  canDraftScopeEvidence: boolean
  hasScopeSubmission: boolean
  incidentStatus: string | null
  language: AppLanguage
  navigateNext: () => void
  onOpenScopeEditPath: () => void
  onPreviewScopeProposal: () => void
  onRejectScopeQuote: () => void
  onSubmitScopeProposal: () => void
  onViewScopeDetails: () => void
  reduceTransparency: boolean
  scopeQuote: ScopeChangeWorkerQuote | null
  scopeQuoting: boolean
}) {
  const proposalReady = incidentStatus === 'ready_for_scope_proposal'
  const proposalSubmitted = incidentStatus === 'scope_proposed'
  return (
    <WorkerV5ActionRail
      caseWideAura={WorkerV5CustomerCaseWideMintAura}
      primaryButtonFill={WorkerV5PrimaryButtonFill}
      zipAura={WorkerV5CustomerZipMintAura}
      onPrimary={proposalSubmitted
        ? onViewScopeDetails
        : proposalReady
        ? scopeQuote ? onSubmitScopeProposal : onPreviewScopeProposal
        : hasScopeSubmission ? onViewScopeDetails : navigateNext}
      onSecondary={proposalSubmitted
        ? undefined
        : scopeQuote ? onRejectScopeQuote : canDraftScopeEvidence ? onOpenScopeEditPath : undefined}
      primary={proposalSubmitted
        ? textByLanguage(language, 'Đang chờ khách xác nhận', 'Waiting for Customer approval')
        : proposalReady
        ? scopeQuote
          ? textByLanguage(language, 'Xác nhận giá và gửi khách', 'Confirm price and send')
          : scopeQuoting
            ? textByLanguage(language, 'Kael đang tính...', 'Kael is calculating...')
            : textByLanguage(language, 'Kael tính giá cân bằng', 'Calculate balanced price')
        : hasScopeSubmission
          ? textByLanguage(language, 'Mở Kael Công việc', 'Open Kael Work')
          : textByLanguage(language, 'Không có vấn đề phát sinh', 'No scope issue')}
      primaryTestID="worker-v5-scope-change-send-action"
      primaryVariant="source"
      reduceTransparency={reduceTransparency}
      secondary={proposalSubmitted
        ? textByLanguage(language, 'Báo cáo đã khóa', 'Report locked')
        : scopeQuote
        ? textByLanguage(language, 'Không đồng ý mức này', 'Decline this quote')
        : textByLanguage(language, 'Chỉnh sửa', 'Edit')}
      secondaryTestID="worker-v5-scope-change-edit-action"
    />
  )
}

export function WorkerV5ScopeChangeBody({
  language,
  navigateNext,
  reduceTransparency,
  scopeChange,
}: {
  language: AppLanguage
  navigateNext: () => void
  reduceTransparency: boolean
  /** Shared with the Stage 6 Timeline Card so photos picked there reach this form's evidence upload. */
  scopeChange: WorkerV5ScopeChangeActions
}) {
  const primaryButtonFill = useMemo(
    () => !scopeChange.scopeSubmitDisabled ? <WorkerV5PrimaryButtonFill disabled={false} variant="source" /> : null,
    [scopeChange.scopeSubmitDisabled],
  )

  return (
    <View style={styles.sectionStack}>
      <WorkerV5ProgressRail activeStep={4} language={language} reduceTransparency={reduceTransparency} />
      <WorkerV5ScopeSummary
        evidenceCount={scopeChange.evidenceCount}
        evidenceUrls={scopeChange.scopeEvidenceUrls}
        language={language}
        price={scopeChange.price}
        reduceTransparency={reduceTransparency}
        scope={scopeChange.scope}
        scopeQuote={scopeChange.scopeQuote}
      />
      <WorkerV5ScopeEvidenceGate
        deal={scopeChange.deal}
        language={language}
        onAddPhotos={scopeChange.onAddPhotos}
        onScopeDescriptionChange={scopeChange.onScopeDescriptionChange}
        onScopeReasonChange={scopeChange.onScopeReasonChange}
        onSubmitScopeEvidence={scopeChange.onSubmitScopeEvidence}
        onViewDetails={scopeChange.onViewScopeDetails}
        primaryButtonFill={primaryButtonFill}
        reduceTransparency={reduceTransparency}
        renderInfoRow={(row) => <WorkerV5ScreenInfoRow icon={row.icon} label={row.label} value={row.value} />}
        scope={scopeChange.scope}
        scopeDescription={scopeChange.scopeDescription}
        scopeEvidenceOpen={scopeChange.scopeEvidenceOpen}
        scopeEvidenceSent={scopeChange.scopeEvidenceSent && !scopeChange.jobIncident}
        scopeMediaNotice={scopeChange.scopeMediaNotice}
        scopePhotos={scopeChange.scopePhotos}
        scopeReason={scopeChange.scopeReason}
        scopeSubmitDisabled={scopeChange.scopeSubmitDisabled}
        scopeSubmitting={scopeChange.scopeSubmitting}
      />
      <WorkerV5ScopeActionRail
        canDraftScopeEvidence={scopeChange.canDraftScopeEvidence}
        hasScopeSubmission={scopeChange.hasScopeSubmission}
        incidentStatus={scopeChange.jobIncident?.status ?? null}
        language={language}
        navigateNext={navigateNext}
        onOpenScopeEditPath={scopeChange.onOpenScopeEditPath}
        onPreviewScopeProposal={scopeChange.onPreviewScopeProposal}
        onRejectScopeQuote={scopeChange.onRejectScopeQuote}
        onSubmitScopeProposal={scopeChange.onSubmitScopeProposal}
        onViewScopeDetails={scopeChange.onViewScopeDetails}
        reduceTransparency={reduceTransparency}
        scopeQuote={scopeChange.scopeQuote}
        scopeQuoting={scopeChange.scopeQuoting}
      />
    </View>
  )
}
