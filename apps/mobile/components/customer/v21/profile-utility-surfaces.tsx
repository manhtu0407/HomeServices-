import { Fragment, type ComponentType, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { KaelChip } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { useAppLanguage } from '@/lib/app-language'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
  type CustomerThemeTokens,
} from '../customer-theme'
import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets, type CustomerV21Visual } from './assets'
import { customerV21CommonCopy } from './copy'
import { CaseOverviewScoreAura } from './history-surfaces'
import { ProfileCompactMintAura, ProfileLiquidScore, ProfileStatCard } from './profile-metrics-surfaces'
import { customerV21ProfileSettingsStyles as settingsStyles } from './profile-settings-styles'
import { customerV21ProfileUtilityStyles as styles } from './profile-utility-styles'
import { AssetTile, SectionActionHeader, V21Card } from './shared-surfaces'

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
  details?: readonly CustomerV21SettingsDetail[]
  image: ImageSourcePropType
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

export function ProfileInsightRow({
  assetTile: AssetTile,
  details,
  iconStyle,
  image,
  label,
  status,
  testID,
  value,
}: {
  assetTile: CustomerV21UtilityAssetTile
  details?: readonly CustomerV21SettingsDetail[]
  iconStyle?: StyleProp<ViewStyle>
  image: ImageSourcePropType
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

  if (details) {
    const auraScope = `ProfileRankingRuleIcon${profileAuraScope(label)}`
    return (
      <View
        style={[settingsStyles.actionRow, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID={testID}
      >
        <View
          style={[
            settingsStyles.visualPanel,
            {
              backgroundColor: tokens.mode === 'dark' ? tokens.ghost : '#EEFAF7',
              borderRightColor: tokens.border,
            },
          ]}
          testID={testID ? `${testID}-visual-panel` : undefined}
        >
          <View pointerEvents="none" style={settingsStyles.iconAura}>
            <ZipMintAura intensity="strong" scope={auraScope} testID={testID ? `${testID}-mint-aura` : undefined} />
          </View>
          <Image contentFit="contain" source={image} style={settingsStyles.actionIcon} testID={testID ? `${testID}-icon-image` : undefined} />
          <View
            pointerEvents="none"
            style={[settingsStyles.connector, { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' }]}
            testID={testID ? `${testID}-connector` : undefined}
          />
          <View
            pointerEvents="none"
            style={[
              settingsStyles.connectorDot,
              { backgroundColor: tokens.primary, borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)' },
            ]}
            testID={testID ? `${testID}-connector-dot` : undefined}
          />
        </View>
        <View style={settingsStyles.actionCopy} testID={testID ? `${testID}-copy` : undefined}>
          <Text numberOfLines={1} style={[styles.profileInsightTitle, { color: tokens.text }]} testID={testID ? `${testID}-title` : undefined}>{label}</Text>
          <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]} testID={testID ? `${testID}-body` : undefined}>{value}</Text>
          <CustomerSettingsDetailRail details={details} testID={`${testID ?? 'profile-insight'}-detail-rail`} tokens={tokens} />
        </View>
        <View
          style={[settingsStyles.statusFrame, styles.profileInsightChipFrame]}
          testID={testID ? `${testID}-chip` : undefined}
        >
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
  metrics,
  pointsText,
  progress,
  progressBar,
  rank,
  rankNodes,
  rankProcess,
  rankTitle,
  rules,
  rulesAction,
  rulesTitle,
}: {
  metrics: ProfilePanelMetric[]
  pointsText: string
  progress: number
  progressBar: ReactNode
  rank: number | null
  rankNodes: ProfileRankingNode[]
  rankProcess: ReactNode
  rankTitle: string
  rules: ProfileInsightModel[]
  rulesAction: string
  rulesTitle: string
}) {
  const language = useAppLanguage()
  const glass = useGlassAccessibility()
  const tokens = useCustomerV21ProfileTheme()
  const activeRank = rank !== null && rank > 0
  const rankValue = rank === null
    ? (language === 'vi' ? 'Chưa có' : 'Pending')
    : rank === 0
      ? (language === 'vi' ? 'Chưa xếp hạng' : 'Not ranked')
      : String(rank)

  return (
    <View testID="customer-v21-profile-ranking">
      <ProfileAuraCard cardStyle={styles.profileRankingHeroCard} contentStyle={styles.profileRankingHero} scope="RankingHero" testID="customer-v21-profile-ranking-hero">
        <ProfileLiquidScore
          caseOverviewScoreAura={CaseOverviewScoreAura}
          label={language === 'vi' ? 'Hạng hiện tại' : 'Current level'}
          percent={activeRank ? progress : 0}
          reduceTransparency={glass.reduceTransparency}
          scope="Ranking"
          showProgressDot
          tokens={tokens}
          value={rankValue}
        />
        <View style={styles.flex}>
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

      <SectionActionHeader action={rulesAction} title={rulesTitle} />
      <ProfileAuraCard cardStyle={styles.profileListCard} contentStyle={styles.profileSettingsListContent} scope="RankingRules" testID="customer-v21-profile-ranking-rules">
        {rules.map((rule, index) => (
          <Fragment key={rule.testID ?? rule.label}>
            {index > 0 ? <View style={[styles.profileListDivider, { backgroundColor: tokens.border }]} /> : null}
            <ProfileInsightRow
              assetTile={AssetTile}
              details={rule.details}
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
  score: number | null
  scoreState: string
}) {
  const language = useAppLanguage()
  const glass = useGlassAccessibility()
  const tokens = useCustomerV21ProfileTheme()
  const scorePercent = score ?? 0
  const scoreValue = score === null
    ? (language === 'vi' ? 'Chưa có' : 'Pending')
    : String(score)
  return (
    <View testID="customer-v21-profile-money">
      <ProfileAuraCard contentStyle={styles.profileMoneyHero} scope="MoneyHero" testID="customer-v21-profile-money-hero">
        <Text style={[styles.profileMoneyKicker, { color: tokens.text }]}>{language === 'vi' ? 'Chỉ số Bảo vệ đồng tiền' : 'Money protection score'}</Text>
        <ProfileLiquidScore
          caseOverviewScoreAura={CaseOverviewScoreAura}
          label={score === null ? '' : '/100'}
          percent={scorePercent}
          reduceTransparency={glass.reduceTransparency}
          scope="Money"
          secondaryLabel={scoreState}
          size="large"
          tokens={tokens}
          value={scoreValue}
        />
        <KaelChip label={chipLabel} variant={score !== null && score > 0 ? 'selected' : 'unselected'} />
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

export type CustomerV21SettingsDetailGlyph =
  | 'check'
  | 'document'
  | 'identity'
  | 'language'
  | 'location'
  | 'memory'
  | 'settings'
  | 'shield'

export type CustomerV21SettingsDetail = {
  glyph: CustomerV21SettingsDetailGlyph
  label: string
}

function CustomerSettingsDetailGlyph({ glyph, tokens }: { glyph: CustomerV21SettingsDetailGlyph; tokens: CustomerThemeTokens }) {
  const softFill = tokens.mode === 'dark' ? 'rgba(64,178,161,0.18)' : '#E5F9F5'

  if (glyph === 'check') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={8} fill={softFill} r={6.1} />
        <Path d="m4.9 8.1 2 2.1 4.4-4.7" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.55} />
      </Svg>
    )
  }
  if (glyph === 'document') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M4 2.2h5.1L12 5.1v8.1H4z" fill={softFill} stroke={tokens.primary} strokeLinejoin="round" strokeWidth={1.2} />
        <Path d="M9.1 2.2v3h3M6 8h4M6 10.4h3" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeWidth={1.1} />
      </Svg>
    )
  }
  if (glyph === 'identity') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={5.3} fill={tokens.primary} r={2.45} />
        <Path d="M3.5 13.1c.7-2.2 2.2-3.3 4.5-3.3s3.8 1.1 4.5 3.3" fill={softFill} stroke={tokens.primary} strokeLinecap="round" strokeWidth={1.1} />
      </Svg>
    )
  }
  if (glyph === 'language') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Circle cx={8} cy={8} fill={softFill} r={5.8} stroke={tokens.primary} strokeWidth={1.15} />
        <Path d="M2.6 8h10.8M8 2.2c1.6 1.6 2.3 3.5 2.3 5.8S9.6 12.2 8 13.8C6.4 12.2 5.7 10.3 5.7 8S6.4 3.8 8 2.2Z" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeWidth={1} />
      </Svg>
    )
  }
  if (glyph === 'location') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M8 2.1a4.1 4.1 0 0 0-4.1 4.1c0 3.1 4.1 7.7 4.1 7.7s4.1-4.6 4.1-7.7A4.1 4.1 0 0 0 8 2.1Z" fill={softFill} stroke={tokens.primary} strokeWidth={1.2} />
        <Circle cx={8} cy={6.2} fill={tokens.primary} r={1.35} />
      </Svg>
    )
  }
  if (glyph === 'memory') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Rect fill={softFill} height={9.5} rx={3.2} stroke={tokens.primary} strokeWidth={1.2} width={12} x={2} y={2.3} />
        <Circle cx={5.5} cy={7} fill={tokens.primary} r={1.05} />
        <Circle cx={8} cy={7} fill={tokens.primary} opacity={0.55} r={1.05} />
        <Circle cx={10.5} cy={7} fill={tokens.primary} r={1.05} />
        <Path d="M6.2 12.1 5.1 14l2.8-1.8" fill={softFill} stroke={tokens.primary} strokeLinejoin="round" strokeWidth={1.05} />
      </Svg>
    )
  }
  if (glyph === 'settings') {
    return (
      <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
        <Path d="M3 4h10M3 8h10M3 12h10" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeWidth={1.3} />
        <Circle cx={6} cy={4} fill={softFill} r={1.7} stroke={tokens.primary} strokeWidth={1.1} />
        <Circle cx={10.6} cy={8} fill={softFill} r={1.7} stroke={tokens.primary} strokeWidth={1.1} />
        <Circle cx={7.5} cy={12} fill={softFill} r={1.7} stroke={tokens.primary} strokeWidth={1.1} />
      </Svg>
    )
  }
  return (
    <Svg accessibilityElementsHidden height={16} viewBox="0 0 16 16" width={16}>
      <Path d="M8 2.2 12.6 4v3.5c0 2.8-1.9 4.9-4.6 6.2-2.7-1.3-4.6-3.4-4.6-6.2V4L8 2.2Z" fill={softFill} stroke={tokens.primary} strokeLinejoin="round" strokeWidth={1.2} />
      <Path d="m5.6 7.8 1.6 1.6 3.2-3.2" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} />
    </Svg>
  )
}

function CustomerSettingsDetailRail({
  details,
  testID,
  tokens,
}: {
  details: readonly CustomerV21SettingsDetail[]
  testID: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={settingsStyles.detailRail} testID={testID}>
      {details.map((detail, index) => (
        <View key={`${detail.glyph}-${detail.label}`} style={settingsStyles.detailItem} testID={`${testID}-${index}`}>
          <CustomerSettingsDetailGlyph glyph={detail.glyph} tokens={tokens} />
          <Text numberOfLines={1} style={[settingsStyles.detailLabel, { color: tokens.muted }]}>{detail.label}</Text>
          {index < details.length - 1 ? <View style={[settingsStyles.detailDivider, { backgroundColor: tokens.border }]} /> : null}
        </View>
      ))}
    </View>
  )
}

export function SettingsActionRow({
  body,
  details,
  image,
  onPress,
  status,
  testID,
  title,
  tokens,
}: {
  body: string
  details: readonly CustomerV21SettingsDetail[]
  image: ImageSourcePropType
  onPress: () => void
  status: string
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  const auraScope = `ProfileSettingsIcon${profileAuraScope(title)}`
  const { reduceMotion } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityHint={body}
      accessibilityLabel={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        settingsStyles.actionRow,
        { backgroundColor: tokens.raised, borderColor: tokens.border },
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={testID}
    >
      <View
        style={[
          settingsStyles.visualPanel,
          {
            backgroundColor: tokens.mode === 'dark' ? tokens.ghost : '#EEFAF7',
            borderRightColor: tokens.border,
          },
        ]}
        testID={`${testID}-visual-panel`}
      >
        <View pointerEvents="none" style={settingsStyles.iconAura}>
          <ZipMintAura intensity="strong" scope={auraScope} testID={`${testID}-mint-aura`} />
        </View>
        <Image contentFit="contain" source={image} style={settingsStyles.actionIcon} testID={`${testID}-icon-image`} />
        <View
          pointerEvents="none"
          style={[settingsStyles.connector, { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' }]}
          testID={`${testID}-connector`}
        />
        <View
          pointerEvents="none"
          style={[
            settingsStyles.connectorDot,
            { backgroundColor: tokens.primary, borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)' },
          ]}
          testID={`${testID}-connector-dot`}
        />
      </View>
      <View style={settingsStyles.actionCopy} testID={`${testID}-copy`}>
        <Text numberOfLines={2} style={[settingsStyles.actionTitle, { color: tokens.text }]} testID={`${testID}-title`}>{title}</Text>
        <Text numberOfLines={2} style={[settingsStyles.actionBody, { color: tokens.muted }]} testID={`${testID}-body`}>{body}</Text>
        <CustomerSettingsDetailRail details={details} testID={`${testID}-detail-rail`} tokens={tokens} />
      </View>
      <View style={settingsStyles.statusFrame} testID={`${testID}-status-frame`}>
        <KaelChip
          label={status}
          style={settingsStyles.statusChip}
          testID={`${testID}-status`}
          textStyle={[styles.profileMintChipText, settingsStyles.statusText]}
          variant="selected"
        />
      </View>
    </Pressable>
  )
}
