import { Fragment, type ComponentType } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import Svg, { Defs, RadialGradient, Rect } from 'react-native-svg'

import { KaelButton } from '@/components/ui/kael-primitives'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'
import { useAppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, CaseWorkCardAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets, isKaelCoreV9Visual, type CustomerV21Visual } from './assets'
import { customerV21AgenticStyles as styles } from './agentic-styles'
import { customerV21CommonCopy } from './copy'
import { CaseWorkSourceChip } from './history-active-surfaces'
import { PaymentLedgerStep } from './payment-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, EyebrowPill, InactiveAgenticGate, MatchingHandoffChip, ProgressRail, SectionActionHeader, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'

type CustomerV21SourceSkin = ComponentType<{ testID?: string }>
type CustomerV21WideAura = ComponentType<{ intensity?: 'default' | 'strong'; scope: string; testID?: string }>
type CustomerV21ZipAura = ComponentType<{ scope: string; testID?: string }>
type CustomerV21AssetTile = ComponentType<{
  image: CustomerV21Visual
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type AgenticApprovalModel = {
  approveLabel: string
  confidence: string
  costChange: string
  id: string
  reason: string
  requestedDescription: string
}

type AgenticProcessedApprovalModel = {
  available: boolean
  body: string
  image: CustomerV21Visual
  status: string
  title: string
}

type AgenticWorkLogRowModel = {
  body: string
  image: CustomerV21Visual
  status: string
  title: string
  tone: 'selected' | 'success' | 'unselected'
}

type AgenticCommandTimelineRowModel = {
  active: boolean
  body: string
  title: string
}

type AgenticUtilityCardModel = {
  image: CustomerV21Visual
  label: string
  onPress?: () => void
  testID: string
  value: string
}

function agenticScope(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '')
}

export function AgenticHomeBackdropAura({ reduceTransparency }: { reduceTransparency: boolean }) {
  if (reduceTransparency) return null

  return (
    <View pointerEvents="none" style={styles.agenticHomeBackdropAura} testID="customer-v21-agentic-home-background-aura">
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 760" width="100%">
        <Defs>
          <RadialGradient id="agenticHomeTopAura" cx="88%" cy="6%" r="62%">
            <Stop offset="0" stopColor="rgba(99,235,216,0.30)" />
            <Stop offset="0.50" stopColor="rgba(169,247,235,0.13)" />
            <Stop offset="0.82" stopColor="rgba(169,247,235,0)" />
          </RadialGradient>
          <RadialGradient id="agenticHomeLeftAura" cx="-8%" cy="42%" r="68%">
            <Stop offset="0" stopColor="rgba(126,238,223,0.21)" />
            <Stop offset="0.66" stopColor="rgba(126,238,223,0)" />
          </RadialGradient>
          <RadialGradient id="agenticHomeBottomAura" cx="72%" cy="100%" r="62%">
            <Stop offset="0" stopColor="rgba(80,221,206,0.18)" />
            <Stop offset="0.72" stopColor="rgba(80,221,206,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill="url(#agenticHomeTopAura)" height="760" width="390" />
        <Rect fill="url(#agenticHomeLeftAura)" height="760" width="390" />
        <Rect fill="url(#agenticHomeBottomAura)" height="760" width="390" />
      </Svg>
    </View>
  )
}

export function AgenticStageBackdropAura({
  reduceTransparency,
  scope,
}: {
  reduceTransparency: boolean
  scope: string
}) {
  if (reduceTransparency) return null

  const topId = `agenticStageTop${scope}`
  const leftId = `agenticStageLeft${scope}`
  const lowerId = `agenticStageLower${scope}`
  return (
    <View pointerEvents="none" style={styles.agenticStageBackdropAura} testID={`customer-v21-agentic-${scope.toLowerCase()}-background-aura`}>
      <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 390 760" width="100%">
        <Defs>
          <RadialGradient id={topId} cx="90%" cy="0%" r="64%">
            <Stop offset="0" stopColor="rgba(92,232,213,0.27)" />
            <Stop offset="0.50" stopColor="rgba(171,248,236,0.13)" />
            <Stop offset="0.82" stopColor="rgba(171,248,236,0)" />
          </RadialGradient>
          <RadialGradient id={leftId} cx="-4%" cy="36%" r="68%">
            <Stop offset="0" stopColor="rgba(118,237,222,0.18)" />
            <Stop offset="0.70" stopColor="rgba(118,237,222,0)" />
          </RadialGradient>
          <RadialGradient id={lowerId} cx="72%" cy="96%" r="64%">
            <Stop offset="0" stopColor="rgba(71,216,202,0.18)" />
            <Stop offset="0.74" stopColor="rgba(71,216,202,0)" />
          </RadialGradient>
        </Defs>
        <Rect fill={`url(#${topId})`} height="760" width="390" />
        <Rect fill={`url(#${leftId})`} height="760" width="390" />
        <Rect fill={`url(#${lowerId})`} height="760" width="390" />
      </Svg>
    </View>
  )
}

export function AgenticStageHero({
  assetTile: AssetTile,
  body,
  compact = false,
  image,
  imageKind = 'tile',
  narrow = false,
  pill,
  scope,
  testID,
  title,
  tokens,
}: {
  assetTile: CustomerV21AssetTile
  body: string
  compact?: boolean
  image: CustomerV21Visual
  imageKind?: 'mascot' | 'tile'
  narrow?: boolean
  pill?: string
  scope: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <V21Card glass style={[styles.agenticStageHeroCard, compact ? styles.agenticStageHeroCardCompact : null, narrow ? styles.agenticStageHeroCardNarrow : null]} testID={testID}>
      <SourceCardSkin />
      <CaseWideMintAura scope={`${scope}Wide`} testID={`${testID}-wide-mint-aura`} />
      <ZipMintAura scope={scope} testID={`${testID}-mint-aura`} />
      {imageKind === 'mascot' ? (
        <View style={[styles.agenticHeroMascotWrap, compact ? styles.agenticHeroMascotWrapCompact : null]}>
          {isKaelCoreV9Visual(image) ? <KaelCoreV9 size={compact ? 96 : 132} /> : <Image resizeMode="contain" source={image} style={[styles.agenticHeroMascot, compact ? styles.agenticHeroMascotCompact : null]} />}
        </View>
      ) : (
        <AssetTile image={image} label={title} size={compact ? 50 : 58} sourceAura style={[styles.agenticHeroIcon, compact ? styles.agenticHeroIconCompact : null]} />
      )}
      <View style={[styles.flex, compact ? styles.agenticStageHeroCopyCompact : null]}>
        {pill ? <EyebrowPill label={pill} preserveCase style={styles.agenticHeroPill} tokens={tokens} /> : null}
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={compact ? 2 : 3} style={[styles.agenticStageHeroTitle, compact ? styles.agenticStageHeroTitleCompact : null, narrow ? styles.agenticStageHeroTitleNarrow : null, { color: tokens.text }]}>{title}</Text>
        {body ? (
          <Text numberOfLines={compact ? 2 : 3} style={[styles.agenticStageHeroBody, compact ? styles.agenticStageHeroBodyCompact : null, narrow ? styles.agenticStageHeroBodyNarrow : null, { color: tokens.muted }]}>{body}</Text>
        ) : null}
      </View>
    </V21Card>
  )
}

export function AgenticArtifactTile({
  caseWideMintAura: CaseWideMintAura,
  label,
  sourceCardSkin: SourceCardSkin,
  tokens,
  value,
  zipMintAura: ZipMintAura,
}: {
  caseWideMintAura: CustomerV21WideAura
  label: string
  sourceCardSkin: CustomerV21SourceSkin
  tokens: CustomerThemeTokens
  value: string
  zipMintAura: CustomerV21ZipAura
}) {
  const scope = label.replace(/[^a-zA-Z0-9]/g, '')
  return (
    <View style={[styles.agenticArtifactTile, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
      <SourceCardSkin />
      <CaseWideMintAura scope={`ArtifactWide${scope}`} />
      <ZipMintAura scope={`Artifact${scope}`} />
      <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.agenticArtifactValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

export function AgenticMetricTile({
  caseWideMintAura: CaseWideMintAura,
  label,
  sourceCardSkin: SourceCardSkin,
  testID,
  tokens,
  value,
  zipMintAura: ZipMintAura,
}: {
  caseWideMintAura: CustomerV21WideAura
  label: string
  sourceCardSkin: CustomerV21SourceSkin
  testID?: string
  tokens: CustomerThemeTokens
  value: string
  zipMintAura: CustomerV21ZipAura
}) {
  const scope = label.replace(/[^a-zA-Z0-9]/g, '')
  return (
    <View style={[styles.agenticMetricTile, { backgroundColor: tokens.raised, borderColor: 'rgba(255,255,255,0.90)' }]} testID={testID}>
      <SourceCardSkin />
      <CaseWideMintAura scope={`AgenticMetric${scope}`} />
      <ZipMintAura scope={`AgenticMetricZip${scope}`} />
      <Text adjustsFontSizeToFit minimumFontScale={0.74} numberOfLines={1} style={[styles.agenticMetricValue, { color: tokens.text }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.agenticMetricLabel, { color: tokens.muted }]}>{label}</Text>
    </View>
  )
}

export function AgenticUtilityCard({
  assetTile: AssetTile,
  image,
  label,
  onPress,
  testID,
  tokens,
  value,
}: {
  assetTile: CustomerV21AssetTile
  image: CustomerV21Visual
  label: string
  onPress?: () => void
  testID?: string
  tokens: CustomerThemeTokens
  value: string
}) {
  const content = (
    <>
      <CaseWideMintAura scope={`AgenticUtility${label.replace(/[^a-zA-Z0-9]/g, '')}`} />
      <AssetTile image={image} label={label} size={38} sourceAura style={styles.agenticUtilityIcon} />
      <View style={styles.flex}>
        <Text style={[styles.utilityCardTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.utilityBodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      {onPress ? <Text style={[styles.sectionActionText, { color: tokens.primary }]}>›</Text> : null}
    </>
  )
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={[styles.agenticUtilityCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>
        {content}
      </Pressable>
    )
  }
  return <View style={[styles.agenticUtilityCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID={testID}>{content}</View>
}

export function AgenticUtilityStackPanel({
  cards,
  sectionAction,
  sectionTitle,
}: {
  cards: AgenticUtilityCardModel[]
  sectionAction: string
  sectionTitle: string
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <>
      <SectionActionHeader action={sectionAction} title={sectionTitle} />
      <View style={styles.agenticUtilityGrid} testID="customer-v21-agentic-utility-stack">
        {cards.map((card) => (
          <AgenticUtilityCard
            assetTile={AssetTile}
            image={card.image}
            key={card.testID}
            label={card.label}
            onPress={card.onPress}
            testID={card.testID}
            tokens={tokens}
            value={card.value}
          />
        ))}
      </View>
    </>
  )
}

export function AgenticWorkLogRow({
  assetTile: AssetTile,
  body,
  image,
  status,
  title,
  tokens,
  tone,
}: {
  assetTile: CustomerV21AssetTile
  body: string
  image: CustomerV21Visual
  status: string
  title: string
  tokens: CustomerThemeTokens
  tone: 'selected' | 'success' | 'unselected'
}) {
  const chipTone = tone === 'unselected' ? 'selected' : tone
  return (
    <View style={styles.agenticWorkLogRow}>
      <AssetTile image={image} label={title} size={42} sourceAura style={styles.agenticUtilityIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.utilityCardTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.utilityBodyText, { color: tokens.muted }]}>{body}</Text>
      </View>
      <MatchingHandoffChip label={status} style={styles.agenticWorkLogStatusChip} tone={chipTone} />
    </View>
  )
}

export function AgenticWorkLogCardPanel({ rows }: { rows: AgenticWorkLogRowModel[] }) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card style={styles.agenticWorkLogCard} testID="customer-v21-agentic-work-log">
      <SourceCardSkin />
      <CaseWideMintAura scope="AgenticWorkLogWide" testID="customer-v21-agentic-work-log-wide-mint-aura" />
      <CaseWorkCardAura scope="AgenticWorkLog" testID="customer-v21-agentic-work-log-mint-aura" />
      {rows.map((row, index) => (
        <Fragment key={row.title}>
          {index > 0 ? <MemoryDivider /> : null}
          <AgenticWorkLogRow {...row} assetTile={AssetTile} tokens={tokens} />
        </Fragment>
      ))}
    </V21Card>
  )
}

export function AgenticCommandCaseCardPanel({
  activeStep,
  amount,
  detailLine,
  hasDeal,
  service,
  statusLabel,
  stepLabels,
}: {
  activeStep: number
  amount: string
  detailLine: string
  hasDeal: boolean
  service: string
  statusLabel: string
  stepLabels: string[]
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card glass style={styles.agenticCommandHeroCard} testID="customer-v21-agentic-command-case">
      <SourceCardSkin />
      <CaseWideMintAura scope="AgenticCommandCase" testID="customer-v21-agentic-command-case-wide-mint-aura" />
      <CaseWorkCardAura scope="AgenticCommandCaseSoft" testID="customer-v21-agentic-command-case-card-mint-aura" />
      <ZipMintAura scope="AgenticCommandCase" testID="customer-v21-agentic-command-case-mint-aura" />
      <View style={styles.agenticCommandTopRow}>
        <MatchingHandoffChip label={statusLabel} tone={hasDeal ? 'success' : 'selected'} />
        <View style={styles.agenticCommandMoney}>
          <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Tiền bảo vệ' : 'Protected money'}</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={[styles.agenticCommandAmount, { color: tokens.primary }]}>{amount}</Text>
        </View>
      </View>
      <Text adjustsFontSizeToFit minimumFontScale={0.74} numberOfLines={1} style={[styles.agenticCommandTitle, { color: tokens.text }]}>{service}</Text>
      <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{detailLine}</Text>
      <ProgressRail activeStep={activeStep} tokens={tokens} total={5} />
      <View style={styles.agenticCommandLabelRail}>
        {stepLabels.map((label, index) => (
          <Text key={label} numberOfLines={1} style={[styles.agenticCommandStepLabel, index + 1 === activeStep ? styles.agenticCommandStepLabelActive : null, { color: index + 1 === activeStep ? tokens.primary : tokens.muted }]}>
            {label}
          </Text>
        ))}
      </View>
    </V21Card>
  )
}

export function AgenticCommandTimelinePanel({ rows }: { rows: AgenticCommandTimelineRowModel[] }) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card style={styles.agenticTimelineCard} testID="customer-v21-agentic-command-timeline">
      <SourceCardSkin />
      <CaseWideMintAura scope="AgenticTimelineWide" testID="customer-v21-agentic-command-timeline-wide-mint-aura" />
      <CaseWorkCardAura scope="AgenticTimeline" testID="customer-v21-agentic-command-timeline-mint-aura" />
      {rows.map((row, index) => (
        <View key={row.title} style={styles.agenticTimelineRow}>
          <View style={styles.agenticTimelineRail}>
            <View style={[styles.agenticTimelineDot, row.active ? styles.agenticTimelineDotActive : null, { borderColor: row.active ? tokens.primary : tokens.border }]} />
            {index < rows.length - 1 ? <View style={[styles.agenticTimelineLine, { backgroundColor: tokens.border }]} /> : null}
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{row.title}</Text>
            <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{row.body}</Text>
          </View>
        </View>
      ))}
    </V21Card>
  )
}

export function AgenticProcessedApprovalRow({
  assetTile: AssetTile,
  available,
  body,
  image,
  status,
  title,
  tokens,
}: {
  assetTile: CustomerV21AssetTile
  available: boolean
  body: string
  image: CustomerV21Visual
  status: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={styles.agenticProcessedRow}>
      <AssetTile image={image} label={title} size={48} sourceAura style={styles.agenticUtilityIcon} />
      <View style={sharedStyles.flex}>
        <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{body}</Text>
      </View>
      <MatchingHandoffChip label={status} style={styles.agenticProcessedStatusChip} tone={available ? 'success' : 'selected'} />
    </View>
  )
}

export function AgenticApprovalQueuePanel({
  approvalSectionAction,
  approvalSectionTitle,
  heroBody,
  heroTitle,
  onApprove,
  onReject,
  pendingApproval,
  processedRows,
  processedSectionAction,
  processedSectionTitle,
  screenTitle,
}: {
  approvalSectionAction: string
  approvalSectionTitle: string
  heroBody: string
  heroTitle: string
  onApprove: (id: string) => void
  onReject: (id: string) => void
  pendingApproval: AgenticApprovalModel | null
  processedRows: AgenticProcessedApprovalModel[]
  processedSectionAction: string
  processedSectionTitle: string
  screenTitle: string
}) {
  const language = useAppLanguage()
  const { reduceTransparency, tokens } = useCustomerV21SurfaceTheme()

  if (!pendingApproval) {
    return <InactiveAgenticGate testID="customer-v21-agentic-approval-inactive" />
  }

  return (
    <View style={styles.agenticStageStack}>
      <AgenticStageBackdropAura reduceTransparency={reduceTransparency} scope="Approval" />
      <AgenticStageHero
        assetTile={AssetTile}
        body={heroBody}
        compact
        image={customerV21Assets.request}
        scope="AgenticApprovalHero"
        testID="customer-v21-agentic-approval-hero"
        tokens={tokens}
        title={heroTitle}
      />

      <SectionActionHeader action={approvalSectionAction} title={approvalSectionTitle} />
      <V21Card style={styles.agenticApprovalCard} testID="customer-v21-agentic-approval-queue">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticApprovalCardWide" testID="customer-v21-agentic-approval-card-wide-mint-aura" />
        <CaseWorkCardAura scope="AgenticApprovalCard" testID="customer-v21-agentic-approval-card-mint-aura" />
        <View style={styles.agenticApprovalHeader}>
          <AssetTile image={customerV21Assets.request} label={screenTitle} size={44} sourceAura style={styles.agenticApprovalIcon} />
          <View style={sharedStyles.flex}>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.agenticApprovalTitle, { color: tokens.text }]}>
              {pendingApproval.requestedDescription}
            </Text>
            <Text numberOfLines={1} style={[styles.agenticApprovalMeta, { color: tokens.muted }]}>{pendingApproval.reason}</Text>
          </View>
          <MatchingHandoffChip label={language === 'vi' ? 'Chờ bạn' : 'Waiting'} style={styles.agenticApprovalStatusChip} tone="selected" />
        </View>
        <MemoryDivider />
        <View style={styles.agenticApprovalFacts}>
          <View style={sharedStyles.flex}>
            <Text style={[styles.agenticApprovalFactLabel, { color: tokens.muted }]}>{language === 'vi' ? 'Thay đổi chi phí' : 'Cost change'}</Text>
            <Text style={[styles.agenticApprovalFactValue, { color: tokens.primary }]}>{pendingApproval.costChange}</Text>
          </View>
          <View style={sharedStyles.flex}>
            <Text style={[styles.agenticApprovalFactLabel, { color: tokens.muted }]}>{language === 'vi' ? 'Kael đánh giá' : 'Kael review'}</Text>
            <Text style={[styles.agenticApprovalFactValue, { color: tokens.text }]}>{pendingApproval.confidence}</Text>
          </View>
        </View>
        <Text numberOfLines={3} style={[styles.agenticApprovalReason, { color: tokens.muted }]}>{pendingApproval.reason}</Text>
        <View style={styles.agenticApprovalActions}>
          <KaelButton
            label={language === 'vi' ? 'Không duyệt' : 'Do not approve'}
            onPress={() => onReject(pendingApproval.id)}
            style={styles.agenticCommandButton}
            testID="customer-v21-agentic-reject-scope"
            variant="secondary"
          />
          <KaelButton
            label={pendingApproval.approveLabel}
            onPress={() => onApprove(pendingApproval.id)}
            style={styles.agenticCommandButton}
            testID="customer-v21-agentic-approve-scope"
          />
        </View>
      </V21Card>

      <SectionActionHeader action={processedSectionAction} title={processedSectionTitle} />
      <V21Card style={styles.agenticProcessedCard} testID="customer-v21-agentic-processed-approvals">
        <SourceCardSkin />
        <CaseWideMintAura scope="AgenticProcessedWide" testID="customer-v21-agentic-processed-wide-mint-aura" />
        <CaseWideMintAura scope="AgenticProcessed" testID="customer-v21-agentic-processed-mint-aura" />
        {processedRows.map((row, index) => (
          <Fragment key={row.title}>
            {index > 0 ? <MemoryDivider /> : null}
            <AgenticProcessedApprovalRow {...row} assetTile={AssetTile} tokens={tokens} />
          </Fragment>
        ))}
      </V21Card>
    </View>
  )
}

export function AgenticChatFact({ centered = false, label, value }: { centered?: boolean; label: string; value: string }) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <View style={[styles.agenticChatFact, centered && styles.agenticChatFactCentered, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
      <ZipMintAura scope={`ChatFact${agenticScope(label)}`} />
      <Text numberOfLines={1} style={[styles.agenticChatFactLabel, centered && sharedStyles.centerText, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.agenticChatFactValue, centered && sharedStyles.centerText, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

export function AgenticCasePaymentCardPanel({
  amount,
  caseCode,
  ledgerMethod,
  method,
  platformFee,
  protectedPayment,
  service,
  status,
  workerNet,
}: {
  amount: string
  caseCode: string
  ledgerMethod: string
  method: string
  platformFee: string
  protectedPayment: boolean
  service: string
  status: string
  workerNet: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-payment-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CasePaymentChat" testID="customer-v21-case-payment-card-mint-aura" />
      <ZipMintAura scope="CasePaymentChatFine" testID="customer-v21-case-payment-card-zip-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.payment} label={language === 'vi' ? 'Thanh toán' : 'Payment'} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael bảo vệ khoản thanh toán' : 'Kael protects the payment'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {`${service} · ${caseCode}`}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CasePaymentStatus" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Số tiền' : 'Amount'} value={amount} />
        <AgenticChatFact label={language === 'vi' ? 'Kênh' : 'Method'} value={method} />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'} value={platformFee} />
        <AgenticChatFact label={language === 'vi' ? 'Thợ nhận' : 'Worker net'} value={workerNet} />
      </View>

      <View style={[styles.agenticPaymentLedger, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-v21-case-payment-ledger">
        <PaymentLedgerStep
          body={ledgerMethod}
          state="done"
          tokens={tokens}
          title={language === 'vi' ? 'Lệnh thanh toán thật' : 'Real payment order'}
        />
        <PaymentLedgerStep
          body={protectedPayment ? (language === 'vi' ? 'Đang giữ an toàn trong hệ thống' : 'Held safely in the system') : status}
          state={protectedPayment ? 'active' : 'pending'}
          tokens={tokens}
          title={language === 'vi' ? 'Bảo vệ tiền' : 'Money protection'}
        />
        <PaymentLedgerStep
          body={language === 'vi' ? 'Chỉ mở sau khi công việc hoàn tất đúng quy trình' : 'Opens only after the job completes properly'}
          state="pending"
          tokens={tokens}
          title={language === 'vi' ? 'Giải ngân' : 'Payout'}
        />
      </View>

      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ theo dõi khoản tiền từ payment order thật. Không thanh toán ngoài nền tảng.'
          : 'Kael only tracks money from a real payment order. Do not pay off-platform.'}
      </Text>
    </V21Card>
  )
}

export function MemoryDivider() {
  const { tokens } = useCustomerV21SurfaceTheme()
  return <View style={[styles.memoryDivider, { backgroundColor: tokens.border }]} />
}

export function MemoryPermissionRow({
  control = 'toggle',
  enabled,
  image,
  label,
  onToggle,
  pending = false,
  preferenceKey,
  statusLabel,
  value,
}: {
  control?: 'toggle' | 'chip'
  enabled: boolean
  image: CustomerV21Visual
  label: string
  onToggle?: () => void
  pending?: boolean
  preferenceKey?: string
  statusLabel?: string
  value: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <View style={styles.memoryRow}>
      <AssetTile image={image} label={label} size={44} sourceAura style={styles.memoryIcon} />
      <View style={sharedStyles.flex}>
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      {control === 'chip' ? (
        <MatchingHandoffChip
          label={statusLabel ?? (enabled ? (language === 'vi' ? 'Bật' : 'On') : customerV21CommonCopy[language].dataPending)}
          style={styles.memoryStatusChip}
          tone={enabled ? 'success' : 'selected'}
        />
      ) : (
        <Pressable
          accessibilityLabel={enabled ? (language === 'vi' ? 'Đang bật' : 'On') : (language === 'vi' ? 'Chưa bật' : 'Off')}
          accessibilityRole="switch"
          accessibilityState={{ checked: enabled, disabled: pending || !onToggle, busy: pending }}
          disabled={pending || !onToggle}
          onPress={onToggle}
          style={[
            styles.memoryToggle,
            pending ? styles.memoryTogglePending : null,
            {
              backgroundColor: enabled ? tokens.primary : tokens.border,
            },
          ]}
          testID={preferenceKey ? `customer-v21-memory-toggle-${preferenceKey}` : undefined}
        >
          {pending ? (
            <ActivityIndicator color={enabled ? '#FFFFFF' : tokens.primary} size="small" />
          ) : (
            <View style={[styles.memoryToggleKnob, enabled ? styles.memoryToggleKnobOn : null]} />
          )}
        </Pressable>
      )}
    </View>
  )
}
