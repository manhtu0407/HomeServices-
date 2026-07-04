import { Fragment, type ComponentType } from 'react'
import { Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { KaelChip } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkCardAura, SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { customerV21HistoryStyles as styles } from './history-styles'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { MediaRow } from './history-surfaces'
import { AssetTile, InfoNotice, SectionActionHeader, SectionHeader, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'

type CustomerV21AssetTile = ComponentType<{
  image: ImageSourcePropType
  label: string
  size?: number
  sourceAura?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type CaseDecisionRowModel = {
  image: ImageSourcePropType
  label: string
  value: string
}

export function CaseProgressLabels({
  activeStep = 1,
  language,
  testIDs = false,
  tokens,
}: {
  activeStep?: number
  language: AppLanguage
  testIDs?: boolean
  tokens: CustomerThemeTokens
}) {
  const labels = [
    language === 'vi' ? 'Thu thập' : 'Collect',
    language === 'vi' ? 'Phân tích' : 'Analyze',
    language === 'vi' ? 'Đề xuất' : 'Suggest',
    language === 'vi' ? 'Duyệt' : 'Review',
  ]

  return (
    <View style={styles.caseProgressLabelRail}>
      {labels.map((label, index) => {
        const step = index + 1
        const edgeStyle = index === 0
          ? styles.caseProgressLabelStart
          : index === labels.length - 1
            ? styles.caseProgressLabelEnd
            : styles.caseProgressLabelCenter
        const slotStyle = index === 0
          ? styles.caseProgressLabelSlotStart
          : index === labels.length - 1
            ? styles.caseProgressLabelSlotEnd
            : styles.caseProgressLabelSlotCenter

        return (
          <Fragment key={label}>
            {index > 0 ? <View style={styles.caseProgressLabelSpacer} /> : null}
            <View
              style={[styles.caseProgressLabelSlot, slotStyle]}
              testID={testIDs ? `customer-v21-case-progress-label-slot-${step}` : undefined}
            >
              <Text
                style={[styles.caseProgressLabel, edgeStyle, { color: step === activeStep ? tokens.primary : tokens.muted }]}
                testID={testIDs ? `customer-v21-case-progress-label-${step}` : undefined}
              >
                {label}
              </Text>
            </View>
          </Fragment>
        )
      })}
    </View>
  )
}

export function CaseOverviewInfoRow({
  assetTile: AssetTile,
  chipLabel,
  image,
  label,
  showChevron = true,
  tokens,
  value,
}: {
  assetTile: CustomerV21AssetTile
  chipLabel?: string
  image: ImageSourcePropType
  label: string
  showChevron?: boolean
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={styles.caseOverviewInfoRow}>
      <AssetTile image={image} label={label} size={42} sourceAura style={styles.caseOverviewInfoIcon} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.caseOverviewInfoLabel, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={2} style={[styles.caseOverviewInfoValue, { color: tokens.muted }]}>{value}</Text>
      </View>
      {chipLabel ? <KaelChip label={chipLabel} variant="selected" /> : showChevron ? <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text> : null}
    </View>
  )
}

export function CasePrimaryInfoPanel({
  actionLabel,
  addressLabel,
  addressValue,
  evidenceChipLabel,
  evidenceLabel,
  evidenceValue,
  timeLabel,
  timeValue,
  title,
  tokens,
}: {
  actionLabel: string
  addressLabel: string
  addressValue: string
  evidenceChipLabel: string
  evidenceLabel: string
  evidenceValue: string
  timeLabel: string
  timeValue: string
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <>
      <SectionActionHeader action={actionLabel} title={title} />
      <V21Card style={[historyActiveStyles.casePrimaryInfoCard, historyActiveStyles.caseOverviewInfoCard]} testID="customer-v21-case-primary-info">
        <SourceCardSkin />
        <CaseWorkCardAura scope="OverviewInfo" testID="customer-v21-case-primary-info-mint-aura" />
        <CaseOverviewInfoRow assetTile={AssetTile} image={customerV21Assets.booking} label={timeLabel} tokens={tokens} value={timeValue} />
        <View style={[historyActiveStyles.caseInfoDivider, { backgroundColor: tokens.border }]} />
        <CaseOverviewInfoRow assetTile={AssetTile} image={customerV21Assets.address} label={addressLabel} tokens={tokens} value={addressValue} />
        <View style={[historyActiveStyles.caseInfoDivider, { backgroundColor: tokens.border }]} />
        <CaseOverviewInfoRow assetTile={AssetTile} chipLabel={evidenceChipLabel} image={customerV21Assets.evidence} label={evidenceLabel} tokens={tokens} value={evidenceValue} />
      </V21Card>
    </>
  )
}

export function CaseUnderstandingPanel({
  actionLabel,
  body,
  bodyTextStyle,
  confidenceChipLabel,
  headline,
  likelyPrefix,
  riskChipLabel,
  title,
  tokens,
}: {
  actionLabel: string
  body: string
  bodyTextStyle: StyleProp<TextStyle>
  confidenceChipLabel: string | null
  headline: string
  likelyPrefix: string
  riskChipLabel: string | null
  title: string
  tokens: CustomerThemeTokens
}) {
  return (
    <>
      <SectionActionHeader action={actionLabel} title={title} />
      <V21Card style={historyActiveStyles.caseUnderstandingCard} testID="customer-v21-case-understanding">
        <SourceCardSkin />
        <CaseWorkCardAura scope="OverviewUnderstanding" testID="customer-v21-case-understanding-mint-aura" />
        <Text style={[historyActiveStyles.caseUnderstandingText, { color: tokens.text }]}>
          <Text style={historyActiveStyles.caseUnderstandingStrong}>{likelyPrefix}</Text>
          {headline}
        </Text>
        <Text style={[bodyTextStyle, { color: tokens.muted }]}>{body}</Text>
        <View style={sharedStyles.heroChipRow}>
          {riskChipLabel ? <KaelChip label={riskChipLabel} variant="selected" /> : null}
          {confidenceChipLabel ? <KaelChip label={confidenceChipLabel} variant="unselected" /> : null}
        </View>
      </V21Card>
    </>
  )
}

export function CaseDecisionPanelView({
  actionLabel,
  body,
  eyebrow,
  heroImage,
  infoBody,
  infoImage,
  infoTitle,
  rows,
  testID,
  title,
}: {
  actionLabel: string
  body: string
  eyebrow: string
  heroImage: ImageSourcePropType
  infoBody: string
  infoImage: ImageSourcePropType
  infoTitle: string
  rows: CaseDecisionRowModel[]
  testID: string
  title: string
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card testID={testID}>
      <SectionHeader eyebrow={eyebrow} title={title} />
      <View style={profileUtilityStyles.profileDetailHero}>
        <AssetTile image={heroImage} label={title} size={58} />
        <View style={sharedStyles.flex}>
          <Text style={[historyActiveStyles.caseOverviewTitle, { color: tokens.text }]}>{actionLabel}</Text>
          <Text style={[sharedStyles.bodyText, { color: tokens.muted }]}>{body}</Text>
        </View>
      </View>
      {rows.map((row) => (
        <MediaRow assetTile={AssetTile} tokens={tokens} image={row.image} key={row.label} label={row.label} value={row.value} />
      ))}
      <InfoNotice
        assetTile={AssetTile}
        body={infoBody}
        image={infoImage}
        title={infoTitle}
        tokens={tokens}
      />
    </V21Card>
  )
}
