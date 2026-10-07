import type { ReactNode } from 'react'
import { Image } from 'expo-image'
import { ActivityIndicator, Pressable, Text, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'

import type { CustomerThemeTokens } from '../customer-theme'
import { customerV21ProfileJourneyStyles as profileJourneyStyles } from './profile-journey-styles'
import { ProfileSettingsGlyph, type ProfileSettingsGlyphName } from './profile-settings-icons'
import { customerV21ProfileSettingsGroupStyles as settingsGroupStyles } from './profile-settings-group-styles'
import { ProfileAuraCard, ProfileFormulaMintSurface } from './profile-utility-surfaces'
import { customerV21ProfileUtilityStyles as profileUtilityStyles } from './profile-utility-styles'
import { UsageRankCard } from './usage-rank-card'
import { useCustomerV21SurfaceTheme, V21TopBar } from '../ui/shared-surfaces'
import { stableImageSource } from '@/lib/stable-image-source'

type RootProfileOverviewStyles = {
  flex: StyleProp<ViewStyle>
  pressed: StyleProp<ViewStyle>
}

type ProfileSettingsRowModel = {
  destructive?: boolean
  glyph?: ProfileSettingsGlyphName
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
}: {
  body: ReactNode
  onBack: () => void
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
        subtitle=""
        testID="customer-v21-profile-subscreen-topbar"
        title=""
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
  name,
  onPickAvatar,
  onOpenRanking,
  rankingAccessibilityLabel,
  rankingLabel,
  rankingPointsLabel,
  rankingTagline,
  settingsGroups,
  tokens,
  versionLabel,
  rootStyles,
}: {
  accountJourney: ProfileAccountJourneyModel
  avatarAccessibilityHint: string
  avatarAccessibilityLabel: string
  avatarUploadBusy: boolean
  avatarUrl: string | null
  name: string
  onPickAvatar: () => void
  onOpenRanking: () => void
  rankingAccessibilityLabel: string
  rankingLabel: string
  rankingPointsLabel: string
  rankingTagline: string
  settingsGroups: ProfileSettingsGroupModel[]
  tokens: CustomerThemeTokens
  versionLabel: string | null
  rootStyles: RootProfileOverviewStyles
}) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <>
      <ProfileAuraCard cardStyle={profileUtilityStyles.profileOverviewHeroCard} contentStyle={profileUtilityStyles.profileHeroLarge} scope="OverviewHero" showMintAura={false} testID="customer-v21-profile-hero">
        <Pressable
          accessibilityHint={avatarAccessibilityHint}
          accessibilityLabel={avatarAccessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ busy: avatarUploadBusy, disabled: avatarUploadBusy }}
          disabled={avatarUploadBusy}
          onPress={onPickAvatar}
          style={({ pressed }) => [
            profileUtilityStyles.profileAvatarLarge,
            { backgroundColor: tokens.raised, borderColor: tokens.border },
            pressed && !reduceMotion ? rootStyles.pressed : null,
          ]}
          testID="customer-v21-profile-avatar-picker"
        >
          {avatarUploadBusy ? (
            <ActivityIndicator color={tokens.text} size="small" testID="customer-v21-profile-avatar-loading" />
          ) : avatarUrl ? (
            <Image
              accessibilityIgnoresInvertColors
              contentFit="cover"
              source={stableImageSource(avatarUrl)}
              style={profileUtilityStyles.profileAvatarImage}
              testID="customer-v21-profile-avatar-image"
            />
          ) : (
            <ProfileSettingsGlyph color={tokens.text} name="personal" testID="customer-v21-profile-avatar-placeholder-icon" />
          )}
          {!avatarUploadBusy ? (
            <View
              pointerEvents="none"
              style={[profileUtilityStyles.profileAvatarEditBadge, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
              testID="customer-v21-profile-avatar-edit-badge"
            >
              <Svg height={13} viewBox="0 0 16 16" width={13}>
                <Path
                  d="M5.2 4.2 6.1 2.8h3.8l.9 1.4h1.6c.9 0 1.6.7 1.6 1.6v5.1c0 .9-.7 1.6-1.6 1.6H3.6c-.9 0-1.6-.7-1.6-1.6V5.8c0-.9.7-1.6 1.6-1.6h1.6ZM8 10.8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"
                  fill="none"
                  stroke={tokens.text}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.3}
                />
              </Svg>
            </View>
          ) : null}
        </Pressable>
        <View style={rootStyles.flex}>
          <View style={profileUtilityStyles.profileNameRow}>
            <Text numberOfLines={2} style={[profileUtilityStyles.profileHeroName, { color: tokens.text }]} testID="customer-v21-profile-name">{name}</Text>
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
          accessibilityValue={{ text: rankingPointsLabel }}
          onPress={onOpenRanking}
          testID="customer-v21-profile-ranking-cta"
        >
          {({ pressed }) => (
            <UsageRankCard
              statusLabel={rankingPointsLabel}
              style={pressed && !reduceMotion ? rootStyles.pressed : null}
              tagline={rankingTagline}
              title={rankingLabel}
            />
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
  const foreground = tokens.text

  return (
    <Pressable
      accessibilityHint={[row.subtitle, row.status].filter(Boolean).join('. ') || undefined}
      accessibilityLabel={row.title}
      accessibilityRole="button"
      hitSlop={8}
      onPress={row.onPress}
      style={({ pressed }) => [
        settingsGroupStyles.row,
        pressed && !reduceMotion ? rootStyles.pressed : null,
      ]}
      testID={row.testID}>
      <View style={settingsGroupStyles.rowIconFrame}>
        {row.glyph ? (
          <ProfileSettingsGlyph color={tokens.primary} name={row.glyph} testID={`${row.testID}-icon`} />
        ) : (
          <Image
            accessibilityIgnoresInvertColors
            contentFit="contain"
            source={row.image}
            style={settingsGroupStyles.rowIcon}
            testID={`${row.testID}-icon`}
          />
        )}
      </View>
      <View style={settingsGroupStyles.rowCopy}>
        <Text numberOfLines={1} style={[settingsGroupStyles.rowTitle, { color: foreground }]}>{row.title}</Text>
      </View>
      <View style={settingsGroupStyles.rowMeta}>
              <Svg height={16} viewBox="0 0 18 18" width={16}>
          <Path
            d="m7 4.5 4.5 4.5L7 13.5"
            fill="none"
            stroke={tokens.primary}
            strokeLinecap="round"
            strokeLinejoin="round"
                    strokeWidth={1.8}
          />
        </Svg>
      </View>
    </Pressable>
  )
}
