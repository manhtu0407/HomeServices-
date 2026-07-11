import type { ReactNode } from 'react'
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { KaelButton, KaelChip } from '@/components/ui/kael-primitives'
import { useAppLanguage } from '@/lib/app-language'

import { CaseOverviewHeroAura, CaseWideMintAura, CaseWorkActionButtonAura, CaseWorkCardAura, CaseWorkSourceChipAura, SourceCardSkin } from './aura-surfaces'
import { PrepRow } from './booking-surfaces'
import { customerV21HistoryActiveStyles as styles } from './history-active-styles'
import type { CustomerV21Visual } from './assets'
import { CaseArtifact, CustomerStatusPill, MediaRow } from './history-surfaces'
import { CaseProgressLabels } from './history-case-surfaces'
import { AssetTile, InfoNotice, ProgressRail, SectionHeader, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'

type ActivityStatusPrimaryModel = {
  body: string
  label: string
  value: string
}

type ActivityStatusRowModel = {
  image: CustomerV21Visual
  label: string
  value: string
}

export function CaseWorkSourceChip({ label, scope, testID }: { label: string; scope: string; testID?: string }) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <View style={[styles.caseWorkSourceChip, { backgroundColor: tokens.service, borderColor: 'rgba(13,174,154,0.30)' }]} testID={testID}>
      <CaseWorkSourceChipAura scope={scope} />
      <Text numberOfLines={1} style={[styles.caseWorkSourceChipText, { color: tokens.primary }]}>{label}</Text>
    </View>
  )
}

export function CaseWorkDataSourceFooter({ label, testID }: { label: string; testID?: string }) {
  const { tokens } = useCustomerV21SurfaceTheme()

  return (
    <Text numberOfLines={1} style={[styles.caseWorkDataSourceText, { color: tokens.muted }]} testID={testID}>
      {label}
    </Text>
  )
}

export function ActiveCaseCardPanel({
  activeCaseLabel,
  activeStep,
  activityImage,
  bodyTextStyle,
  cardStyle,
  caseCode,
  caseFactGrid,
  onOpen,
  openLabel,
  service,
  statusLabel,
}: {
  activeCaseLabel: string
  activeStep: number
  activityImage: CustomerV21Visual
  bodyTextStyle?: StyleProp<TextStyle>
  cardStyle?: StyleProp<ViewStyle>
  caseCode: string
  caseFactGrid: ReactNode
  onOpen: () => void
  openLabel: string
  service: string
  statusLabel: string
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card style={cardStyle} testID="customer-v21-active-case">
      <SourceCardSkin testID="customer-v21-active-case-skin" />
      <CaseWideMintAura intensity="strong" scope="ActiveCase" testID="customer-v21-active-case-mint-aura" />
      <View style={sharedStyles.cardHeaderRow}>
        <AssetTile image={activityImage} label={activeCaseLabel} size={50} />
        <View style={sharedStyles.flex}>
          <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{service}</Text>
          <Text style={[bodyTextStyle, { color: tokens.muted }]}>{caseCode}</Text>
        </View>
        <CustomerStatusPill label={statusLabel} tokens={tokens} />
      </View>
      <ProgressRail activeStep={activeStep} tokens={tokens} />
      {caseFactGrid}
      <KaelButton label={openLabel} onPress={onOpen} size="small" testID="customer-v21-active-case-open" />
    </V21Card>
  )
}

export function CaseOverviewPanel({
  analyzedLabel,
  code,
  detailLine,
  reduceTransparency,
  scoreNode,
  service,
  statusLabel,
  workflowRail,
}: {
  analyzedLabel: string
  code: string
  detailLine: string
  reduceTransparency: boolean
  scoreNode: ReactNode
  service: string
  statusLabel: string
  workflowRail: ReactNode
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card glass style={[styles.caseOverviewCard, styles.caseOverviewHeroCard]} testID="customer-v21-case-overview">
      <SourceCardSkin />
      <CaseOverviewHeroAura reduceTransparency={reduceTransparency} />
      <View style={styles.caseOverviewHeroContent}>
        <View style={styles.caseOverviewHeroText}>
          <KaelChip label={code} variant="selected" />
          <Text style={[styles.caseOverviewTitle, { color: tokens.text }]}>{service}</Text>
          <Text numberOfLines={3} style={[styles.caseOverviewDetailText, { color: tokens.muted }]}>{detailLine}</Text>
          <View style={sharedStyles.heroChipRow}>
            <KaelChip label={analyzedLabel} variant={scoreNode ? 'selected' : 'unselected'} />
            <CustomerStatusPill label={statusLabel} tokens={tokens} />
          </View>
        </View>
        {scoreNode}
      </View>
      {workflowRail}
    </V21Card>
  )
}

export function CaseWorkPanelView({
  activeStep,
  activityLabel,
  editing,
  editLabel,
  estimateReady,
  estimateValue,
  evidenceLabel,
  hasDescription,
  hasMedia,
  kaelImage,
  kaelIconStyle,
  onOpenActivity,
  onRequestEdit,
  recommendation,
  riskLabel,
  sourceFooterLabel,
}: {
  activeStep: number
  activityLabel: string
  editing: boolean
  editLabel: string
  estimateReady: boolean
  estimateValue: string
  evidenceLabel: string
  hasDescription: boolean
  hasMedia: boolean
  kaelImage: CustomerV21Visual
  kaelIconStyle?: StyleProp<ViewStyle>
  onOpenActivity: () => void
  onRequestEdit: () => void
  recommendation: string
  riskLabel: string
  sourceFooterLabel: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  const pendingText = language === 'vi' ? 'Chờ' : 'Pending'
  const doneText = language === 'vi' ? 'Có' : 'Ready'
  const emptyText = language === 'vi' ? 'Trống' : 'Empty'
  return (
    <>
      <V21Card style={styles.caseProgressCard} testID="customer-v21-case-work-progress">
        <SourceCardSkin />
        <CaseWorkCardAura scope="Progress" testID="customer-v21-case-work-progress-mint-aura" />
        <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Tiến độ Kael đang thực hiện' : 'Kael progress'}</Text>
        <ProgressRail activeStep={activeStep} tokens={tokens} />
        <CaseProgressLabels activeStep={3} language={language} tokens={tokens} />
      </V21Card>

      <V21Card style={styles.caseEvidenceCard} testID="customer-v21-case-work-evidence">
        <SourceCardSkin />
        <CaseWorkCardAura scope="Evidence" testID="customer-v21-case-work-evidence-mint-aura" />
        <View style={sharedStyles.rowBetween}>
          <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Công cụ & bằng chứng' : 'Tools and evidence'}</Text>
          <CaseWorkSourceChip label={evidenceLabel} scope="Evidence" testID="customer-v21-case-work-source-chip" />
        </View>
        <PrepRow done={hasDescription} index={1} label={language === 'vi' ? 'Đọc mô tả' : 'Read description'} tokens={tokens} value={hasDescription ? doneText : emptyText} />
        <PrepRow done={hasMedia} index={2} label={language === 'vi' ? 'Phân tích ảnh/video' : 'Analyze media'} tokens={tokens} value={evidenceLabel} />
        <PrepRow active={!estimateReady} done={estimateReady} index={3} label={language === 'vi' ? 'Ước tính chi phí & thời gian' : 'Estimate cost and time'} tokens={tokens} value={estimateReady ? doneText : pendingText} />
      </V21Card>

      <View style={styles.caseArtifactGrid} testID="customer-v21-case-work-artifacts">
        <CaseArtifact caseWorkCardAura={CaseWorkCardAura} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} scope="Evidence" sourceCardSkin={SourceCardSkin} tokens={tokens} value={evidenceLabel} />
        <CaseArtifact accent={estimateReady} caseWorkCardAura={CaseWorkCardAura} label={language === 'vi' ? 'Ước tính' : 'Estimate'} scope="Estimate" sourceCardSkin={SourceCardSkin} tokens={tokens} value={estimateValue} />
        <CaseArtifact caseWorkCardAura={CaseWorkCardAura} label={language === 'vi' ? 'Rủi ro' : 'Risk'} scope="Risk" sourceCardSkin={SourceCardSkin} tokens={tokens} value={riskLabel} />
      </View>

      <V21Card style={styles.caseRecommendationCard} testID="customer-v21-case-work-recommendation">
        <SourceCardSkin />
        <CaseWorkCardAura scope="Recommendation" testID="customer-v21-case-work-recommendation-mint-aura" />
        <View style={sharedStyles.cardHeaderRow}>
          <AssetTile image={kaelImage} label="Kael" size={42} style={kaelIconStyle} />
          <View style={sharedStyles.flex}>
            <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Đề xuất của Kael' : 'Kael recommendation'}</Text>
            <Text numberOfLines={3} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{recommendation}</Text>
          </View>
        </View>
        <View style={styles.caseWorkLockedActions}>
          <KaelButton backgroundLayer={<CaseWorkActionButtonAura scope="EditReal" />} label={editLabel} onPress={onRequestEdit} size="small" style={styles.caseWorkLockedActionButton} testID="customer-v21-case-work-request-edit" variant="secondary" />
          <KaelButton label={activityLabel} onPress={onOpenActivity} size="small" style={styles.caseWorkLockedActionButton} testID="customer-v21-case-open-activity" variant="secondary" />
        </View>
        <CaseWorkDataSourceFooter label={sourceFooterLabel} testID="customer-v21-case-work-source-footer" />
      </V21Card>
    </>
  )
}

export function ActivityStatusPanelView({
  activeStep,
  eyebrow,
  image,
  infoBody,
  infoImage,
  infoTitle,
  labelTextStyle,
  primary,
  rows,
  testID,
  title,
}: {
  activeStep: number
  eyebrow: string
  image: CustomerV21Visual
  infoBody: string
  infoImage: CustomerV21Visual
  infoTitle: string
  labelTextStyle?: StyleProp<TextStyle>
  primary: ActivityStatusPrimaryModel
  rows: ActivityStatusRowModel[]
  testID: string
  title: string
}) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card testID={testID}>
      <SectionHeader eyebrow={eyebrow} title={title} />
      <View style={styles.activityStatusHero}>
        <AssetTile image={image} label={title} size={58} />
        <View style={sharedStyles.flex}>
          <Text style={[labelTextStyle, { color: tokens.muted }]}>{primary.label}</Text>
          <Text numberOfLines={2} style={[styles.activityStatusValue, { color: tokens.primary }]}>{primary.value}</Text>
          <Text style={[sharedStyles.bodyText, { color: tokens.muted }]}>{primary.body}</Text>
        </View>
      </View>
      <ProgressRail activeStep={activeStep} tokens={tokens} total={5} />
      <View style={styles.activityStatusRows}>
        {rows.map((row) => (
          <MediaRow assetTile={AssetTile} tokens={tokens} image={row.image} key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
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
