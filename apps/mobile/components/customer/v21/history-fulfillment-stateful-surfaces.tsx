import type { ComponentProps, ReactNode } from 'react'
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, CaseWorkActionButtonAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import {
  ArrivalCodeBox,
  CaseFulfillmentStep,
  CaseMapPreview,
  CaseStageMediaStrip,
  CaseSuccessEmblem,
  CaseTimelineItem,
  CaseWorkerAvatar,
  FulfillmentInfoRow,
} from './history-surfaces'
import { AssetTile, EyebrowPill, MatchingHandoffChip, SectionActionHeader, V21Card } from './shared-surfaces'

type HandoffTone = ComponentProps<typeof MatchingHandoffChip>['tone']

type FulfillmentRootStyles = {
  bodyText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  jobProgressHeroCard: StyleProp<ViewStyle>
  jobProgressRiskChip: StyleProp<ViewStyle>
  jobProgressRiskIcon: StyleProp<ViewStyle>
  jobProgressRiskRow: StyleProp<ViewStyle>
  jobProgressValue: StyleProp<TextStyle>
  liveAlertTime: StyleProp<TextStyle>
}

type CaseTimelineRowView = {
  body: string
  state: ComponentProps<typeof CaseTimelineItem>['state']
  title: string
}

export function CaseJobAcceptedStageView({
  activeNode,
  address,
  arrived,
  dataPendingLabel,
  kaelSourceNode,
  language,
  onOpenProgress,
  paymentReady,
  progressDisabled,
  progressLabel,
  reduceTransparency,
  scopeLabel,
  successDone,
  status,
  tokens,
  workerAvatarInitials,
  workerAvatarUri,
  workerIdentityDone,
  workerName,
}: {
  activeNode: ReactNode
  address: string
  arrived: boolean
  dataPendingLabel: string
  kaelSourceNode: ReactNode
  language: AppLanguage
  onOpenProgress: () => void
  paymentReady: boolean
  progressDisabled: boolean
  progressLabel: string
  reduceTransparency: boolean
  scopeLabel: string
  successDone: boolean
  status: string
  tokens: CustomerThemeTokens
  workerAvatarInitials: string
  workerAvatarUri: string | null
  workerIdentityDone: boolean
  workerName: string
}) {
  const languageIsVi = language === 'vi'

  return (
    <View testID="customer-v21-job-accepted-stage">
      <V21Card glass style={[historyActiveStyles.fulfillmentHeroCard, historyActiveStyles.fulfillmentHeroCentered]} testID="customer-v21-job-accepted-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobAcceptedHero" testID="customer-v21-job-accepted-hero-mint-aura" />
        <CaseSuccessEmblem done={successDone} reduceTransparency={reduceTransparency} tokens={tokens} />
        <Text style={[historyActiveStyles.caseOverviewTitle, historyActiveStyles.fulfillmentCenteredText, { color: tokens.text }]}>
          {languageIsVi ? 'Thông tin đơn đã được xác nhận' : 'Job confirmation'}
        </Text>
        <Text style={[sharedStyles.bodyText, historyActiveStyles.fulfillmentCenteredText, { color: tokens.muted }]}>
          {languageIsVi ? 'Đúng thợ · đúng lịch · đúng công việc.' : 'Right worker · right schedule · right job.'}
        </Text>
        <View style={historyActiveStyles.fulfillmentChipRow}>
          <MatchingHandoffChip label={status} testID="customer-v21-job-accepted-status-chip" tone="success" />
        </View>
      </V21Card>

      <SectionActionHeader action={languageIsVi ? 'Chi tiết' : 'Details'} title={languageIsVi ? 'Ba lớp xác minh' : 'Three verification layers'} />
      <V21Card style={historyActiveStyles.fulfillmentListCard} testID="customer-v21-job-accepted-verification">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobAcceptedVerification" testID="customer-v21-job-accepted-verification-mint-aura" />
        <ZipMintAura scope="JobAcceptedVerificationFine" testID="customer-v21-job-accepted-verification-zip-mint-aura" />
        <View style={historyActiveStyles.fulfillmentStepList}>
          <CaseFulfillmentStep
            body={workerName}
            state={workerIdentityDone ? 'done' : 'pending'}
            tokens={tokens}
            title={languageIsVi ? 'Hồ sơ thợ' : 'Worker identity'}
          />
          <CaseFulfillmentStep
            body={arrived ? (languageIsVi ? 'Đã xác nhận' : 'Confirmed') : dataPendingLabel}
            state={arrived ? 'done' : 'active'}
            tokens={tokens}
            title={languageIsVi ? 'Mã đến nơi' : 'Arrival code'}
          />
          <CaseFulfillmentStep
            body={paymentReady ? (languageIsVi ? 'Đã có lệnh' : 'Order ready') : dataPendingLabel}
            state={paymentReady ? 'done' : 'pending'}
            tokens={tokens}
            title={languageIsVi ? 'Thanh toán bảo vệ' : 'Protected payment'}
          />
        </View>
      </V21Card>

      <V21Card style={historyActiveStyles.fulfillmentListCard} testID="customer-v21-job-accepted-worker">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobAcceptedWorker" testID="customer-v21-job-accepted-worker-mint-aura" />
        <View style={historyActiveStyles.fulfillmentWorkerRow}>
          <CaseWorkerAvatar initials={workerAvatarInitials} tokens={tokens} uri={workerAvatarUri} />
          <View style={sharedStyles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{workerName}</Text>
            <Text numberOfLines={2} style={[sharedStyles.bodyText, { color: tokens.muted }]}>
              {arrived
                ? (languageIsVi ? `Đã đến ${address}` : `Arrived at ${address}`)
                : (languageIsVi ? 'Chờ xác minh đến nơi.' : 'Waiting for arrival verification.')}
            </Text>
          </View>
          <MatchingHandoffChip label={status} testID="customer-v21-job-accepted-worker-status-chip" tone="selected" />
        </View>
        <View style={[historyActiveStyles.fulfillmentDivider, { backgroundColor: tokens.border }]} />
        <View style={historyActiveStyles.fulfillmentScopeRow}>
          <Text numberOfLines={1} style={[historyActiveStyles.fulfillmentScopeLabel, { color: tokens.muted }]}>
            {languageIsVi ? 'Phạm vi hiện tại' : 'Current scope'}
          </Text>
          <Text numberOfLines={2} style={[historyActiveStyles.fulfillmentScopeValue, { color: tokens.text }]}>
            {scopeLabel}
          </Text>
        </View>
      </V21Card>

      <View style={historyActiveStyles.fulfillmentKaelCardWrap}>
        {kaelSourceNode}
      </View>

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="JobAcceptedProgress" />}
        disabled={progressDisabled}
        label={progressLabel}
        onPress={onOpenProgress}
        style={historyActiveStyles.casePrimaryStageButton}
        testID="customer-v21-job-accepted-progress-next"
      />
      {activeNode}
    </View>
  )
}

export function CaseLocationEtaStageView({
  activeNode,
  address,
  alertNextDisabled,
  alertNextLabel,
  callWorkerLabel,
  dataPendingLabel,
  eta,
  etaLabel,
  hasEta,
  kaelSourceNode,
  liveActionLabel,
  liveRouteTitle,
  mapStatus,
  messageWorkerDisabled,
  messageWorkerLabel,
  onCallWorker,
  onMessageWorker,
  onOpenLiveAlert,
  reduceTransparency,
  timelineRows,
  tokens,
  workerAvatarInitials,
  workerAvatarUri,
  workerName,
}: {
  activeNode: ReactNode
  address: string
  alertNextDisabled: boolean
  alertNextLabel: string
  callWorkerLabel: string
  dataPendingLabel: string
  eta: string
  etaLabel: string
  hasEta: boolean
  kaelSourceNode: ReactNode
  liveActionLabel: string
  liveRouteTitle: string
  mapStatus: string
  messageWorkerDisabled: boolean
  messageWorkerLabel: string
  onCallWorker: () => void
  onMessageWorker: () => void
  onOpenLiveAlert: () => void
  reduceTransparency: boolean
  timelineRows: CaseTimelineRowView[]
  tokens: CustomerThemeTokens
  workerAvatarInitials: string
  workerAvatarUri: string | null
  workerName: string
}) {
  return (
    <View testID="customer-v21-direct-screen-2.10-location-eta">
      <CaseMapPreview
        address={address}
        eta={eta}
        etaLabel={etaLabel}
        initials={workerAvatarInitials}
        reduceTransparency={reduceTransparency}
        status={mapStatus}
        tokens={tokens}
        uri={workerAvatarUri}
        workerName={workerName}
        zipMintAura={ZipMintAura}
      />

      <SectionActionHeader action={hasEta ? liveActionLabel : dataPendingLabel} title={liveRouteTitle} />
      <V21Card style={historyActiveStyles.caseTimelineCard} testID="customer-v21-location-timeline">
        <SourceCardSkin />
        <ZipMintAura scope="LocationTimeline" testID="customer-v21-location-timeline-mint-aura" />
        <View style={historyActiveStyles.caseTimelineContent}>
          <View pointerEvents="none" style={historyActiveStyles.caseTimelineRail} testID="customer-v21-location-timeline-rail" />
          {timelineRows.map((row) => (
            <CaseTimelineItem body={row.body} key={row.title} state={row.state} title={row.title} tokens={tokens} />
          ))}
        </View>
      </V21Card>

      <View style={historyActiveStyles.caseLocationActionRow}>
        <KaelButton
          disabled={messageWorkerDisabled}
          label={messageWorkerLabel}
          onPress={onMessageWorker}
          size="small"
          style={historyActiveStyles.caseLocationActionButton}
          testID="customer-v21-location-message-worker"
          variant="secondary"
        />
        <KaelButton
          disabled
          label={callWorkerLabel}
          onPress={onCallWorker}
          size="small"
          style={historyActiveStyles.caseLocationActionButton}
          testID="customer-v21-location-call-worker"
          variant="secondary"
        />
      </View>

      {kaelSourceNode}

      <KaelButton
        disabled={alertNextDisabled}
        label={alertNextLabel}
        onPress={onOpenLiveAlert}
        style={historyActiveStyles.casePrimaryStageButton}
        testID="customer-v21-location-alert-next"
      />

      {activeNode}
    </View>
  )
}

export function CaseLiveAlertStageView({
  accessActionLabel,
  addressSharedLabel,
  accessTitle,
  activeNode,
  addressBody,
  arrivalCodeLabel,
  canMessageWorker,
  dataPendingLabel,
  entryPointLabel,
  eta,
  hasEta,
  heroBody,
  heroPillLabel,
  kaelSourceNode,
  onMessageWorker,
  onReady,
  readyLabel,
  rootStyles,
  shieldBody,
  shieldTitle,
  status,
  tokens,
  workerMessageLabel,
  workerName,
}: {
  accessActionLabel: string
  addressSharedLabel: string | undefined
  accessTitle: string
  activeNode: ReactNode
  addressBody: string
  arrivalCodeLabel: string
  canMessageWorker: boolean
  dataPendingLabel: string
  entryPointLabel: string
  eta: string
  hasEta: boolean
  heroBody: string
  heroPillLabel: string
  kaelSourceNode: ReactNode
  onMessageWorker: () => void
  onReady: () => void
  readyLabel: string
  rootStyles: FulfillmentRootStyles
  shieldBody: string
  shieldTitle: string
  status: string
  tokens: CustomerThemeTokens
  workerMessageLabel: string
  workerName: string
}) {
  return (
    <View testID="customer-v21-live-alert-stage">
      <V21Card glass style={[historyActiveStyles.fulfillmentHeroCard, historyActiveStyles.fulfillmentHeroCentered]} testID="customer-v21-live-alert-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="LiveAlertHero" testID="customer-v21-live-alert-hero-mint-aura" />
        <EyebrowPill
          label={heroPillLabel}
          preserveCase
          style={historyActiveStyles.fulfillmentHeroPill}
          testID="customer-v21-live-alert-time-pill"
          tokens={tokens}
        />
        <Text style={[historyActiveStyles.fulfillmentCaption, { color: tokens.muted }]}>{workerName}</Text>
        <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={[rootStyles.liveAlertTime, { color: tokens.primary }]}>{eta}</Text>
        <Text style={[rootStyles.bodyText, historyActiveStyles.fulfillmentCenteredText, { color: tokens.muted }]}>
          {heroBody}
        </Text>
        <View style={historyActiveStyles.fulfillmentChipRow}>
          <MatchingHandoffChip label={hasEta ? eta : dataPendingLabel} testID="customer-v21-live-alert-eta-chip" tone={hasEta ? 'success' : 'selected'} />
          <MatchingHandoffChip label={status} testID="customer-v21-live-alert-status-chip" tone="selected" />
        </View>
      </V21Card>

      <SectionActionHeader action={accessActionLabel} title={accessTitle} />
      <V21Card style={historyActiveStyles.fulfillmentListCard} testID="customer-v21-live-alert-access">
        <SourceCardSkin />
        <CaseWideMintAura scope="LiveAlertAccess" testID="customer-v21-live-alert-access-mint-aura" />
        <FulfillmentInfoRow
          assetTile={AssetTile}
          body={addressBody}
          handoffChip={MatchingHandoffChip}
          image={customerV21Assets.home}
          rightLabel={addressSharedLabel}
          rightLabelTone="success"
          title={entryPointLabel}
          tokens={tokens}
        />
        <FulfillmentInfoRow
          assetTile={AssetTile}
          body={shieldBody}
          image={customerV21Assets.shield}
          title={shieldTitle}
          tokens={tokens}
        />
        <ArrivalCodeBox code={null} label={arrivalCodeLabel} tokens={tokens} />
      </V21Card>

      <View style={historyActiveStyles.fulfillmentKaelCardWrap}>
        {kaelSourceNode}
      </View>

      <View style={historyActiveStyles.caseLocationActionRow}>
        <KaelButton
          disabled={!canMessageWorker}
          label={workerMessageLabel}
          onPress={onMessageWorker}
          size="small"
          style={historyActiveStyles.caseLocationActionButton}
          testID="customer-v21-live-alert-message-worker"
          variant="secondary"
        />
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="LiveAlertReady" />}
          label={readyLabel}
          onPress={onReady}
          size="small"
          style={historyActiveStyles.caseLocationActionButton}
          testID="customer-v21-live-alert-ready"
        />
      </View>

      {activeNode}
    </View>
  )
}

export function CaseJobProgressStageView({
  activeNode,
  completionNode,
  dataPendingLabel,
  evidenceCount,
  evidenceLabel,
  language,
  onOpenKael,
  onOpenWork,
  openKaelLabel,
  openWorkLabel,
  progressBarNode,
  progressValue,
  riskBody,
  riskLabel,
  riskTone,
  rootStyles,
  started,
  status,
  stepNodes,
  tokens,
  workProgressTitle,
}: {
  activeNode: ReactNode
  completionNode: ReactNode
  dataPendingLabel: string
  evidenceCount: number
  evidenceLabel: string
  language: AppLanguage
  onOpenKael: () => void
  onOpenWork: () => void
  openKaelLabel: string
  openWorkLabel: string
  progressBarNode: ReactNode
  progressValue: string
  riskBody: string
  riskLabel: string
  riskTone: HandoffTone
  rootStyles: FulfillmentRootStyles
  started: boolean
  status: string
  stepNodes: ReactNode
  tokens: CustomerThemeTokens
  workProgressTitle: string
}) {
  const languageIsVi = language === 'vi'

  return (
    <View testID="customer-v21-job-progress-stage">
      <V21Card glass style={[historyActiveStyles.fulfillmentHeroCard, rootStyles.jobProgressHeroCard]} testID="customer-v21-job-progress-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressHero" testID="customer-v21-job-progress-hero-mint-aura" />
        <ZipMintAura scope="JobProgressHeroFine" testID="customer-v21-job-progress-hero-zip-mint-aura" />
        <View style={historyActiveStyles.fulfillmentProgressHeroRow}>
          <View style={rootStyles.flex}>
            <MatchingHandoffChip label={status} testID="customer-v21-job-progress-status-chip" tone="success" />
            <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={[rootStyles.jobProgressValue, { color: tokens.text }]}>
              {started ? progressValue : dataPendingLabel}
            </Text>
            <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>
              {started
                ? (languageIsVi ? 'Tiến độ lấy từ trạng thái công việc thật.' : 'Progress follows the real job state.')
                : (languageIsVi ? 'Chờ công việc thật bắt đầu.' : 'Waiting for real work to start.')}
            </Text>
          </View>
          <AssetTile image={customerV21Assets.clock} label={workProgressTitle} size={58} sourceAura style={historyActiveStyles.fulfillmentProgressIcon} testID="customer-v21-job-progress-clock-icon" />
        </View>
        {progressBarNode}
      </V21Card>

      <SectionActionHeader action={started ? (languageIsVi ? 'Trực tiếp' : 'Live') : dataPendingLabel} title={languageIsVi ? 'Tiến trình công việc' : 'Work progress'} />
      <V21Card style={historyActiveStyles.fulfillmentListCard} testID="customer-v21-job-progress-steps">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressSteps" testID="customer-v21-job-progress-steps-mint-aura" />
        <View style={historyActiveStyles.fulfillmentStepList}>
          {stepNodes}
        </View>
      </V21Card>

      <SectionActionHeader action={evidenceLabel} title={languageIsVi ? 'Bằng chứng hiện trường' : 'On-site evidence'} titleTestID="customer-v21-job-progress-evidence-title" />
      <V21Card style={historyActiveStyles.fulfillmentListCard} testID="customer-v21-job-progress-evidence">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressEvidence" testID="customer-v21-job-progress-evidence-mint-aura" />
        <CaseStageMediaStrip count={evidenceCount} dataPending={dataPendingLabel} tokens={tokens} />
      </V21Card>

      <V21Card style={historyActiveStyles.fulfillmentListCard} testID="customer-v21-job-progress-risk">
        <SourceCardSkin />
        <CaseWideMintAura scope="JobProgressRisk" testID="customer-v21-job-progress-risk-mint-aura" />
        <View style={rootStyles.jobProgressRiskRow}>
          <AssetTile image={customerV21Assets.shield} label={languageIsVi ? 'Rủi ro' : 'Risk'} size={44} sourceAura style={rootStyles.jobProgressRiskIcon} />
          <View style={rootStyles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{languageIsVi ? 'Rủi ro & phạm vi' : 'Risk and scope'}</Text>
            <Text numberOfLines={2} style={[rootStyles.bodyText, { color: tokens.muted }]}>
              {riskBody}
            </Text>
          </View>
          <MatchingHandoffChip label={riskLabel} style={rootStyles.jobProgressRiskChip} testID="customer-v21-job-progress-risk-chip" tone={riskTone} />
        </View>
      </V21Card>

      <View style={historyActiveStyles.caseLocationActionRow}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="JobProgressKael" />}
          label={openKaelLabel}
          onPress={onOpenKael}
          size="small"
          style={historyActiveStyles.caseLocationActionButton}
          testID="customer-v21-job-progress-open-kael"
          variant="secondary"
        />
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="JobProgressWork" />}
          label={openWorkLabel}
          onPress={onOpenWork}
          size="small"
          style={historyActiveStyles.caseLocationActionButton}
          testID="customer-v21-job-progress-open-case-work"
        />
      </View>

      {completionNode}
      {activeNode}
    </View>
  )
}
