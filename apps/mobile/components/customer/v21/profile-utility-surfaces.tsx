import { Fragment, type ComponentType, type ReactNode } from 'react'
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native'

import { KaelChip } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useAppLanguage } from '@/lib/app-language'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
  type CustomerThemeTokens,
} from '../customer-theme'
import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets, customerV21ServiceAssets, type CustomerV21Visual } from './assets'
import { customerV21CommonCopy, customerV21ScreenTitles } from './copy'
import { MemoryDivider, MemoryPermissionRow } from './agentic-surfaces'
import { customerV21AgenticStyles as agenticStyles } from './agentic-styles'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { CaseOverviewScoreAura } from './history-surfaces'
import { ProfileCompactMintAura, ProfileLiquidScore, ProfileStatCard } from './profile-metrics-surfaces'
import { customerV21ProfileUtilityStyles as styles } from './profile-utility-styles'
import { AssetTile, EyebrowPill, SectionActionHeader, V21Card } from './shared-surfaces'

function useCustomerV21ProfileTheme() {
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(mode)
  return glass.reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
}

type CustomerV21UtilityAssetTile = ComponentType<{
  image: CustomerV21Visual
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type CustomerV21UtilityAura = ComponentType<{
  scope: string
  testID?: string
}>

type ProfilePanelMetric = {
  label: string
  value: string
}

type ProfileRankingNode = {
  active: boolean
  label: string
  value: number
}

type ProfileInsightModel = {
  image: CustomerV21Visual
  label: string
  status: string
  testID?: string
  value: string
}

function profileAuraScope(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '')
}

export function ProfileAuraCard({
  cardStyle,
  children,
  contentStyle,
  scope,
  testID,
}: {
  cardStyle?: StyleProp<ViewStyle>
  children: ReactNode
  contentStyle?: StyleProp<ViewStyle>
  scope: string
  testID?: string
}) {
  const tokens = useCustomerV21ProfileTheme()
  return (
    <V21Card
      style={[
        styles.profileAuraCard,
        {
          backgroundColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.72)',
          borderColor: tokens.mode === 'dark' ? tokens.border : 'rgba(255,255,255,0.92)',
        },
        tokens.mode === 'dark' ? styles.profileAuraCardShadowDark : styles.profileAuraCardShadowLight,
        cardStyle,
      ]}
      testID={testID}
    >
      <SourceCardSkin testID={`customer-v21-profile-${scope.toLowerCase()}-card-skin`} />
      <CaseWideMintAura scope={`Profile${scope}Wide`} testID={`customer-v21-profile-${scope.toLowerCase()}-wide-mint-aura`} />
      <ZipMintAura scope={`Profile${scope}Fine`} testID={`customer-v21-profile-${scope.toLowerCase()}-mint-aura`} />
      <View style={[styles.profileAuraContent, contentStyle]}>
        {children}
      </View>
    </V21Card>
  )
}

export function ProfileRankingEvaluation({
  assetTile: AssetTile,
  completed,
  kaelHeadImage,
  protectedTransactions,
  reviewRate,
}: {
  assetTile: CustomerV21UtilityAssetTile
  completed: string
  kaelHeadImage: CustomerV21Visual
  protectedTransactions: string
  reviewRate: string
}) {
  const language = useAppLanguage()
  const tokens = useCustomerV21ProfileTheme()
  const sourceLine = language === 'vi'
    ? 'Công việc, đánh giá, thanh toán.'
    : 'Jobs, reviews, payments.'
  const rows = [
    { label: language === 'vi' ? 'Hoàn tất' : 'Completed', value: completed },
    { label: language === 'vi' ? 'Đánh giá' : 'Reviews', value: reviewRate },
    { label: language === 'vi' ? 'Bảo vệ' : 'Protected', value: protectedTransactions },
  ]

  return (
    <ProfileAuraCard
      cardStyle={styles.profileRankingEvaluationCard}
      contentStyle={styles.profileRankingEvaluationContent}
      scope="RankingEvaluation"
      testID="customer-v21-profile-ranking-evaluation"
    >
      <AssetTile image={kaelHeadImage} label="Kael" size={42} sourceAura style={styles.infoNoticeIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>
          {language === 'vi' ? 'Kael đánh giá dữ liệu thật' : 'Kael reads real data'}
        </Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{sourceLine}</Text>
        <View style={styles.profileRankingEvaluationChips}>
          {rows.map((row) => (
            <View key={row.label} style={styles.profileRankingEvidenceChip}>
              <ZipMintAura scope={`ProfileRankingEvidence${profileAuraScope(row.label)}`} />
              <Text numberOfLines={1} style={[styles.profileRankingEvidenceLabel, { color: tokens.muted }]}>{row.label}</Text>
              <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.profileRankingEvidenceValue, { color: tokens.primary }]}>{row.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </ProfileAuraCard>
  )
}

export function ProfileInsightRow({
  assetTile: AssetTile,
  iconStyle,
  image,
  label,
  status,
  testID,
  value,
}: {
  assetTile: CustomerV21UtilityAssetTile
  iconStyle?: StyleProp<ViewStyle>
  image: CustomerV21Visual
  label: string
  status: string
  testID?: string
  value: string
}) {
  const tokens = useCustomerV21ProfileTheme()
  const emptyStatus = status === customerV21CommonCopy.vi.dataPending
    || status === customerV21CommonCopy.en.dataPending
    || status === '0'
    || /^0\s*\/\s*0$/.test(status)
  return (
    <View style={styles.profileInsightRow} testID={testID}>
      <AssetTile image={image} label={label} size={54} sourceAura style={iconStyle} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.profileInsightTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      <View style={styles.profileInsightChipFrame} testID={testID ? `${testID}-chip` : undefined}>
        <ZipMintAura scope={`ProfileInsight${profileAuraScope(label)}`} />
        <KaelChip
          label={status}
          style={emptyStatus ? styles.profileInsightEmptyChip : styles.profileInsightChip}
          textStyle={emptyStatus ? styles.profileInsightEmptyChipText : styles.profileMintChipText}
          variant={emptyStatus ? 'unselected' : 'selected'}
        />
      </View>
    </View>
  )
}

export function ProfileRankingPanel({
  completed,
  metrics,
  pointsText,
  progress,
  progressBar,
  protectedTransactions,
  rank,
  rankNodes,
  rankProcess,
  rankStatusLabel,
  rankTitle,
  reviewRate,
  rules,
  rulesAction,
  rulesTitle,
}: {
  completed: string
  metrics: ProfilePanelMetric[]
  pointsText: string
  progress: number
  progressBar: ReactNode
  protectedTransactions: string
  rank: number
  rankNodes: ProfileRankingNode[]
  rankProcess: ReactNode
  rankStatusLabel: string
  rankTitle: string
  reviewRate: string
  rules: ProfileInsightModel[]
  rulesAction: string
  rulesTitle: string
}) {
  const language = useAppLanguage()
  const glass = useGlassAccessibility()
  const tokens = useCustomerV21ProfileTheme()
  const activeRank = rank > 0

  return (
    <View testID="customer-v21-profile-ranking">
      <ProfileAuraCard cardStyle={styles.profileRankingHeroCard} contentStyle={styles.profileRankingHero} scope="RankingHero" testID="customer-v21-profile-ranking-hero">
        <ProfileLiquidScore
          caseOverviewScoreAura={CaseOverviewScoreAura}
          label={language === 'vi' ? 'Hạng hiện tại' : 'Current level'}
          percent={activeRank ? progress : 0}
          reduceTransparency={glass.reduceTransparency}
          scope="Ranking"
          tokens={tokens}
          value={String(rank)}
        />
        <View style={styles.flex}>
          <View style={styles.profileRankingStatusChipFrame} testID="customer-v21-profile-ranking-status-chip">
            <ZipMintAura scope="ProfileRankingStatusChip" />
            <KaelChip
              label={rankStatusLabel}
              style={activeRank ? styles.profileMintChip : styles.profileRankingEmptyChip}
              textStyle={activeRank ? styles.profileMintChipText : styles.profileRankingEmptyChipText}
              variant={activeRank ? 'selected' : 'unselected'}
            />
          </View>
          <Text style={[styles.profileDetailTitle, { color: tokens.text }]}>{rankTitle}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{pointsText}</Text>
          {progressBar}
        </View>
      </ProfileAuraCard>

      <View style={styles.profileMetrics}>
        {metrics.map((metric) => (
          <ProfileStatCard
            key={metric.label}
            label={metric.label}
            reduceTransparency={glass.reduceTransparency}
            sourceCardSkin={SourceCardSkin}
            tokens={tokens}
            value={metric.value}
            zipMintAura={ZipMintAura}
          />
        ))}
      </View>

      <SectionActionHeader
        action={language === 'vi' ? 'Hạng tối đa 5' : 'Max level 5'}
        title={language === 'vi' ? 'Thang hạng khách hàng' : 'Customer levels'}
      />
      <View style={styles.rankRail}>
        {rankNodes.map((node) => (
          <View
            key={node.value}
            style={[
              styles.rankNode,
              node.active ? styles.rankNodeActive : styles.rankNodeRest,
              {
                backgroundColor: node.active
                  ? (tokens.mode === 'dark' ? tokens.service : 'rgba(220,255,246,0.91)')
                  : (tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.81)'),
                borderColor: node.active
                  ? (tokens.mode === 'dark' ? 'rgba(117,236,220,0.34)' : 'rgba(13,174,154,0.38)')
                  : (tokens.mode === 'dark' ? tokens.border : 'rgba(113,225,209,0.26)'),
              },
            ]}
            testID={`customer-v21-profile-rank-node-${node.value}`}
          >
            <SourceCardSkin />
            <ProfileCompactMintAura reduceTransparency={glass.reduceTransparency} scope={`ProfileRankNodeFine${node.value}`} />
            {node.active ? <ZipMintAura scope={`ProfileRankNode${node.value}`} /> : null}
            <View style={styles.rankNodeContent}>
              <Text style={[styles.rankNodeValue, { color: node.active ? tokens.primary : tokens.muted }]}>{node.value}</Text>
              <Text numberOfLines={1} style={[styles.rankNodeLabel, { color: tokens.muted }]}>{node.label}</Text>
            </View>
          </View>
        ))}
      </View>
      {rankProcess}
      <ProfileRankingEvaluation
        assetTile={AssetTile}
        completed={completed}
        kaelHeadImage={customerV21Assets.kael}
        protectedTransactions={protectedTransactions}
        reviewRate={reviewRate}
      />

      <SectionActionHeader action={rulesAction} title={rulesTitle} />
      <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileListContent} scope="RankingRules" testID="customer-v21-profile-ranking-rules">
        {rules.map((rule, index) => (
          <Fragment key={rule.testID ?? rule.label}>
            {index > 0 ? <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} /> : null}
            <ProfileInsightRow
              assetTile={AssetTile}
              iconStyle={styles.profileInsightIcon}
              image={rule.image}
              label={rule.label}
              status={rule.status}
              testID={rule.testID}
              value={rule.value}
            />
          </Fragment>
        ))}
      </ProfileAuraCard>
    </View>
  )
}

export function ProfileMoneyPanel({
  body,
  chipLabel,
  layers,
  layersAction,
  layersTitle,
  latestBody,
  latestStatus,
  latestTitle,
  metrics,
  score,
  scoreState,
}: {
  body: string
  chipLabel: string
  layers: ProfileInsightModel[]
  layersAction: string
  layersTitle: string
  latestBody: string
  latestStatus: string
  latestTitle: string
  metrics: ProfilePanelMetric[]
  score: number
  scoreState: string
}) {
  const language = useAppLanguage()
  const glass = useGlassAccessibility()
  const tokens = useCustomerV21ProfileTheme()
  return (
    <View testID="customer-v21-profile-money">
      <ProfileAuraCard contentStyle={styles.profileMoneyHero} scope="MoneyHero" testID="customer-v21-profile-money-hero">
        <Text style={[styles.profileMoneyKicker, { color: tokens.text }]}>{language === 'vi' ? 'Chỉ số Bảo vệ đồng tiền' : 'Money protection score'}</Text>
        <ProfileLiquidScore
          caseOverviewScoreAura={CaseOverviewScoreAura}
          label="/100"
          percent={score}
          reduceTransparency={glass.reduceTransparency}
          scope="Money"
          secondaryLabel={scoreState}
          size="large"
          tokens={tokens}
          value={String(score)}
        />
        <KaelChip label={chipLabel} variant={score > 0 ? 'selected' : 'unselected'} />
        <Text style={[styles.profileMoneyBody, { color: tokens.muted }]}>{body}</Text>
      </ProfileAuraCard>

      <View style={styles.profileMetrics}>
        {metrics.map((metric) => (
          <ProfileStatCard
            key={metric.label}
            label={metric.label}
            reduceTransparency={glass.reduceTransparency}
            sourceCardSkin={SourceCardSkin}
            tokens={tokens}
            value={metric.value}
            zipMintAura={ZipMintAura}
          />
        ))}
      </View>

      <SectionActionHeader action={layersAction} title={layersTitle} />
      <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileListContent} scope="MoneyLayers" testID="customer-v21-profile-money-layers">
        {layers.map((layer, index) => (
          <Fragment key={layer.label}>
            {index > 0 ? <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} /> : null}
            <ProfileInsightRow
              assetTile={AssetTile}
              iconStyle={styles.profileInsightIcon}
              image={layer.image}
              label={layer.label}
              status={layer.status}
              value={layer.value}
            />
          </Fragment>
        ))}
      </ProfileAuraCard>

      <SectionActionHeader
        action={language === 'vi' ? 'Xem ›' : 'View ›'}
        title={language === 'vi' ? 'Công việc gần nhất được bảo vệ' : 'Latest protected job'}
      />
      <ProfileAuraCard contentStyle={styles.profileProtectedJob} scope="MoneyLatest" testID="customer-v21-profile-money-latest">
        <AssetTile image={customerV21Assets.shield} label={language === 'vi' ? 'Bảo vệ' : 'Protection'} size={52} sourceAura style={styles.profileInsightIcon} />
        <View style={styles.flex}>
          <Text style={[styles.profileInsightTitle, { color: tokens.text }]}>{latestTitle}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{latestBody}</Text>
        </View>
        <KaelChip label={latestStatus} variant="unselected" />
      </ProfileAuraCard>

      <ProfileAuraCard contentStyle={styles.profileKaelNote} scope="MoneyKael" testID="customer-v21-profile-money-kael">
        <AssetTile image={customerV21Assets.kael} label="Kael" size={42} sourceAura style={styles.infoNoticeIcon} />
        <View style={styles.flex}>
          <Text style={[styles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Kael nhắc bạn' : 'Kael reminder'}</Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>
            {language === 'vi' ? 'Kael chỉ giải thích và theo dõi. Quyền thanh toán nằm trong quy trình được phép.' : 'Kael explains and tracks. Payment authority stays in the allowed workflow.'}
          </Text>
        </View>
      </ProfileAuraCard>
    </View>
  )
}

export function ProfileMemoryPanel({
  languageValue,
  memoryRecordPresent,
  preference,
  servicePreference,
}: {
  languageValue: string
  memoryRecordPresent: boolean
  preference: string
  servicePreference: string
}) {
  const language = useAppLanguage()
  const tokens = useCustomerV21ProfileTheme()
  const copy = customerV21CommonCopy[language]
  return (
    <View testID="customer-v21-profile-memory">
      <V21Card glass style={styles.profileDetailHero}>
        <AssetTile image={customerV21Assets.memory} label={customerV21ScreenTitles[language]['5.4-memory']} size={62} />
        <View style={styles.flex}>
          <EyebrowPill label={memoryRecordPresent ? (language === 'vi' ? 'BỘ NHỚ KAEL' : 'KAEL MEMORY') : copy.dataPending} tokens={tokens} />
          <Text style={[historyActiveStyles.caseOverviewTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael nhớ theo quyền bạn cho.' : 'Kael remembers with your permission.'}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]}>{preference}</Text>
        </View>
      </V21Card>

      <SectionActionHeader
        action={memoryRecordPresent ? (language === 'vi' ? 'Theo dữ liệu thật' : 'Real data') : copy.dataPending}
        title={language === 'vi' ? 'Thông tin được phép dùng' : 'Allowed memory'}
      />
      <V21Card style={agenticStyles.memoryListCard}>
        <MemoryPermissionRow
          enabled={preference !== copy.dataPending}
          image={customerV21Assets.memory}
          label={language === 'vi' ? 'Tóm tắt sở thích' : 'Preference summary'}
          value={preference}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          enabled={languageValue !== copy.dataPending}
          image={customerV21Assets.language}
          label={language === 'vi' ? 'Ngôn ngữ' : 'Language'}
          value={languageValue}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          enabled={servicePreference !== copy.dataPending}
          image={customerV21ServiceAssets.cleaning}
          label={language === 'vi' ? 'Ưu tiên dịch vụ' : 'Service preference'}
          value={servicePreference}
        />
      </V21Card>

      <SectionActionHeader
        action={language === 'vi' ? 'Quy tắc' : 'Rules'}
        title={language === 'vi' ? 'Ranh giới dữ liệu' : 'Data boundaries'}
      />
      <V21Card style={agenticStyles.memoryListCard}>
        <MemoryPermissionRow
          enabled
          image={customerV21Assets.privacy}
          label={language === 'vi' ? 'Không trộn trò chuyện thường vào công việc' : 'Do not mix normal chat into jobs'}
          value={language === 'vi' ? 'Bật theo quy trình' : 'Workflow enforced'}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          enabled={false}
          image={customerV21Assets.profile}
          label={language === 'vi' ? 'Chia sẻ sở thích với thợ' : 'Share preferences with worker'}
          value={copy.dataPending}
        />
        <MemoryDivider />
        <MemoryPermissionRow
          enabled
          image={customerV21Assets.shield}
          label={language === 'vi' ? 'Cảnh báo thanh toán ngoài nền tảng' : 'Off-platform payment warning'}
          value={language === 'vi' ? 'Bật theo quy trình' : 'Workflow enforced'}
        />
      </V21Card>
    </View>
  )
}

export function SettingsActionRow({
  assetTile: AssetTile,
  body,
  image,
  onPress,
  status,
  testID,
  title,
  tokens,
  zipMintAura: ZipMintAura,
}: {
  assetTile: CustomerV21UtilityAssetTile
  body: string
  image: CustomerV21Visual
  onPress: () => void
  status: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
  zipMintAura: CustomerV21UtilityAura
}) {
  const titleAuraScope = `ProfileSettings${title.replace(/[^a-zA-Z0-9]/g, '')}`
  const statusAuraScope = `ProfileSettingsStatus${status.replace(/[^a-zA-Z0-9]/g, '')}`

  return (
    <Pressable
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.profileSettingsActionRow,
        { backgroundColor: tokens.raised, borderColor: tokens.border },
        pressed ? styles.pressed : null,
      ]}
      testID={testID}
    >
      <ZipMintAura scope={titleAuraScope} />
      <AssetTile image={image} label={title} size={48} sourceAura style={styles.profileSettingsActionIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.profileInsightTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{body}</Text>
      </View>
      <View style={styles.profileInsightChipFrame}>
        <ZipMintAura scope={statusAuraScope} />
        <KaelChip
          label={status}
          style={styles.profileInsightChip}
          textStyle={styles.profileMintChipText}
          variant="selected"
        />
      </View>
    </Pressable>
  )
}
