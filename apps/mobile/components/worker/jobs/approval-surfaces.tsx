import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import {
  formatScopeEventTime,
  formatScopeWaitElapsed,
  formatVnd,
  textByLanguage,
} from '../ui/format'
import {
  scopeChangeApprovalAmountLabel,
  scopeChangeStatusLabel,
} from '../ui/labels'
import type { WorkerV5StatusTimelineBaseProps } from './timeline-surfaces'
import { styles } from './approval-styles'

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5StatusTimelineComponent = ComponentType<WorkerV5StatusTimelineBaseProps>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ApprovalWaitHero({
  caseWideAura: CaseWideAura,
  deal,
  language,
  reduceTransparency,
  scope,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CaseAuraComponent
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
  zipAura: WorkerV5CaseAuraComponent
}) {
  const price = scope ? scopeChangeApprovalAmountLabel(deal, scope, language) : textByLanguage(language, 'Chờ dữ liệu thật', 'Waiting for real data')
  const title = scope?.requestedDescription || textByLanguage(language, 'Không có đề xuất đang chờ', 'No proposal is waiting')
  const waitTime = formatScopeWaitElapsed(scope?.createdAt, language)
  return (
    <View style={[styles.approvalHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-approval-wait-hero">
      {!reduceTransparency ? (
        <>
          <CaseWideAura scope="ApprovalWaitHeroWide" style={styles.checkInHeroAura} testID="worker-v5-approval-wait-mint-aura" />
          <ZipAura scope="ApprovalWaitHeroFine" style={styles.checkInHeroZipAura} testID="worker-v5-approval-wait-zip-mint-aura" />
        </>
      ) : null}
      <View style={styles.approvalHeroCopy}>
        {scope ? <Text style={styles.approvalHeroPill} numberOfLines={1}>{scopeChangeStatusLabel(scope.status, language)}</Text> : null}
        <Text style={styles.approvalHeroAmount} numberOfLines={2} testID="worker-v5-approval-amount">{price}</Text>
        <Text style={styles.approvalHeroMeta} numberOfLines={2}>{title}</Text>
      </View>
      <View style={styles.approvalLens}>
        <Text style={styles.approvalLensValue} numberOfLines={2}>{waitTime}</Text>
        <Text style={styles.approvalLensLabel}>{scope ? textByLanguage(language, 'Đã chờ', 'waiting') : textByLanguage(language, 'khách duyệt', 'approval')}</Text>
      </View>
    </View>
  )
}

export function WorkerV5ApprovalTimeline({
  language,
  reduceTransparency,
  scope,
  statusTimeline: StatusTimeline,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  scope: LocalDeal['scopeChange']
  statusTimeline: WorkerV5StatusTimelineComponent
}) {
  const hasScope = Boolean(scope)
  const kaelDone = scope?.kaelProgress?.status === 'completed'
  const approved = scope?.status === 'approved_by_customer'
  const rejected = scope?.status === 'rejected_by_customer' || scope?.status === 'cancelled'
  const customerActive = hasScope && !approved && !rejected
  const sentTime = formatScopeEventTime(scope?.createdAt, language)
  const evidenceLabel = scope?.evidencePhotoUrls.length
    ? textByLanguage(language, `${scope.evidencePhotoUrls.length} ảnh và mô tả đã gửi`, `${scope.evidencePhotoUrls.length} photos and description sent`)
    : textByLanguage(language, 'Mô tả đã gửi', 'Description sent')
  const rows = [
    {
      meta: scope ? `${sentTime} · ${evidenceLabel}` : textByLanguage(language, 'Chưa có mốc gửi thật', 'No real sent timestamp'),
      state: hasScope ? 'done' as const : 'todo' as const,
      title: textByLanguage(language, 'Bạn gửi đề xuất', 'Proposal sent'),
    },
    {
      meta: kaelDone ? textByLanguage(language, `${formatScopeEventTime(scope?.kaelProgress?.updated_at, language)} · đã đối chiếu ràng buộc`, `${formatScopeEventTime(scope?.kaelProgress?.updated_at, language)} · constraints checked`) : textByLanguage(language, 'Chưa có kết quả kiểm tra', 'No review result yet'),
      state: kaelDone ? 'done' as const : hasScope ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Kael kiểm tra ràng buộc', 'Kael checks constraints'),
    },
    {
      meta: approved
        ? textByLanguage(language, 'Khách đã duyệt trên hệ thống', 'Customer approved in system')
        : rejected
          ? textByLanguage(language, 'Yêu cầu không còn chờ duyệt', 'Request is no longer pending')
          : textByLanguage(language, 'Chờ khách phê duyệt trong ứng dụng', 'Waiting for customer approval in the app'),
      state: approved || rejected ? 'done' as const : customerActive ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Khách phê duyệt', 'Customer reviews'),
    },
    {
      meta: approved ? textByLanguage(language, 'Có thể quay lại luồng hoàn tất', 'Can return to completion flow') : textByLanguage(language, 'Chỉ sau khi có quyết định', 'Only after the decision'),
      state: approved ? 'active' as const : 'todo' as const,
      title: textByLanguage(language, 'Tiếp tục công việc', 'Continue work'),
    },
  ]
  return <StatusTimeline formulaAura reduceTransparency={reduceTransparency} rows={rows} testID="worker-v5-approval-timeline" />
}

export function WorkerV5SettlementStrip({
  caseWideAura: CaseWideAura,
  deal,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CaseAuraComponent
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5CaseAuraComponent
}) {
  const payment = deal?.payment
  const recordedGross = positiveMoney(payment?.grossAmount)
  const recordedWorkerNet = positiveMoney(payment?.workerNet)
  const recordedPlatformFee = positiveMoney(payment?.platformFee)
  const hasRecordedSettlement = recordedGross !== null
    && recordedWorkerNet !== null
    && recordedPlatformFee !== null
  const gross = hasRecordedSettlement ? recordedGross : positiveMoney(deal?.finalPrice)
  const workerNet = hasRecordedSettlement
    ? recordedWorkerNet
    : positiveMoney(deal?.broadcast?.estimatedEarning)
  const platformFee = hasRecordedSettlement
    ? recordedPlatformFee
    : gross !== null && workerNet !== null && gross >= workerNet
      ? gross - workerNet
      : null
  const emptyAmount = textByLanguage(language, 'Chưa có dữ liệu', 'No data')
  const cells = [
    {
      label: hasRecordedSettlement
        ? textByLanguage(language, 'Khách thanh toán', 'Customer paid')
        : textByLanguage(language, 'Giá đã chốt', 'Final price'),
      value: gross !== null ? formatVnd(gross, language) : emptyAmount,
    },
    {
      label: hasRecordedSettlement
        ? textByLanguage(language, 'Bạn nhận', 'Worker net')
        : textByLanguage(language, 'Bạn dự kiến nhận', 'Estimated worker net'),
      value: workerNet !== null ? formatVnd(workerNet, language) : emptyAmount,
    },
    {
      label: hasRecordedSettlement
        ? textByLanguage(language, 'Phí nền tảng', 'Platform fee')
        : textByLanguage(language, 'Phí dự kiến', 'Estimated fee'),
      value: platformFee !== null ? formatVnd(platformFee, language) : emptyAmount,
    },
  ]
  const formula = gross !== null && workerNet !== null && platformFee !== null
    ? textByLanguage(
        language,
        `${hasRecordedSettlement ? 'Đã đối soát' : 'Dự kiến'}: ${formatVnd(gross, language)} - ${formatVnd(platformFee, language)} = ${formatVnd(workerNet, language)}.`,
        `${hasRecordedSettlement ? 'Reconciled' : 'Estimated'}: ${formatVnd(gross, language)} - ${formatVnd(platformFee, language)} = ${formatVnd(workerNet, language)}.`,
      )
    : textByLanguage(
        language,
        'Số tiền sẽ hiện khi giá và mức phí được hệ thống đồng bộ.',
        'Amounts appear after the price and fee are synced.',
      )
  return (
    <View style={styles.settlementGroup}>
      <View style={styles.settlementStrip} testID="worker-v5-settlement-strip">
        {cells.map((cell, index) => (
          <View key={cell.label} style={[styles.settlementCell, reduceTransparency && styles.opaqueCard]}>
            {!reduceTransparency ? (
              <>
                <CaseWideAura
                  scope={`CompletionSettlement${index}`}
                  style={styles.settlementCellMintAura}
                  testID={`worker-v5-settlement-cell-mint-aura-${index}`}
                />
                <ZipAura
                  scope={`CompletionSettlement${index}`}
                  style={styles.settlementCellZipMintAura}
                  testID={`worker-v5-settlement-cell-zip-mint-aura-${index}`}
                />
              </>
            ) : null}
            <Text style={styles.settlementValue} numberOfLines={1} testID={`worker-v5-settlement-value-${index}`}>{cell.value}</Text>
            <Text style={styles.settlementLabel} numberOfLines={2}>{cell.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.settlementFormula} testID="worker-v5-settlement-formula-note">{formula}</Text>
    </View>
  )
}

function positiveMoney(value: number | null | undefined) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}
