import type { ReactNode } from 'react'
import { Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import { useAppLanguage } from '@/lib/app-language'

import { CaseWideMintAura, CaseWorkCardAura, SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21AgenticStyles as styles } from './agentic-styles'
import { AgenticChatFact } from './agentic-surfaces'
import { customerV21CommonCopy } from './copy'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { CaseScopeStepRow, CustomerStatusPill } from './history-surfaces'
import { CaseWorkSourceChip } from './history-active-surfaces'
import { AssetTile, ProgressRail, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'

type AgenticCaseFactModel = {
  label: string
  value: string
}

type AgenticCaseScopeRowModel = {
  label: string
  state: 'active' | 'done' | 'pending'
  value: string
}

export function AgenticCasePriorityCardPanel({
  activeStep,
  caseWorkLabel,
  footerLabel,
  onOpenActivity,
  onOpenCaseChat,
  service,
  serviceAsset,
  statusLabel,
  subtitle,
}: {
  activeStep: number
  caseWorkLabel: string
  footerLabel: string
  onOpenActivity: () => void
  onOpenCaseChat: () => void
  service: string
  serviceAsset: ImageSourcePropType
  statusLabel: string
  subtitle: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <Pressable accessibilityRole="button" onPress={onOpenActivity} testID="customer-v21-agentic-active-case">
      <V21Card style={styles.agenticCasePriorityCard}>
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticPriorityWide" testID="customer-v21-agentic-active-case-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticPriority" testID="customer-v21-agentic-active-case-mint-aura" />
        <View style={styles.agenticCaseHeader}>
          <AssetTile image={serviceAsset} label={service} size={48} sourceAura style={styles.agenticCaseIcon} />
          <View style={sharedStyles.flex}>
            <Text numberOfLines={1} style={[styles.agenticCaseTitle, { color: tokens.text }]}>{service}</Text>
            <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{subtitle}</Text>
          </View>
          <CustomerStatusPill label={statusLabel} tokens={tokens} />
        </View>
        <ProgressRail activeStep={activeStep} tokens={tokens} total={4} />
        <Text numberOfLines={2} style={[styles.agenticCaseActionTitle, { color: tokens.text }]}>
          {language === 'vi' ? 'Kael đang kiểm tra tiến độ & bằng chứng' : 'Kael is checking progress and evidence'}
        </Text>
        <View style={styles.agenticCaseFooterRow}>
          <Text numberOfLines={1} style={[sharedStyles.bodyText, sharedStyles.flex, { color: tokens.muted }]}>
            {footerLabel}
          </Text>
          <Pressable accessibilityRole="button" onPress={onOpenCaseChat} testID="customer-v21-agentic-open-case-chat">
            <Text style={[sharedStyles.sectionActionText, { color: tokens.primary }]}>{caseWorkLabel}</Text>
          </Pressable>
          <Text style={[sharedStyles.sectionActionText, { color: tokens.primary }]}>›</Text>
        </View>
      </V21Card>
    </Pressable>
  )
}

export function AgenticCaseMatchingCardPanel({
  area,
  confidence,
  service,
  status,
  workerLabel,
}: {
  area: string
  confidence: string
  service: string
  status: string
  workerLabel: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-matching-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseMatchingChat" testID="customer-v21-case-matching-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.identity} label={workerLabel} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael đang ghép thợ phù hợp' : 'Kael is matching a worker'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerLabel}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CaseMatchingStatus" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Dịch vụ' : 'Service'} value={service} />
        <AgenticChatFact label={language === 'vi' ? 'Khu vực' : 'Area'} value={area} />
        <AgenticChatFact label={language === 'vi' ? 'Độ tin cậy' : 'Confidence'} value={confidence} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ hiện thợ, vị trí và thời gian đến khi hệ thống có dữ liệu thật.'
          : 'Kael only shows worker, location, and ETA when real system data is available.'}
      </Text>
    </V21Card>
  )
}

export function AgenticCaseEtaCardPanel({
  address,
  area,
  eta,
  status,
  workerName,
}: {
  address: string
  area: string
  eta: string
  status: string
  workerName: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-eta-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseEtaChat" testID="customer-v21-case-eta-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.map} label={language === 'vi' ? 'Thời gian đến' : 'Arrival time'} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael theo dõi thời gian đến' : 'Kael tracks arrival time'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerName}
          </Text>
        </View>
        <CaseWorkSourceChip label={eta} scope="CaseEtaValue" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Địa chỉ' : 'Address'} value={address} />
        <AgenticChatFact label={language === 'vi' ? 'Khu vực' : 'Area'} value={area} />
        <AgenticChatFact label={language === 'vi' ? 'Trạng thái' : 'Status'} value={status} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ cập nhật khi hệ thống có thời gian đến hoặc trạng thái di chuyển thật.'
          : 'Kael updates only when the system has real ETA or movement status.'}
      </Text>
    </V21Card>
  )
}

export function AgenticCaseAcceptedWorkerCardPanel({
  address,
  paymentProtection,
  scope,
  status,
  workerName,
}: {
  address: string
  paymentProtection: string
  scope: string
  status: string
  workerName: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-accepted-worker-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseAcceptedWorkerChat" testID="customer-v21-case-accepted-worker-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile
          image={customerV21Assets.activity}
          label={language === 'vi' ? 'Bảng công việc' : 'Work board'}
          size={44}
          sourceAura
          style={styles.agenticChatIcon}
        />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael đã mở bảng công việc' : 'Kael opened the work board'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {workerName}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CaseAcceptedWorkerStatus" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Phạm vi' : 'Scope'} value={scope} />
        <AgenticChatFact label={language === 'vi' ? 'Địa chỉ' : 'Address'} value={address} />
        <AgenticChatFact label={language === 'vi' ? 'Bảo vệ tiền' : 'Money protection'} value={paymentProtection} />
      </View>
      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael giữ bằng chứng, checklist và thay đổi phạm vi trong Case Work.'
          : 'Kael keeps evidence, checklist, and scope changes inside Case Work.'}
      </Text>
    </V21Card>
  )
}

export function AgenticCaseJobProgressCardPanel({
  evidenceLabel,
  note,
  progress,
  progressBar,
  riskLabel,
  started,
  status,
}: {
  evidenceLabel: string
  note: string
  progress: number
  progressBar: ReactNode
  riskLabel: string
  started: boolean
  status: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  const copy = customerV21CommonCopy[language]
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-job-progress-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseJobProgressChat" testID="customer-v21-case-job-progress-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile
          image={customerV21Assets.clock}
          label={language === 'vi' ? 'Tiến độ' : 'Progress'}
          size={44}
          sourceAura
          style={styles.agenticChatIcon}
        />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael đang theo dõi công việc' : 'Kael is tracking the work'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {note}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CaseJobProgressStatus" />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Tiến độ' : 'Progress'} value={started ? `${progress}%` : copy.dataPending} />
        <AgenticChatFact label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} value={evidenceLabel} />
        <AgenticChatFact label={language === 'vi' ? 'An toàn' : 'Safety'} value={riskLabel} />
      </View>
      {progressBar}
    </V21Card>
  )
}

export function AgenticCaseOptionsCardPanel({
  body,
  estimate,
  facts,
  onContinue,
  scopeRows,
  service,
  serviceAsset,
}: {
  body: string
  estimate: string
  facts: AgenticCaseFactModel[]
  onContinue: () => void
  scopeRows: AgenticCaseScopeRowModel[]
  service: string
  serviceAsset: ImageSourcePropType
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-options-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CaseOptionsChat" testID="customer-v21-case-options-card-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={serviceAsset} label={service} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael chốt phạm vi đề xuất' : 'Kael locks the suggested scope'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {body}
          </Text>
        </View>
        <CaseWorkSourceChip label={estimate} scope="CaseOptionsEstimate" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        {facts.map((fact) => (
          <AgenticChatFact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </View>

      <View style={historyActiveStyles.caseStepListContent} testID="customer-v21-case-options-scope-list">
        {scopeRows.map((row) => (
          <CaseScopeStepRow key={row.label} label={row.label} state={row.state} tokens={tokens} value={row.value} />
        ))}
      </View>

      <KaelButton
        label={language === 'vi' ? 'Tiếp tục' : 'Continue'}
        onPress={onContinue}
        size="small"
        style={styles.agenticChatActionButton}
        testID="customer-v21-case-options-continue"
      />
    </V21Card>
  )
}
