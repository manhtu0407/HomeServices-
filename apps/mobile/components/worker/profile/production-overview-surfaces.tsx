import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Circle, Path, Rect } from 'react-native-svg'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerPerformanceInsightsResponse, WorkerProfileResponse } from '@/lib/api-types'

import { ProfileSettingsGlyph, type ProfileSettingsGlyphName } from '../../customer/profile/profile-settings-icons'
import { ProfileFormulaMintSurface } from '../../customer/profile/profile-utility-surfaces'
import { customerV21ProfileSettingsGroupStyles as customerProfileGroupStyles } from '../../customer/profile/profile-settings-group-styles'
import { customerV21SurfaceContentWidth } from '../../customer/ui/shared-styles'
import { workerIsWaitingForReview, workerNeedsRegistration } from './registration-model'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'
import type { WorkerV5ScreenId } from '../dock/types'
import { stableImageSource } from '@/lib/stable-image-source'

type WorkerProfileProductionSurfaceProps = {
  avatarUploadBusy: boolean
  insights: WorkerPerformanceInsightsResponse | null
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  onPickAvatar: () => void
  onSignOut: () => void
  profile: WorkerProfileResponse | null
  testIDPrefix?: string
}

type ProfileRowConfig = {
  glyph: WorkerProfileGlyphName
  id: string
  onPress: () => void
  status?: string
  statusTone?: 'active' | 'danger' | 'muted'
  testID?: string
  title: string
}

type WorkerProfileGlyphName = ProfileSettingsGlyphName | 'availability' | 'feedback' | 'ranking' | 'reliability' | 'ticket'

type ProfileGroupConfig = {
  id: string
  rows: ProfileRowConfig[]
  title: string
}

export function WorkerV5ProfileProductionSurface({
  avatarUploadBusy,
  insights,
  language,
  navigateToScreen,
  onPickAvatar,
  onSignOut,
  profile,
  testIDPrefix = 'worker-v5-profile',
}: WorkerProfileProductionSurfaceProps) {
  const onDockScroll = useDockScrollHandler()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const { width: viewportWidth } = useWindowDimensions()
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const frameWidth = customerV21SurfaceContentWidth(viewportWidth)
  const groups = buildProfileGroups({ insights, language, navigateToScreen, onSignOut, profile })
  const displayName = profile?.legal_name?.trim() || textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
  const profileStatus = workerProfileStatus(profile, language)
  const serviceCount = workerServiceCount(profile, language)

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: tokens.canvas }]} testID={testIDPrefix === 'worker-v5-profile' ? 'worker-v5-screen-5.1-profile-overview' : testIDPrefix}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        onScroll={onDockScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        testID={`${testIDPrefix}-scroll`}
      >
        <View
          style={[
            styles.frame,
            { width: frameWidth },
          ]}
        >
          <View
            style={[styles.identityCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
            testID={`${testIDPrefix}-identity-card`}
          >
            <Pressable
              accessibilityLabel={profile?.avatar_url
                ? textByLanguage(language, 'Đổi ảnh đại diện', 'Change profile photo')
                : textByLanguage(language, 'Thêm ảnh đại diện', 'Add profile photo')}
              accessibilityRole="button"
              accessibilityState={{ busy: avatarUploadBusy, disabled: avatarUploadBusy }}
              disabled={avatarUploadBusy}
              onPress={onPickAvatar}
              style={({ pressed }) => [
                styles.avatar,
                { backgroundColor: tokens.base, borderColor: tokens.border },
                pressed && !reduceMotion ? styles.pressed : null,
              ]}
              testID={testIDPrefix === 'worker-v5-profile' ? `${testIDPrefix}-avatar-picker` : `${testIDPrefix}-avatar`}
            >
              {profile?.avatar_url ? (
                <Image contentFit="cover" source={stableImageSource(profile.avatar_url)} style={styles.avatarImage} testID={`${testIDPrefix}-avatar-image`} />
              ) : (
                <ProfileSettingsGlyph color={tokens.text} name="personal" testID={`${testIDPrefix}-avatar-placeholder`} />
              )}
              <View style={[styles.cameraBadge, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
                <CameraGlyph color={tokens.text} />
              </View>
            </Pressable>

            <View style={styles.identityCopy}>
              <Text numberOfLines={2} style={[styles.identityName, { color: tokens.text }]} testID={testIDPrefix === 'worker-v5-profile' ? `${testIDPrefix}-header-name` : `${testIDPrefix}-name`}>
                {displayName}
              </Text>
              <Text numberOfLines={1} style={[styles.identityRole, { color: tokens.muted }]}>
                {textByLanguage(language, 'Hồ sơ thợ', 'Worker profile')}
              </Text>
              <View style={styles.identityMetaRow}>
                <View style={[styles.statusPill, { backgroundColor: profileStatus.tone === 'active' ? tokens.service : tokens.base, borderColor: tokens.border }]}>
                  <Text style={[styles.statusPillText, { color: profileStatus.tone === 'active' ? tokens.primary : tokens.muted }]}>
                    {profileStatus.label}
                  </Text>
                </View>
                <Text numberOfLines={1} style={[styles.identityMeta, { color: tokens.muted }]}>
                  {textByLanguage(language, `Dịch vụ: ${serviceCount}`, `Services: ${serviceCount}`)}
                </Text>
              </View>
            </View>
          </View>

          <View style={customerProfileGroupStyles.container} testID={`${testIDPrefix}-groups`}>
            {groups.map((group) => (
              <View key={group.id} style={customerProfileGroupStyles.group} testID={`${testIDPrefix}-group-${group.id}`}>
                <Text style={[customerProfileGroupStyles.groupLabel, { color: tokens.text }]}>{group.title}</Text>
                <ProfileFormulaMintSurface
                  scope={`WorkerProfileGroup${group.id}`}
                  style={[customerProfileGroupStyles.groupSurface, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
                  testID={`${testIDPrefix}-group-${group.id}-surface`}
                >
                  {group.rows.map((row, index) => (
                    <View key={row.id}>
                      <ProfileRow
                        reduceMotion={reduceMotion}
                        row={row}
                        testIDPrefix={testIDPrefix}
                        tokens={tokens}
                      />
                      {index < group.rows.length - 1 ? <View style={[customerProfileGroupStyles.rowDivider, { backgroundColor: tokens.border }]} /> : null}
                    </View>
                  ))}
                </ProfileFormulaMintSurface>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function ProfileRow({ reduceMotion, row, testIDPrefix, tokens }: { reduceMotion: boolean; row: ProfileRowConfig; testIDPrefix: string; tokens: ReturnType<typeof getWorkerThemeTokens> }) {
  const rowTestID = row.testID ? `${testIDPrefix}-${row.testID}` : `${testIDPrefix}-row-${row.id}`
  return (
    <Pressable
      accessibilityLabel={row.status ? `${row.title}. ${row.status}` : row.title}
      accessibilityRole="button"
      hitSlop={8}
      onPress={row.onPress}
      style={({ pressed }) => [customerProfileGroupStyles.row, pressed && !reduceMotion ? styles.pressed : null]}
      testID={rowTestID}
    >
      <View style={styles.rowIconFrame} testID={`${rowTestID}-icon-frame`}>
        <WorkerProfileGlyph color={tokens.primary} name={row.glyph} testID={`${rowTestID}-icon`} />
      </View>
      <View style={customerProfileGroupStyles.rowCopy}>
        <Text numberOfLines={1} style={[customerProfileGroupStyles.rowTitle, { color: tokens.text }]}>{row.title}</Text>
      </View>
      <View style={customerProfileGroupStyles.rowMeta}>
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

function buildProfileGroups({
  insights,
  language,
  navigateToScreen,
  onSignOut,
  profile,
}: {
  insights: WorkerPerformanceInsightsResponse | null
  language: AppLanguage
  navigateToScreen: (id: WorkerV5ScreenId) => void
  onSignOut: () => void
  profile: WorkerProfileResponse | null
}): ProfileGroupConfig[] {
  const hasPerformanceScore = Number.isFinite(insights?.performance_score)
  const performanceStatus = hasPerformanceScore
    ? `${Math.round(insights?.performance_score ?? 0)}/100`
    : textByLanguage(language, 'Chưa có dữ liệu', 'No data')

  return [
    {
      id: 'special',
      title: textByLanguage(language, 'Đặc biệt', 'Special'),
      rows: [
        {
          glyph: 'ticket',
          id: 'invite-code',
          onPress: () => navigateToScreen('5.16-worker-invite-code'),
          status: textByLanguage(language, 'Mở', 'Open'),
          statusTone: 'active',
          title: textByLanguage(language, 'Mã mời khách', 'Customer invite code'),
        },
      ],
    },
    {
      id: 'professional',
      title: textByLanguage(language, 'Hồ sơ & năng lực', 'Profile & skills'),
      rows: [
        {
          glyph: 'tools',
          id: 'services',
          onPress: () => navigateToScreen('5.3-skills-service-area'),
          status: workerServiceCount(profile, language),
          statusTone: 'muted',
          title: textByLanguage(language, 'Dịch vụ chuyên môn', 'Professional services'),
        },
        {
          glyph: 'ranking',
          id: 'ranking',
          onPress: () => navigateToScreen('5.2-worker-ranking'),
          status: performanceStatus,
          statusTone: hasPerformanceScore ? 'active' : 'muted',
          title: textByLanguage(language, 'Xếp hạng thợ', 'Worker ranking'),
        },
        {
          glyph: 'reliability',
          id: 'reliability',
          onPress: () => navigateToScreen('5.4-reliability-insights'),
          status: performanceStatus,
          statusTone: hasPerformanceScore ? 'active' : 'muted',
          title: textByLanguage(language, 'Độ tin cậy', 'Reliability'),
        },
        {
          glyph: 'feedback',
          id: 'reviews',
          onPress: () => navigateToScreen('5.9-reviews-feedback'),
          status: insights?.review_count ? `${insights.review_count} lượt` : textByLanguage(language, 'Chưa có dữ liệu', 'No data'),
          statusTone: insights?.review_count ? 'active' : 'muted',
          title: textByLanguage(language, 'Đánh giá & phản hồi', 'Reviews & feedback'),
        },
        {
          glyph: 'password',
          id: 'verification',
          onPress: () => navigateToScreen('5.7-verification-documents'),
          status: workerVerificationStatus(profile, language),
          statusTone: profile?.is_approved ? 'active' : 'muted',
          title: textByLanguage(language, 'Giấy tờ & xác minh', 'Documents & verification'),
        },
      ],
    },
    {
      id: 'schedule',
      title: textByLanguage(language, 'Nhận việc', 'Work intake'),
      rows: [
        {
          glyph: 'availability',
          id: 'schedule',
          onPress: () => navigateToScreen('5.11-worker-availability'),
          status: workerAvailabilityStatus(profile, language),
          statusTone: profile?.is_available && profile.is_approved ? 'active' : profile?.is_suspended ? 'danger' : 'muted',
          title: textByLanguage(language, 'Trạng thái nhận việc', 'Availability status'),
        },
        {
          glyph: 'notifications',
          id: 'notifications',
          onPress: () => navigateToScreen('5.12-worker-notifications'),
          status: textByLanguage(language, 'Mở', 'Open'),
          statusTone: 'active',
          title: textByLanguage(language, 'Thông báo', 'Notifications'),
        },
      ],
    },
    {
      id: 'settings',
      title: textByLanguage(language, 'Tài khoản & hỗ trợ', 'Account & support'),
      rows: [
        {
          glyph: 'personal',
          id: 'settings',
          onPress: () => navigateToScreen('5.10-support-settings'),
          status: textByLanguage(language, 'Mở', 'Open'),
          statusTone: 'active',
          title: textByLanguage(language, 'Cài đặt', 'Settings'),
        },
        {
          glyph: 'memory',
          id: 'memory',
          onPress: () => navigateToScreen('5.6-agent-memory-preferences'),
          status: textByLanguage(language, 'Mở', 'Open'),
          statusTone: 'active',
          title: textByLanguage(language, 'Bộ nhớ Kael', 'Kael memory'),
        },
        {
          glyph: 'support',
          id: 'support',
          onPress: () => navigateToScreen('5.13-worker-support'),
          status: textByLanguage(language, 'Mở', 'Open'),
          statusTone: 'active',
          title: textByLanguage(language, 'Trợ giúp & hỗ trợ', 'Help & support'),
        },
        {
          glyph: 'terms',
          id: 'policies',
          onPress: () => navigateToScreen('5.14-worker-policies'),
          status: textByLanguage(language, 'Mở', 'Open'),
          statusTone: 'active',
          title: textByLanguage(language, 'Chính sách dành cho thợ', 'Worker policies'),
        },
      ],
    },
    {
      id: 'account',
      title: textByLanguage(language, 'Quản lý tài khoản', 'Account management'),
      rows: [
        {
          glyph: 'signout',
          id: 'signout',
          onPress: onSignOut,
          statusTone: 'danger',
          testID: 'sign-out',
          title: textByLanguage(language, 'Đăng xuất', 'Sign out'),
        },
        {
          glyph: 'delete',
          id: 'delete-account',
          onPress: () => navigateToScreen('5.15-worker-delete-account'),
          statusTone: 'danger',
          testID: 'delete-account',
          title: textByLanguage(language, 'Xóa tài khoản', 'Delete account'),
        },
      ],
    },
  ]
}

function workerProfileStatus(profile: WorkerProfileResponse | null, language: AppLanguage) {
  if (!profile) return { label: textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile'), tone: 'muted' as const }
  if (profile.is_suspended) return { label: textByLanguage(language, 'Đang khóa', 'Suspended'), tone: 'danger' as const }
  if (profile.is_approved) return { label: textByLanguage(language, 'Đã xác minh', 'Verified'), tone: 'active' as const }
  if (workerIsWaitingForReview(profile)) return { label: textByLanguage(language, 'Đang kiểm tra', 'Under review'), tone: 'muted' as const }
  return { label: textByLanguage(language, 'Cần hoàn tất', 'Needs completion'), tone: 'muted' as const }
}

function workerVerificationStatus(profile: WorkerProfileResponse | null, language: AppLanguage) {
  if (!profile || workerNeedsRegistration(profile)) return textByLanguage(language, 'Cần bổ sung', 'Needs completion')
  if (workerIsWaitingForReview(profile)) return textByLanguage(language, 'Đang kiểm tra', 'Under review')
  return profile.is_approved ? textByLanguage(language, 'Đã xác minh', 'Verified') : textByLanguage(language, 'Chưa hoàn tất', 'Incomplete')
}

function workerAvailabilityStatus(profile: WorkerProfileResponse | null, language: AppLanguage) {
  if (!profile || !profile.is_approved) return textByLanguage(language, 'Cần hồ sơ', 'Profile needed')
  if (profile.is_suspended) return textByLanguage(language, 'Đang khóa', 'Suspended')
  return profile.is_available ? textByLanguage(language, 'Đang nhận', 'Accepting') : textByLanguage(language, 'Đang tắt', 'Paused')
}

function workerServiceCount(profile: WorkerProfileResponse | null, language: AppLanguage) {
  const services = profile?.selected_service_types ?? profile?.active_service_types ?? profile?.service_types ?? []
  return services.length
    ? textByLanguage(language, `${services.length} dịch vụ`, `${services.length} services`)
    : textByLanguage(language, 'Chưa chọn', 'Not selected')
}

function textByLanguage(language: AppLanguage, vi: string, en: string) {
  return language === 'vi' ? vi : en
}

function WorkerProfileGlyph({ color, name, testID }: { color: string; name: WorkerProfileGlyphName; testID?: string }) {
  if (name !== 'availability' && name !== 'feedback' && name !== 'ranking' && name !== 'reliability' && name !== 'ticket') {
    return <ProfileSettingsGlyph color={color} name={name} testID={testID} />
  }

  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.45,
  }

  if (name === 'feedback') {
    return (
      <Svg height={21} testID={testID} viewBox="0 0 20 20" width={21}>
        <Path {...common} d="M5.2 3.8h9.6a2.4 2.4 0 0 1 2.4 2.4v5.3a2.4 2.4 0 0 1-2.4 2.4H9.2l-3.6 2.3v-2.3h-.4a2.4 2.4 0 0 1-2.4-2.4V6.2a2.4 2.4 0 0 1 2.4-2.4Z" />
        <Circle cx={7.1} cy={8.8} fill={color} r={0.9} />
        <Circle cx={10} cy={8.8} fill={color} r={0.9} />
        <Circle cx={12.9} cy={8.8} fill={color} r={0.9} />
      </Svg>
    )
  }

  if (name === 'ranking') {
    return (
      <Svg height={21} testID={testID} viewBox="0 0 20 20" width={21}>
        <Circle {...common} cx={10} cy={8.2} r={3.7} />
        <Path {...common} d="m7.6 11.3-1.2 5 3.6-2 3.6 2-1.2-5M8.7 8.3l.9.9 1.8-1.8" />
      </Svg>
    )
  }

  if (name === 'ticket') {
    return (
      <Svg height={21} testID={testID} viewBox="0 0 20 20" width={21}>
        <Path {...common} d="M4 4.8h12a1.5 1.5 0 0 1 1.5 1.5v2.1a1.6 1.6 0 0 0 0 3.2v2.1a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5v-2.1a1.6 1.6 0 0 0 0-3.2V6.3A1.5 1.5 0 0 1 4 4.8Z" />
        <Path {...common} d="M12.6 6.9v1.1M12.6 9.45v1.1M12.6 12v1.1" />
      </Svg>
    )
  }

  if (name === 'reliability') {
    return (
      <Svg height={21} testID={testID} viewBox="0 0 20 20" width={21}>
        <Circle {...common} cx={10} cy={10} r={7.4} />
        <Path {...common} d="m6.4 10 2.3 2.3 4.9-4.9" />
      </Svg>
    )
  }

  return (
    <Svg height={21} testID={testID} viewBox="0 0 20 20" width={21}>
      <Rect {...common} height={9.2} rx={4.6} width={15} x={2.5} y={5.4} />
      <Circle cx={7.2} cy={10} fill={color} r={2.2} />
      <Path {...common} d="M12.2 10h2.1" />
    </Svg>
  )
}

function CameraGlyph({ color }: { color: string }) {
  return (
    <Svg height={13} viewBox="0 0 20 20" width={13}>
      <Rect fill="none" height={9.5} rx={2} stroke={color} strokeWidth={1.4} width={14} x={3} y={5.8} />
      <Path d="M7.2 5.8 8.2 4h3.6l1 1.8" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.4} />
      <Circle cx={10} cy={10.5} fill="none" r={2.4} stroke={color} strokeWidth={1.4} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 128,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  frame: {
    alignItems: 'stretch',
    alignSelf: 'center',
    maxWidth: '100%',
    minWidth: 0,
  },
  identityCard: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 24,
    marginTop: 10,
    minHeight: 116,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 16,
    position: 'relative',
  },
  avatar: {
    alignItems: 'center',
    borderRadius: 42,
    borderWidth: 1,
    flexShrink: 0,
    height: 84,
    justifyContent: 'center',
    position: 'relative',
    width: 84,
  },
  avatarImage: {
    borderRadius: 38,
    height: '100%',
    width: '100%',
  },
  cameraBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    bottom: -2,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 26,
  },
  identityCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  identityName: {
    ...typography.title3,
    fontWeight: '500',
  },
  identityRole: {
    ...typography.footnote,
  },
  identityMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  identityMeta: {
    ...typography.caption1,
    flexShrink: 1,
  },
  rowIconFrame: {
    alignItems: 'center',
    borderRadius: 12,
    flexShrink: 0,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: {
    ...typography.caption2,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.99 }],
  },
})
