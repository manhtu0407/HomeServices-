import type { ReactNode } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Pressable, Text, View, type ImageSourcePropType, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Rect } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { AlphaStop as Stop } from '@/components/ui/svg-alpha-stop'

import type { CustomerThemeTokens } from '../customer-theme'
import { ProfileUsageRankingMark } from './profile-ranking-mark'
import { customerV21ProfileJourneyStyles as profileJourneyStyles } from './profile-journey-styles'
import { customerV21ProfileSettingsGroupStyles as settingsGroupStyles } from './profile-settings-group-styles'
import { ProfileAuraCard, ProfileFormulaMintSurface } from './profile-utility-surfaces'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { customerV21SharedStyles as sharedStyles } from '../ui/shared-styles'
import { useCustomerV21SurfaceTheme, V21TopBar } from '../ui/shared-surfaces'

type RootProfileOverviewStyles = {
  flex: StyleProp<ViewStyle>
  pressed: StyleProp<ViewStyle>
}

type ProfileSettingsRowModel = {
  destructive?: boolean
  image: ImageSourcePropType
  onPress: () => void
  status?: string
  subtitle?: string
  testID: string
  title: string
}

export type ProfileSettingsGroupModel = {
  id: string
  rows: ProfileSettingsRowModel[]
  title: string
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
  const { tokens } = useCustomerV21SurfaceTheme()

  return (
    <>
      <V21TopBar
        containerStyle={tokens.mode === 'dark'
          ? [
              profileUtilityStyles.profileSubscreenTopBarDark,
              { backgroundColor: tokens.raised, borderColor: tokens.border },
            ]
          : undefined}
        onBack={onBack}
        subtitle={subtitle}
        testID="customer-v21-profile-subscreen-topbar"
        title={title}
        titleStyle={titleStyle}
      />
      <View style={profileUtilityStyles.profileSubscreenBody} testID="customer-v21-profile-subscreen-body">
        {body}
      </View>
    </>
  )
}

export function CustomerProfileOverviewView({
  accountJourney,
  avatarAccessibilityHint,
  avatarAccessibilityLabel,
  avatarUploadBusy,
  avatarUrl,
  initials,
  name,
  onPickAvatar,
  onOpenRanking,
  rankingAccessibilityLabel,
  rankingBody,
  rankingLabel,
  rankingMetaLabel,
  rankingProgressNode,
  rankingProgressSourceLabel,
  settingsGroups,
  tokens,
  topBarSubtitle,
  topBarTitle,
  versionLabel,
  rootStyles,
}: {
  accountJourney: ProfileAccountJourneyModel
  avatarAccessibilityHint: string
  avatarAccessibilityLabel: string
  avatarUploadBusy: boolean
  avatarUrl: string | null
  initials: string
  name: string
  onPickAvatar: () => void
  onOpenRanking: () => void
  rankingAccessibilityLabel: string
  rankingBody: string
  rankingLabel: string
  rankingMetaLabel: string
  rankingProgressNode: ReactNode
  rankingProgressSourceLabel: string
  settingsGroups: ProfileSettingsGroupModel[]
  tokens: CustomerThemeTokens
  topBarSubtitle: string
  topBarTitle: string
  versionLabel: string | null
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
        <Pressable
          accessibilityHint={avatarAccessibilityHint}
          accessibilityLabel={avatarAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ busy: avatarUploadBusy, disabled: avatarUploadBusy }}
          disabled={avatarUploadBusy}
          onPress={onPickAvatar}
          style={({ pressed }) => [
            profileUtilityStyles.profileAvatarLarge,
            pressed && !reduceMotion ? rootStyles.pressed : null,
          ]}
          testID="customer-v21-profile-avatar-picker"
        >
          {avatarUploadBusy ? (
            <ActivityIndicator color="#FFFFFF" size="small" testID="customer-v21-profile-avatar-loading" />
          ) : avatarUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              contentFit="cover"
              source={{ uri: avatarUrl }}
              style={profileUtilityStyles.profileAvatarImage}
              testID="customer-v21-profile-avatar-image"
            />
          ) : (
            <>
              <View pointerEvents="none" style={profileUtilityStyles.profileAvatarGradientLayer}>
                <Svg height="100%" preserveAspectRatio="none" viewBox="0 0 80 80" width="100%">
                  <Defs>
                    <LinearGradient id="profileAvatarGradient" x1="0.08" x2="0.92" y1="0.08" y2="0.92">
                      <Stop offset="0" stopColor="#7EDFD2" />
                      <Stop offset="0.62" stopColor="#08AF9C" />
                      <Stop offset="1" stopColor="#087D72" />
                    </LinearGradient>
                  </Defs>
                  <Rect fill="url(#profileAvatarGradient)" height="80" rx="30" width="80" />
                </Svg>
              </View>
              <Text style={profileUtilityStyles.profileAvatarText} testID="customer-v21-profile-avatar-fallback">{initials}</Text>
            </>
          )}
          {!avatarUploadBusy ? (
            <View pointerEvents="none" style={profileUtilityStyles.profileAvatarEditBadge}>
              <Svg height={13} viewBox="0 0 16 16" width={13}>
                <Path
                  d="M5.2 4.2 6.1 2.8h3.8l.9 1.4h1.6c.9 0 1.6.7 1.6 1.6v5.1c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6V5.8c0-.9.7-1.6 1.6-1.6h1.6ZM8 10.8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                  fill="#FFFFFF"
                />
              </Svg>
            </View>
          ) : null}
        </Pressable>
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
                </View>
                <View style={profileUtilityStyles.profileRankingEntrySignalRail} testID="customer-v21-profile-ranking-entry-signals">
                  <View style={profileUtilityStyles.profileRankingEntrySignal} testID="customer-v21-profile-ranking-entry-points-signal">
                    <Svg height={14} viewBox="0 0 14 14" width={14}>
                      <Path d="M2.1 7a4.9 4.9 0 0 1 8.3-3.5M11.9 7a4.9 4.9 0 0 1-8.3 3.5M10.4 1.8v2.7H7.7m-4.1 7.7V9.5h2.7" fill="none" stroke={tokens.primary} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.35} />
                    </Svg>
                    <Text numberOfLines={1} style={[profileUtilityStyles.profileRankingEntrySignalText, { color: tokens.muted }]}>{rankingMetaLabel}</Text>
                  </View>
                  <View style={profileUtilityStyles.profileRankingEntrySignal} testID="customer-v21-profile-ranking-entry-source-signal">
                    <Svg height={14} viewBox="0 0 14 14" width={14}>
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
      </View>

      <ProfileSettingsGroups groups={settingsGroups} rootStyles={rootStyles} tokens={tokens} />
      {versionLabel ? (
        <Text style={[settingsGroupStyles.versionLabel, { color: tokens.subtleText }]} testID="customer-v21-profile-version">
          {versionLabel}
        </Text>
      ) : null}
    </>
  )
}

function ProfileSettingsGroups({
  groups,
  rootStyles,
  tokens,
}: {
  groups: ProfileSettingsGroupModel[]
  rootStyles: RootProfileOverviewStyles
  tokens: CustomerThemeTokens
}) {
  return (
    <View style={settingsGroupStyles.container} testID="customer-v21-profile-settings-groups">
      {groups.map((group) => (
        <View key={group.id} style={settingsGroupStyles.group} testID={`customer-v21-profile-settings-group-${group.id}`}>
          <Text style={[settingsGroupStyles.groupLabel, { color: tokens.text }]}>{group.title}</Text>
          <ProfileFormulaMintSurface
            scope={`SettingsGroup${group.id}`}
            style={[settingsGroupStyles.groupSurface, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID={`customer-v21-profile-settings-group-${group.id}-surface`}
          >
            {group.rows.map((row, index) => (
              <View key={row.testID}>
                <ProfileSettingsCompactRow rootStyles={rootStyles} row={row} tokens={tokens} />
                {index < group.rows.length - 1 ? (
                  <View style={[settingsGroupStyles.rowDivider, { backgroundColor: tokens.border }]} />
                ) : null}
              </View>
            ))}
          </ProfileFormulaMintSurface>
        </View>
      ))}
    </View>
  )
}

function ProfileSettingsCompactRow({
  rootStyles,
  row,
  tokens,
}: {
  rootStyles: RootProfileOverviewStyles
  row: ProfileSettingsRowModel
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion } = useGlassAccessibility()
  const foreground = row.destructive ? tokens.danger : tokens.text

  return (
    <Pressable
      accessibilityHint={row.subtitle}
      accessibilityLabel={row.title}
      accessibilityRole="button"
      onPress={row.onPress}
      style={({ pressed }) => [
        settingsGroupStyles.row,
        pressed && !reduceMotion ? rootStyles.pressed : null,
      ]}
      testID={row.testID}
    >
      <View style={settingsGroupStyles.rowIconFrame}>
        <Image
          accessibilityIgnoresInvertColors
          contentFit="contain"
          source={row.image}
          style={settingsGroupStyles.rowIcon}
          testID={`${row.testID}-icon`}
        />
      </View>
      <View style={settingsGroupStyles.rowCopy}>
        <Text numberOfLines={2} style={[settingsGroupStyles.rowTitle, { color: foreground }]}>{row.title}</Text>
        {row.subtitle ? (
          <Text numberOfLines={2} style={[settingsGroupStyles.rowSubtitle, { color: tokens.muted }]}>{row.subtitle}</Text>
        ) : null}
      </View>
      <View style={settingsGroupStyles.rowMeta}>
        {row.status ? (
          <Text numberOfLines={2} style={[settingsGroupStyles.rowStatus, { color: row.destructive ? tokens.danger : tokens.muted }]}>
            {row.status}
          </Text>
        ) : null}
        <Svg height={18} viewBox="0 0 18 18" width={18}>
          <Path
            d="m7 4.5 4.5 4.5L7 13.5"
            fill="none"
            stroke={row.destructive ? tokens.danger : tokens.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.7}
          />
        </Svg>
      </View>
    </Pressable>
  )
}
