import type { ReactNode } from 'react'
import { Pressable, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect } from 'react-native-svg'

import { KaelButton, KaelChip } from '@/components/ui/kael-primitives'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'

import type { CustomerThemeTokens } from '../customer-theme'
import { SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { ProfileAuraCard } from './profile-utility-surfaces'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, SectionActionHeader, V21TopBar } from './shared-surfaces'

type RootProfileOverviewStyles = {
  accountUtilityGrid: StyleProp<ViewStyle>
  accountUtilityChevron: StyleProp<TextStyle>
  accountUtilityIcon: StyleProp<ViewStyle>
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

export function CustomerProfileSubscreenView({
  actionLabel,
  body,
  onBack,
  subtitle,
  title,
  titleStyle,
}: {
  actionLabel: string
  body: ReactNode
  onBack: () => void
  subtitle: string
  title: string
  titleStyle?: StyleProp<TextStyle>
}) {
  return (
    <>
      <V21TopBar
        actionLabel={actionLabel}
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
  activeLabel,
  agenticBody,
  agenticCenterLabel,
  agenticChipLabel,
  initials,
  memberSince,
  name,
  onOpenAgenticCenter,
  onOpenRanking,
  onSignOut,
  rankingAccessibilityLabel,
  rankingBody,
  rankingLabel,
  rankingMetaLabel,
  rankingProgressNode,
  rankingStatus,
  rankingStatusActive,
  rankingStatusTextStyle,
  signOutLabel,
  smartUtilitiesAction,
  smartUtilitiesTitle,
  tokens,
  topBarSubtitle,
  topBarTitle,
  utilitySectionAction,
  utilitySectionTitle,
  utilityTiles,
  verified,
  verifiedProfileLabel,
  rootStyles,
}: {
  activeLabel: string
  agenticBody: string
  agenticCenterLabel: string
  agenticChipLabel: string
  initials: string
  memberSince: string
  name: string
  onOpenAgenticCenter: () => void
  onOpenRanking: () => void
  onSignOut: () => void
  rankingAccessibilityLabel: string
  rankingBody: string
  rankingLabel: string
  rankingMetaLabel: string
  rankingProgressNode: ReactNode
  rankingStatus: string
  rankingStatusActive: boolean
  rankingStatusTextStyle: StyleProp<TextStyle>
  signOutLabel: string
  smartUtilitiesAction: string
  smartUtilitiesTitle: string
  tokens: CustomerThemeTokens
  topBarSubtitle: string
  topBarTitle: string
  utilitySectionAction: string
  utilitySectionTitle: string
  utilityTiles: ProfileOverviewUtilityTileModel[]
  verified: boolean
  verifiedProfileLabel: string
  rootStyles: RootProfileOverviewStyles
}) {
  return (
    <>
      <V21TopBar
        actionLabel="⚙"
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
            <KaelChip label="✓" variant={verified ? 'selected' : 'unselected'} />
          </View>
          <Text numberOfLines={1} style={[rootStyles.bodyText, { color: tokens.muted }]}>
            {verifiedProfileLabel}
          </Text>
          <View style={sharedStyles.heroChipRow}>
            <View style={profileUtilityStyles.profileMintChipFrame} testID="customer-v21-profile-member-chip">
              <ZipMintAura scope="ProfileMemberSinceChip" />
              <KaelChip
                label={memberSince}
                style={profileUtilityStyles.profileMintChip}
                textStyle={rootStyles.profileMintChipText}
                variant="selected"
              />
            </View>
            <KaelChip label={activeLabel} variant={verified ? 'selected' : 'unselected'} />
          </View>
        </View>
      </ProfileAuraCard>

      <SectionActionHeader action={smartUtilitiesAction} title={smartUtilitiesTitle} />
      <Pressable
        accessibilityLabel={agenticCenterLabel}
        accessibilityRole="button"
        onPress={onOpenAgenticCenter}
        testID="customer-v21-profile-agentic-entry"
      >
        <ProfileAuraCard cardStyle={profileUtilityStyles.profileOverviewAgenticCard} contentStyle={profileUtilityStyles.profileAgenticCard} scope="OverviewAgentic" testID="customer-v21-profile-agentic-card">
          <View style={rootStyles.flex}>
            <View style={profileUtilityStyles.profileNameRow}>
              <Text style={[sharedStyles.cardTitle, { color: tokens.text }]}>{agenticCenterLabel}</Text>
              <View style={profileUtilityStyles.profileMintChipFrame}>
                <ZipMintAura scope="ProfileAgenticUtilityChip" />
                <KaelChip
                  label={agenticChipLabel}
                  style={profileUtilityStyles.profileMintChip}
                  textStyle={rootStyles.profileMintChipText}
                  variant="selected"
                />
              </View>
            </View>
            <Text style={[rootStyles.bodyText, { color: tokens.muted }]}>{agenticBody}</Text>
          </View>
          <Text style={[profileUtilityStyles.profileAgenticChevron, { color: tokens.primary }]}>›</Text>
        </ProfileAuraCard>
      </Pressable>

      <SectionActionHeader action={utilitySectionAction} title={utilitySectionTitle} />
      <View style={rootStyles.accountUtilityGrid}>
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
            <ProfileAuraCard cardStyle={[profileUtilityStyles.profileRankingEntryCard, pressed ? rootStyles.pressed : null]} contentStyle={profileUtilityStyles.profileRankingEntryContent} scope="OverviewRankingEntry" testID="customer-v21-profile-ranking-entry">
              <AssetTile image={customerV21Assets.activity} label={rankingLabel} size={54} sourceAura style={profileUtilityStyles.profileRankingEntryIcon} />
              <View style={rootStyles.flex}>
                <View style={profileUtilityStyles.profileRankingEntryTitleRow}>
                  <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>
                    {rankingLabel}
                  </Text>
                  <View style={profileUtilityStyles.profileRankingStatusChipFrame}>
                    <ZipMintAura scope="ProfileOverviewRankingStatus" />
                    <KaelChip
                      label={rankingStatus}
                      style={rankingStatusActive ? profileUtilityStyles.profileMintChip : profileUtilityStyles.profileRankingEmptyChip}
                      textStyle={rankingStatusTextStyle}
                      variant={rankingStatusActive ? 'selected' : 'unselected'}
                    />
                  </View>
                </View>
                <Text numberOfLines={2} style={[rootStyles.bodyText, { color: tokens.muted }]}>
                  {rankingBody}
                </Text>
                <View style={profileUtilityStyles.profileRankingEntryMetaRow}>
                  <Text style={[profileUtilityStyles.profileRankingEntryMeta, { color: tokens.primary }]}>{rankingMetaLabel}</Text>
                  <Text style={[profileUtilityStyles.profileRankingEntryChevron, { color: tokens.primary }]}>›</Text>
                </View>
                {rankingProgressNode}
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
  const tileContent = (
    <>
      <SourceCardSkin />
      <ZipMintAura scope={`ProfileUtility${tile.scope}`} />
      <AssetTile image={tile.image} label={tile.label} size={48} sourceAura style={rootStyles.accountUtilityIcon} />
      <Text numberOfLines={1} style={[sharedStyles.utilityLabel, { color: tokens.text }]}>{tile.label}</Text>
      <Text numberOfLines={2} style={[sharedStyles.serviceNote, { color: tokens.muted }]}>{tile.value}</Text>
      <Text style={[rootStyles.accountUtilityChevron, { color: tokens.primary }]}>›</Text>
    </>
  )

  return (
    <Pressable
      accessibilityLabel={tile.label}
      accessibilityRole="button"
      onPress={tile.onPress}
      style={({ pressed }) => [
        rootStyles.accountUtilityTile,
        { backgroundColor: tokens.raised, borderColor: tokens.border },
        pressed ? rootStyles.pressed : null,
      ]}
      testID={tile.testID}
    >
      {tileContent}
    </Pressable>
  )
}
