import type { ComponentProps, ReactNode } from 'react'
import { Pressable, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWorkCardAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import {
  CaseMiniStat,
  CaseOptionChoiceCard,
  CaseOverviewLiquidScore,
  CaseScopeStepRow,
  CaseWorkerAvatar,
  MatchingKaelStatusIcon,
  QuotePriceLine,
} from './history-surfaces'
import { AssetTile, MatchingHandoffChip, SectionActionHeader, V21Card } from './shared-surfaces'

type StageRootStyles = {
  chevronText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  matchingBarsCard: StyleProp<ViewStyle>
  matchingChipRow: StyleProp<ViewStyle>
  matchingDivider: StyleProp<ViewStyle>
  matchingHeroCard: StyleProp<ViewStyle>
  matchingHeroContent: StyleProp<ViewStyle>
  matchingHeroCopy: StyleProp<ViewStyle>
  matchingHeroMeta: StyleProp<TextStyle>
  matchingHeroName: StyleProp<TextStyle>
  matchingKaelBody: StyleProp<TextStyle>
  matchingKaelCard: StyleProp<ViewStyle>
  matchingKaelTitle: StyleProp<TextStyle>
  matchingNextButton: StyleProp<ViewStyle>
  matchingReasonBody: StyleProp<TextStyle>
  matchingReasonIcon: StyleProp<ViewStyle>
  matchingReasonRow: StyleProp<ViewStyle>
  matchingReasonTitle: StyleProp<TextStyle>
  matchingScoreBadge: StyleProp<ViewStyle>
  matchingScoreBadgeText: StyleProp<TextStyle>
}

type MatchingReasonView = {
  body: string
  image: ImageSourcePropType
  score: string
  title: string
}

type CaseScopeRowView = {
  label: string
  state: ComponentProps<typeof CaseScopeStepRow>['state']
  value: string
}

type SecondaryOptionView = {
  body: string
  image: ImageSourcePropType
  rightLabel: string
  testID: string
  title: string
}

type HandoffTone = ComponentProps<typeof MatchingHandoffChip>['tone']

export function CaseMatchingStageView({
  barsNode,
  confidenceTitle,
  confidenceLabel,
  confidencePercent,
  dataPendingLabel,
  kaelBody,
  kaelTitle,
  matchLabel,
  matchTone,
  onOpenOptions,
  optionsButtonLabel,
  profileAction,
  reasonSectionTitle,
  reasons,
  reduceTransparency,
  rootStyles,
  serviceMeta,
  statusLabel,
  statusTone,
  tokens,
  workerName,
  workerRating,
}: {
  barsNode: ReactNode
  confidenceLabel: string
  confidencePercent: number
  confidenceTitle: string
  dataPendingLabel: string
  kaelBody: string
  kaelTitle: string
  matchLabel: string
  matchTone: HandoffTone
  onOpenOptions: () => void
  optionsButtonLabel: string
  profileAction: string
  reasonSectionTitle: string
  reasons: MatchingReasonView[]
  reduceTransparency: boolean
  rootStyles: StageRootStyles
  serviceMeta: string
  statusLabel: string
  statusTone: HandoffTone
  tokens: CustomerThemeTokens
  workerName: string
  workerRating: string
}) {
  return (
    <View testID="customer-v21-direct-screen-2.7-matching">
      <V21Card glass style={rootStyles.matchingHeroCard} testID="customer-v21-matching-hero">
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingHero" testID="customer-v21-matching-hero-mint-aura" />
        <View style={rootStyles.matchingHeroContent}>
          <CaseOverviewLiquidScore
            label={confidenceTitle}
            percent={confidencePercent}
            reduceTransparency={reduceTransparency}
            scope="Matching"
            tokens={tokens}
            value={confidenceLabel}
          />
          <View style={rootStyles.matchingHeroCopy}>
            <MatchingHandoffChip label={matchLabel} tone={matchTone} />
            <Text numberOfLines={2} style={[rootStyles.matchingHeroName, { color: tokens.text }]}>{workerName}</Text>
            <Text numberOfLines={2} style={[rootStyles.matchingHeroMeta, { color: tokens.muted }]}>{serviceMeta}</Text>
            <View style={rootStyles.matchingChipRow}>
              <MatchingHandoffChip label={workerRating} tone="unselected" />
              <MatchingHandoffChip label={dataPendingLabel} tone="selected" />
              <MatchingHandoffChip label={statusLabel} tone={statusTone} />
            </View>
          </View>
        </View>
      </V21Card>

      <SectionActionHeader action={profileAction} title={reasonSectionTitle} />
      <V21Card style={rootStyles.matchingBarsCard} testID="customer-v21-decision-panel-2.7-matching">
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingReasons" testID="customer-v21-matching-reasons-mint-aura" />
        {reasons.map((reason, index) => (
          <View key={reason.title}>
            <View style={rootStyles.matchingReasonRow}>
              <AssetTile image={reason.image} label={reason.title} size={44} sourceAura style={rootStyles.matchingReasonIcon} />
              <View style={rootStyles.flex}>
                <Text numberOfLines={1} style={[rootStyles.matchingReasonTitle, { color: tokens.text }]}>{reason.title} · {reason.score}</Text>
                <Text numberOfLines={2} style={[rootStyles.matchingReasonBody, { color: tokens.muted }]}>{reason.body}</Text>
              </View>
              <View style={[rootStyles.matchingScoreBadge, { backgroundColor: tokens.service, borderColor: 'rgba(137,232,218,0.76)' }]}>
                <Text numberOfLines={1} style={[rootStyles.matchingScoreBadgeText, { color: tokens.primary }]}>{reason.score}</Text>
              </View>
            </View>
            {index < reasons.length - 1 ? <View style={[rootStyles.matchingDivider, { backgroundColor: tokens.border }]} /> : null}
          </View>
        ))}
      </V21Card>

      {barsNode}

      <Pressable
        accessibilityRole="button"
        onPress={onOpenOptions}
        style={[rootStyles.matchingKaelCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-v21-matching-kael-card"
      >
        <SourceCardSkin />
        <CaseWorkCardAura scope="MatchingKael" testID="customer-v21-matching-kael-mint-aura" />
        <MatchingKaelStatusIcon image={customerV21Assets.kael} testID="customer-v21-matching-kael-status-icon" />
        <View style={rootStyles.flex}>
          <Text numberOfLines={1} style={[rootStyles.matchingKaelTitle, { color: tokens.text }]}>{kaelTitle}</Text>
          <Text numberOfLines={2} style={[rootStyles.matchingKaelBody, { color: tokens.muted }]}>{kaelBody}</Text>
        </View>
        <Text style={[rootStyles.chevronText, { color: tokens.primary }]}>›</Text>
      </Pressable>

      <KaelButton
        label={optionsButtonLabel}
        onPress={onOpenOptions}
        style={rootStyles.matchingNextButton}
        testID="customer-v21-matching-next"
      />
    </View>
  )
}

export function CaseOptionsStageView({
  activityNode,
  advisory,
  dataBasedLabel,
  dataBasedTone,
  estimateLabel,
  heroBadgeLabel,
  optionAssetLabel,
  price,
  problem,
  scopeRows,
  scopeSectionAction,
  scopeSectionTitle,
  secondaryOptions,
  time,
  timeLabel,
  kaelSourceNode,
  onChooseOption,
  chooseOptionLabel,
  tokens,
}: {
  activityNode: ReactNode
  advisory: string
  chooseOptionLabel: string
  dataBasedLabel: string
  dataBasedTone: HandoffTone
  estimateLabel: string
  heroBadgeLabel: string
  kaelSourceNode: ReactNode
  onChooseOption: () => void
  optionAssetLabel: string
  price: string
  problem: string
  scopeRows: CaseScopeRowView[]
  scopeSectionAction: string
  scopeSectionTitle: string
  secondaryOptions: SecondaryOptionView[]
  time: string
  timeLabel: string
  tokens: CustomerThemeTokens
}) {
  return (
    <View testID="customer-v21-direct-screen-2.8-options">
      <V21Card glass style={historyActiveStyles.caseOptionHeroCard} testID="customer-v21-options-hero">
        <SourceCardSkin />
        <ZipMintAura scope="OptionsHero" testID="customer-v21-options-hero-mint-aura" />
        <View style={historyActiveStyles.caseSourceLayer}>
          <View style={historyActiveStyles.caseOptionBadgeTop}>
            <MatchingHandoffChip label={heroBadgeLabel} tone="success" />
          </View>
          <View style={historyActiveStyles.caseOptionHeroMain}>
            <AssetTile image={customerV21Assets.shield} label={optionAssetLabel} size={46} sourceAura style={historyActiveStyles.caseOptionHeroIcon} />
            <View style={sharedStyles.flex}>
              <Text numberOfLines={2} style={[historyActiveStyles.caseOptionTitle, { color: tokens.text }]}>{advisory}</Text>
              <Text numberOfLines={2} style={[historyActiveStyles.caseOptionBody, { color: tokens.muted }]}>{problem}</Text>
            </View>
          </View>
          <View style={[historyActiveStyles.caseDivider, { backgroundColor: tokens.border }]} />
          <View style={historyActiveStyles.caseOptionMetricRow}>
            <View style={historyActiveStyles.caseOptionMetric}>
              <Text style={[historyActiveStyles.caseOptionMetricLabel, { color: tokens.muted }]}>{timeLabel}</Text>
              <Text style={[historyActiveStyles.caseOptionMetricValue, { color: tokens.text }]}>{time}</Text>
            </View>
            <View style={historyActiveStyles.caseOptionMetric}>
              <Text style={[historyActiveStyles.caseOptionMetricLabel, { color: tokens.muted }]}>{estimateLabel}</Text>
              <Text style={[historyActiveStyles.caseOptionMoney, { color: tokens.primary }]}>{price}</Text>
            </View>
            <MatchingHandoffChip label={dataBasedLabel} tone={dataBasedTone} />
          </View>
        </View>
      </V21Card>

      <View style={historyActiveStyles.caseOptionChoiceStack}>
        {secondaryOptions.map((option) => (
          <CaseOptionChoiceCard
            assetTile={AssetTile}
            body={option.body}
            card={V21Card}
            handoffChip={MatchingHandoffChip}
            image={option.image}
            key={option.title}
            rightLabel={option.rightLabel}
            rightLabelTone="selected"
            sourceCardSkin={SourceCardSkin}
            testID={option.testID}
            title={option.title}
            tokens={tokens}
            zipMintAura={ZipMintAura}
          />
        ))}
      </View>

      <SectionActionHeader action={scopeSectionAction} title={scopeSectionTitle} />
      <V21Card style={historyActiveStyles.caseStepListCard} testID="customer-v21-options-scope">
        <SourceCardSkin />
        <ZipMintAura scope="OptionsScope" testID="customer-v21-options-scope-mint-aura" />
        <View style={historyActiveStyles.caseStepListContent}>
          {scopeRows.map((row) => (
            <CaseScopeStepRow key={row.label} label={row.label} state={row.state} tokens={tokens} value={row.value} />
          ))}
        </View>
      </V21Card>

      {kaelSourceNode}

      <KaelButton
        label={chooseOptionLabel}
        onPress={onChooseOption}
        style={historyActiveStyles.casePrimaryStageButton}
        testID="customer-v21-options-next"
      />

      {activityNode}
    </View>
  )
}

export function CaseQuotesStageView({
  activityNode,
  approveQuoteLabel,
  canOpenPayment,
  committedScopeAction,
  committedScopeTitle,
  dataSourceNode,
  editQuoteLabel,
  kaelSourceNode,
  onApproveQuote,
  onRequestEdit,
  platformFee,
  platformFeeLabel,
  price,
  priceLabel,
  problem,
  problemLabel,
  scopeRows,
  serviceWorkerMeta,
  tokens,
  total,
  totalLabel,
  warrantyLabel,
  warrantyValue,
  workerAvatarInitials,
  workerAvatarUri,
  workerName,
  workerNetLabel,
  workerNetValue,
  workerVerifiedLabel,
  workerVerifiedTone,
}: {
  activityNode: ReactNode
  approveQuoteLabel: string
  canOpenPayment: boolean
  committedScopeAction: string
  committedScopeTitle: string
  dataSourceNode: ReactNode
  editQuoteLabel: string
  kaelSourceNode: ReactNode
  onApproveQuote: () => void
  onRequestEdit: () => void
  platformFee: string
  platformFeeLabel: string
  price: string
  priceLabel: string
  problem: string
  problemLabel: string
  scopeRows: CaseScopeRowView[]
  serviceWorkerMeta: string
  tokens: CustomerThemeTokens
  total: string
  totalLabel: string
  warrantyLabel: string
  warrantyValue: string
  workerAvatarInitials: string
  workerAvatarUri: string | null
  workerName: string
  workerNetLabel: string
  workerNetValue: string
  workerVerifiedLabel: string
  workerVerifiedTone: HandoffTone
}) {
  return (
    <View testID="customer-v21-direct-screen-2.9-quotes">
      <V21Card glass style={historyActiveStyles.caseQuoteLedgerCard} testID="customer-v21-quote-ledger-card">
        <SourceCardSkin />
        <ZipMintAura scope="QuoteLedger" testID="customer-v21-quote-ledger-mint-aura" />
        <View style={historyActiveStyles.caseSourceLayer}>
          <View style={historyActiveStyles.caseQuoteWorkerRow}>
            <CaseWorkerAvatar initials={workerAvatarInitials} tokens={tokens} uri={workerAvatarUri} />
            <View style={sharedStyles.flex}>
              <Text numberOfLines={1} style={[historyActiveStyles.caseQuoteWorkerName, { color: tokens.text }]}>{workerName}</Text>
              <Text numberOfLines={1} style={[historyActiveStyles.caseQuoteWorkerMeta, { color: tokens.muted }]}>{serviceWorkerMeta}</Text>
            </View>
            <MatchingHandoffChip label={workerVerifiedLabel} tone={workerVerifiedTone} />
          </View>

          <View style={[historyActiveStyles.caseDivider, { backgroundColor: tokens.border }]} />

          <View style={historyActiveStyles.casePriceLines} testID="customer-v21-quote-price-lines">
            <QuotePriceLine label={priceLabel} tokens={tokens} value={price} />
            <QuotePriceLine label={problemLabel} tokens={tokens} value={problem} />
            <QuotePriceLine label={platformFeeLabel} tokens={tokens} value={platformFee} />
            <QuotePriceLine label={totalLabel} tokens={tokens} total value={total} />
          </View>
        </View>
      </V21Card>

      <SectionActionHeader action={committedScopeAction} title={committedScopeTitle} />
      <V21Card style={historyActiveStyles.caseStepListCard} testID="customer-v21-quote-scope">
        <SourceCardSkin />
        <ZipMintAura scope="QuoteScope" testID="customer-v21-quote-scope-mint-aura" />
        <View style={historyActiveStyles.caseStepListContent}>
          {scopeRows.map((row) => (
            <CaseScopeStepRow key={row.label} label={row.label} state={row.state} tokens={tokens} value={row.value} />
          ))}
        </View>
      </V21Card>

      <View style={historyActiveStyles.caseQuoteStatGrid} testID="customer-v21-quote-stat-grid">
        <CaseMiniStat label={workerNetLabel} sourceCardSkin={SourceCardSkin} tokens={tokens} value={workerNetValue} zipMintAura={ZipMintAura} />
        <CaseMiniStat label={warrantyLabel} sourceCardSkin={SourceCardSkin} tokens={tokens} value={warrantyValue} zipMintAura={ZipMintAura} />
      </View>

      {kaelSourceNode}

      <View style={historyActiveStyles.caseQuoteButtonRow}>
        <KaelButton
          label={editQuoteLabel}
          onPress={onRequestEdit}
          size="small"
          style={historyActiveStyles.caseQuoteButton}
          testID="customer-v21-quote-edit"
          variant="secondary"
        />
        <KaelButton
          disabled={!canOpenPayment}
          label={approveQuoteLabel}
          onPress={onApproveQuote}
          size="small"
          style={historyActiveStyles.caseQuoteButton}
          testID="customer-v21-quote-approve"
        />
      </View>

      {dataSourceNode}
      {activityNode}
    </View>
  )
}
