import type { ReactNode } from 'react'
import { Pressable, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect } from 'react-native-svg'

import { KaelButton, KaelChip } from '@/components/ui/kael-primitives'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, SourceCardSkin, SourceIconAura, ZipMintAura } from './aura-surfaces'
import { ProfileUsageRankingMark } from './profile-ranking-mark'
import { customerV21ProfileJourneyStyles as profileJourneyStyles } from './profile-journey-styles'
import { ProfileAuraCard } from './profile-utility-surfaces'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, SectionActionHeader, V21TopBar } from './shared-surfaces'

type RootProfileOverviewStyles = {
  accountUtilityGrid: StyleProp<ViewStyle>
  accountUtilityTile: StyleProp<ViewStyle>
  bodyText: StyleProp<TextStyle>
  flex: StyleProp<ViewStyle>
  pressed: StyleProp<ViewStyle>
  profileLogoutCta: StyleProp<ViewStyle>
  profileMintChipText: StyleProp<TextStyle>
}

type ProfileOverviewUtilityTileModel = {
  image: ImageSourcePropType
  label: string
  onPress: () => void
  scope: string
  testID: string
  value: string
}

type ProfileAccountJourneyModel = {
  accessibilityLabel: string
  activeDaysLabel: string
  activeDaysValue: string
  memberSince: string
  title: string
  totalDaysLabel: string
  totalDaysValue: string
}

export function CustomerProfileSubscreenView({
  body,
  onBack,
  subtitle,
  title,
  titleStyle,
}: {
  body: ReactNode
  onBack: () => void
  subtitle: string
  title: string
  titleStyle?: StyleProp<TextStyle>
}) {
  return (
    <>
      <V21TopBar
        onBack={onBack}
        subtitle={subtitle}
        title={title}
        titleStyle={titleStyle}
      />
      {body}
    </>
  )
}

export function CustomerProfileOverviewView({
  accountJourney,
  initials,
  name,
  onOpenRanking,
  onSignOut,
  rankingAccessibilityLabel,
  rankingBody,
  rankingLabel,
  rankingMetaLabel,
  rankingProgressNode,
  rankingProgressSourceLabel,
  rankingStatus,
  rankingStatusActive,
  rankingStatusTextStyle,
  signOutLabel,
  tokens,
  topBarSubtitle,
  topBarTitle,
  utilitySectionAction,
  utilitySectionTitle,
  utilityTiles,
  rootStyles,
}: {
  accountJourney: ProfileAccountJourneyModel
  initials: string
  name: string
  onOpenRanking: () => void
  onSignOut: () => void
  rankingAccessibilityLabel: string
  rankingBody: string
  rankingLabel: string
  rankingMetaLabel: string
  rankingProgressNode: ReactNode
  rankingProgressSourceLabel: string
  rankingStatus: string
  rankingStatusActive: boolean
  rankingStatusTextStyle: StyleProp<TextStyle>
  signOutLabel: string
  tokens: CustomerThemeTokens
  topBarSubtitle: string
  topBarTitle: string
  utilitySectionAction: string
  utilitySectionTitle: string
  utilityTiles: ProfileOverviewUtilityTileModel[]
  rootStyles: RootProfileOverviewStyles
}) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <>
      <V21TopBar
        showAvatar={false}
        subtitle={topBarSubtitle}
        title={topBarTitle}
      />

      <ProfileAuraCard cardStyle={profileUtilityStyles.profileOverviewHeroCard} contentStyle={profileUtilityStyles.profileHeroLarge} scope="OverviewHero" testID="customer-v21-profile-hero">
        <View style={profileUtilityStyles.profileAvatarLarge}>
          <View pointerEvents="none" style={profileUtilityStyles.profileAvatarGradientLayer}>
            <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 74 74" width="100%">
              <Defs>
                <LinearGradient id="profileAvatarGradient" x1="0.08" x2="0.92" y1="0.08" y2="0.92">
                  <Stop offset="0" stopColor="#7EDFD2" />
                  <Stop offset="0.62" stopColor="#08AF9C" />
                  <Stop offset="1" stopColor="#087D72" />
                </LinearGradient>
              </Defs>
              <Rect fill="url(#profileAvatarGradient)" height="74" rx="28" width="74" />
            </Svg>
          </View>
          <Text style={profileUtilityStyles.profileAvatarText}>{initials}</Text>
          <View style={profileUtilityStyles.profileAvatarDot} />
        </View>
        <View style={rootStyles.flex}>
          <View style={profileUtilityStyles.profileNameRow}>
            <Text numberOfLines={1} style={[sharedStyles.heroTitle, { color: tokens.text }]} testID="customer-v21-profile-name">{name}</Text>
          </View>
          <View
            accessibilityLabel={accountJourney.accessibilityLabel}
            accessible
            style={profileJourneyStyles.root}
            testID="customer-v21-profile-account-journey"
          >
            <Text numberOfLines={1} style={[profileJourneyStyles.start, { color: tokens.muted }]} testID="customer-v21-profile-account-start">
              {accountJourney.memberSince}
            </Text>
            <View style={profileJourneyStyles.summary}>
              <Text numberOfLines={1} style={[profileJourneyStyles.day, { color: tokens.text }]} testID="customer-v21-profile-total-days">
                {accountJourney.totalDaysValue}
              </Text>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={profileJourneyStyles.separator} />
              <Text numberOfLines={1} style={[profileJourneyStyles.activity, { color: tokens.muted }]} testID="customer-v21-profile-active-days">
                {accountJourney.activeDaysLabel}:{' '}
                <Text style={[profileJourneyStyles.activityValue, { color: tokens.text }]}>{accountJourney.activeDaysValue}</Text>
              </Text>
            </View>
          </View>
        </View>
      </ProfileAuraCard>

      <SectionActionHeader action={utilitySectionAction} title={utilitySectionTitle} />
      <View
        style={[rootStyles.accountUtilityGrid, profileUtilityStyles.profileOverviewUtilityGrid]}
        testID="customer-v21-profile-utility-grid"
      >
        {utilityTiles.map((tile) => (
          <ProfileOverviewUtilityTile key={tile.testID} rootStyles={rootStyles} tile={tile} tokens={tokens} />
        ))}
      </View>

      <View style={profileUtilityStyles.profileOverviewActionStack}>
        <Pressable
          accessibilityLabel={rankingAccessibilityLabel}
          accessibilityRole="button"
          onPress={onOpenRanking}
          testID="customer-v21-profile-ranking-cta"
        >
          {({ pressed }) => (
            <ProfileAuraCard cardStyle={[profileUtilityStyles.profileRankingEntryCard, pressed && !reduceMotion ? rootStyles.pressed : null]} contentStyle={profileUtilityStyles.profileRankingEntryContent} scope="OverviewRankingEntry" testID="customer-v21-profile-ranking-entry">
              <View
                style={[
                  profileUtilityStyles.profileRankingEntryVisualPanel,
                  {
                    backgroundColor: tokens.mode === 'dark' ? 'rgba(12,62,57,0.68)' : 'rgba(239,252,249,0.70)',
                    borderRightColor: tokens.mode === 'dark' ? tokens.border : 'rgba(176,222,214,0.78)',
                  },
                ]}
                testID="customer-v21-profile-ranking-entry-visual-panel"
              >
                <ProfileUsageRankingMark testID="customer-v21-profile-ranking-entry-icon" />
                <View
                  pointerEvents="none"
                  style={[
                    profileUtilityStyles.profileRankingEntryConnector,
                    { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' },
                  ]}
                  testID="customer-v21-profile-ranking-entry-connector"
                />
                <View
                  pointerEvents="none"
                  style={[
                    profileUtilityStyles.profileRankingEntryConnectorDot,
                    {
                      backgroundColor: tokens.primary,
                      borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)',
                    },
                  ]}
                  testID="customer-v21-profile-ranking-entry-connector-dot"
                />
              </View>
              <View style={profileUtilityStyles.profileRankingEntryCopy}>
                <View style={profileUtilityStyles.profileRankingEntryTitleRow}>
                  <View style={profileUtilityStyles.profileRankingEntryTitleCopy}>
                    <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>
                      {rankingLabel}
                    </Text>
                    <Text numberOfLines={2} style={[profileUtilityStyles.profileRankingEntrySubtitle, { color: tokens.muted }]}>
                      {rankingBody}
                    </Text>
                  </View>
                  <View style={[profileUtilityStyles.profileRankingStatusChipFrame, profileUtilityStyles.profileRankingEntryStatusChipFrame]} testID="customer-v21-profile-ranking-entry-status">
                    <ZipMintAura scope="ProfileOverviewRankingStatus" />
                    <KaelChip
                      label={rankingStatus}
                      style={rankingStatusActive ? profileUtilityStyles.profileMintChip : profileUtilityStyles.profileRankingEmptyChip}
                      textStyle={rankingStatusTextStyle}
                      variant={rankingStatusActive ? 'selected' : 'unselected'}
                    />
                  </View>
                </View>
                <View style={profileUtilityStyles.profileRankingEntrySignalRail} testID="customer-v21-profile-ranking-entry-signals">
                  <View style={profileUtilityStyles.profileRankingEntrySignal} testID="customer-v21-profile-ranking-entry-points-signal">
                    <Svg accessibilityElementsHidden height={14} viewBox="0 0 14 14" width={14}>
                      <Path d="M2.1 7a4.9 4.9 0 0 1 8.3-3.5M11.9 7a4.9 4.9 0 0 1-8.3 3.5M10.4 1.8v2.7H7.7m-4.1 7.7V9.5h2.7" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} />
                    </Svg>
                    <Text numberOfLines={1} style={[profileUtilityStyles.profileRankingEntrySignalText, { color: tokens.muted }]}>{rankingMetaLabel}</Text>
                  </View>
                  <View style={profileUtilityStyles.profileRankingEntrySignal} testID="customer-v21-profile-ranking-entry-source-signal">
                    <Svg accessibilityElementsHidden height={14} viewBox="0 0 14 14" width={14}>
                      <Path d="M7 1.5c.45 2.55 1.95 4.05 4.5 4.5C8.95 6.45 7.45 7.95 7 10.5 6.55 7.95 5.05 6.45 2.5 6 5.05 5.55 6.55 4.05 7 1.5Zm4 8.1c.2 1.05.85 1.7 1.9 1.9-1.05.2-1.7.85-1.9 1.9-.2-1.05-.85-1.7-1.9-1.9 1.05-.2 1.7-.85 1.9-1.9Z" fill={tokens.primary} />
                    </Svg>
                    <Text numberOfLines={1} style={[profileUtilityStyles.profileRankingEntrySignalText, { color: tokens.muted }]}>{rankingProgressSourceLabel}</Text>
                  </View>
                </View>
                <View style={profileUtilityStyles.profileRankingEntryProgress}>{rankingProgressNode}</View>
              </View>
            </ProfileAuraCard>
          )}
        </Pressable>
        <KaelButton
          backgroundLayer={<ZipMintAura scope="ProfileLogoutCta" />}
          label={signOutLabel}
          onPress={onSignOut}
          showPrimaryGradient={false}
          style={[rootStyles.profileLogoutCta, profileUtilityStyles.profileAuraButton]}
          testID="customer-v21-profile-signout-cta"
          variant="secondary"
        />
      </View>
    </>
  )
}

function ProfileOverviewUtilityTile({
  rootStyles,
  tile,
  tokens,
}: {
  rootStyles: RootProfileOverviewStyles
  tile: ProfileOverviewUtilityTileModel
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityLabel={`${tile.label}. ${tile.value}`}
      accessibilityRole="button"
      onPress={tile.onPress}
      style={({ pressed }) => [
        rootStyles.accountUtilityTile,
        profileUtilityStyles.profileOverviewUtilityTile,
        tile.scope === 'Payment' ? profileUtilityStyles.profileOverviewUtilityPaymentTile : null,
        { backgroundColor: tokens.raised, borderColor: tokens.border },
        pressed && !reduceMotion ? rootStyles.pressed : null,
      ]}
      testID={tile.testID}
    >
      {tokens.mode === 'dark' ? null : <SourceCardSkin testID={`${tile.testID}-skin`} />}
      <View
        pointerEvents="none"
        style={profileUtilityStyles.profileOverviewUtilityFormulaMintAura}
        testID={`${tile.testID}-formula-mint-aura`}
      >
        <CaseWideMintAura
          intensity="strong"
          scope={`ProfileUtility${tile.scope}Wide`}
          testID={`${tile.testID}-wide-mint-aura`}
        />
        <ZipMintAura
          scope={`ProfileUtility${tile.scope}Fine`}
          testID={`${tile.testID}-mint-aura`}
        />
      </View>
      <View style={profileUtilityStyles.profileOverviewUtilityCopy} testID={`${tile.testID}-copy`}>
        <View style={profileUtilityStyles.profileOverviewUtilityVisualPanel} testID={`${tile.testID}-visual-panel`}>
          <View style={profileUtilityStyles.profileOverviewUtilityIconFrame}>
            <SourceIconAura />
            <AssetTile
              image={tile.image}
              label={tile.label}
              size={37}
              style={profileUtilityStyles.profileOverviewUtilityIcon}
              testID={`${tile.testID}-icon`}
            />
          </View>
        </View>
        <View pointerEvents="none" style={profileUtilityStyles.profileOverviewUtilityConnectorTrack}>
          <View
            style={[
              profileUtilityStyles.profileOverviewUtilityConnector,
              { backgroundColor: tokens.mode === 'dark' ? 'rgba(80,200,184,0.42)' : 'rgba(47,183,164,0.58)' },
            ]}
            testID={`${tile.testID}-connector`}
          />
          <View
            style={[
              profileUtilityStyles.profileOverviewUtilityConnectorDot,
              {
                backgroundColor: tokens.primary,
                borderColor: tokens.mode === 'dark' ? tokens.raised : 'rgba(255,255,255,0.98)',
              },
            ]}
            testID={`${tile.testID}-connector-dot`}
          />
        </View>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.76}
          numberOfLines={2}
          style={[profileUtilityStyles.profileOverviewUtilityTitle, { color: tokens.text }]}
          testID={`${tile.testID}-title`}
        >
          {tile.label}
        </Text>
      </View>
      <View
        style={[
          profileUtilityStyles.profileOverviewUtilityDetailRail,
          { borderTopColor: tokens.mode === 'dark' ? tokens.border : 'rgba(198,222,218,0.78)' },
        ]}
        testID={`${tile.testID}-detail-rail`}
      >
        <Svg accessibilityElementsHidden height={13} viewBox="0 0 13 13" width={13}>
          <Path
            d="M2.4 1.5h4.4l2.8 2.8v7.2H2.4v-10Zm4.4 0v2.8h2.8M4.2 7h3.7M4.2 9h3"
            fill="none"
            stroke={tokens.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.15}
          />
        </Svg>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          style={[profileUtilityStyles.profileOverviewUtilityDetailLabel, { color: tokens.muted }]}
          testID={`${tile.testID}-value`}
        >
          {tile.value}
        </Text>
      </View>
    </Pressable>
  )
}
