import { localizedWorkerAreaLabel } from './chat-helpers'
import { workerVerificationCopy } from './copy'
import { buildWorkerProfileLevelModel, workerProfileLevelMax } from './profile-level'
import { styles } from './styles'
import { workerProfileHeroSurface, workerProfileLevelChipSheen, workerProfileLevelChipSurface, workerProfileLevelCornerAura, workerProfileLevelMilestoneBadgeSurface, workerProfileLevelMilestoneSurface, workerProfileLevelOrbSurface, workerProfileLevelScrollEdgeSurface, workerProfileLevelScrollSheenSurface, workerProfileLevelScrollThumbSurface, workerProfileLevelScrollTrackSurface, workerProfileLevelSignalGlass, workerProfileLevelSignalSurface, workerProfileLevelSignalTopEdge, workerProfileMiniSurface, workerProfilePanelSurface, workerProfilePreferenceRowSurface, workerProfilePreferenceSurface, workerProfileProgressFillSurface, workerProfileProgressTrackSurface, workerProfileRowSurface } from './surface-styles/profile-map'
import { setWorkerThemeMode, type WorkerThemeTokens } from './theme'
import { type WorkerLanguageMode, type WorkerProfileLevelMilestone } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { type WorkerProfileResponse } from '@/lib/api-types'
import { appCopy, localizedServiceLabel, setAppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useRouter } from 'expo-router'
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, Text, View } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { WorkerVerificationForm } from './profile-verification'
import { WorkerFrame } from './shell'
import { PressButton, SubtleGlassHighlight, WorkerImageIcon, WorkerProfileMaterialChrome, localizedWorkerVerificationStatus, useWorkerFrameCopy, useWorkerUi } from './ui'
import type { WorkerImageIconName } from './ui'

export function WorkerProfileSurface() {
  const copy = useWorkerFrameCopy()

  return (
    <WorkerFrame active="profile" eyebrow={copy.profile.eyebrow} hideHeader title={copy.profile.title} testID="worker-profile-surface">
      <WorkerProfileContent />
    </WorkerFrame>
  )
}

const WorkerProfileLevelRailSpacer = memo(function WorkerProfileLevelRailSpacer() {
  return <View style={styles.profileLevelRailSpacer} />
})

const WorkerProfileLevelChip = memo(function WorkerProfileLevelChip({
  language,
  milestone,
  onSelect,
  reduceMotion,
  selected,
  tokens,
}: {
  language: WorkerLanguageMode
  milestone: WorkerProfileLevelMilestone
  onSelect: (level: number) => void
  reduceMotion: boolean
  selected: boolean
  tokens: WorkerThemeTokens
}) {
  const accessibilityState = useMemo(() => ({ selected }), [selected])
  const handlePress = useCallback(() => {
    onSelect(milestone.level)
  }, [milestone.level, onSelect])

  return (
    <Pressable
      accessibilityLabel={`${language === 'en' ? 'Level' : 'Cấp'} ${milestone.level}`}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      onPress={handlePress}
      style={({ pressed }) => [
        styles.profileLevelChip,
        workerProfileLevelChipSurface(tokens, milestone.state, selected),
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={`worker-profile-level-chip-${milestone.level}`}
    >
      {selected ? <View pointerEvents="none" style={[styles.profileLevelChipSheen, workerProfileLevelChipSheen(tokens)]} /> : null}
      <Text style={[styles.profileLevelChipMeta, { color: selected ? tokens.primary : tokens.muted }]} numberOfLines={1}>
        {language === 'en' ? 'Lv' : 'Cấp'}
      </Text>
      <Text style={[styles.profileLevelChipValue, { color: tokens.ink }]} numberOfLines={1}>
        {milestone.level}
      </Text>
      <Text style={[styles.profileLevelChipState, { color: selected ? tokens.primary : tokens.subtle }]} numberOfLines={1}>
        {milestone.stateLabel}
      </Text>
    </Pressable>
  )
})

function WorkerProfileLevelCard({ workerProfile }: { workerProfile: WorkerProfileResponse | null }) {
  const { language, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const model = buildWorkerProfileLevelModel(workerProfile, language)
  const defaultSelectedLevel = model.level >= 5 ? Math.min(workerProfileLevelMax, model.level + 1) : Math.max(1, model.level)
  const [selectedLevelOverride, setSelectedLevelOverride] = useState<number | null>(null)
  const [railContentWidth, setRailContentWidth] = useState(0)
  const [railViewportWidth, setRailViewportWidth] = useState(0)
  const selectedLevel = selectedLevelOverride ?? defaultSelectedLevel
  const progressWidth = `${Math.max(workerProfile ? 8 : 0, Math.round(model.progress * 100))}%`
  const progressNow = Math.min(model.points, model.nextThreshold)
  const selectedMilestone = model.milestones.find((milestone) => milestone.level === selectedLevel) ?? model.milestones[0]!
  const detailReveal = useSharedValue(1)
  const railScrollX = useSharedValue(0)
  const railScrollableWidth = Math.max(0, railContentWidth - railViewportWidth)
  const railThumbWidth = railScrollableWidth > 0 && railViewportWidth > 0
    ? Math.max(40, Math.min(96, Math.round((railViewportWidth / railContentWidth) * railViewportWidth)))
    : 64
  const railThumbTravel = Math.max(0, railViewportWidth - railThumbWidth)
  const showRailIndicator = model.milestones.length > 4
  const handleSelectLevel = useCallback((level: number) => {
    setSelectedLevelOverride(level)
  }, [])
  const handleLevelRailLayout = useCallback((event: LayoutChangeEvent) => {
    setRailViewportWidth(Math.round(event.nativeEvent.layout.width))
  }, [])
  const handleLevelRailContentSize = useCallback((width: number) => {
    setRailContentWidth(Math.round(width))
  }, [])
  const handleLevelRailScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    railScrollX.value = event.nativeEvent.contentOffset.x
  }, [railScrollX])
  useEffect(() => {
    cancelAnimation(detailReveal)
    detailReveal.value = 0
    detailReveal.value = reduceMotion
      ? withTiming(1, { duration: 100 })
      : withSpring(1, motionTokens.liquid.pill)

    return () => {
      cancelAnimation(detailReveal)
    }
  }, [detailReveal, reduceMotion, selectedLevel])

  const detailRevealStyle = useAnimatedStyle(() => ({
    opacity: 0.70 + detailReveal.value * 0.30,
    transform: [
      { translateY: (1 - detailReveal.value) * 8 },
      { scale: 0.985 + detailReveal.value * 0.015 },
    ],
  }), [detailReveal])
  const railThumbStyle = useAnimatedStyle(() => {
    const progress = railScrollableWidth > 0 ? Math.min(1, Math.max(0, railScrollX.value / railScrollableWidth)) : 0

    return {
      transform: [{ translateX: progress * railThumbTravel }],
    }
  }, [railScrollableWidth, railThumbTravel, railScrollX])

  return (
    <View style={[styles.profileLevelCard, workerProfilePanelSurface(tokens)]} testID="worker-profile-level-card">
      <WorkerProfileMaterialChrome testID="worker-profile-level-crisp-shell" variant="panel" />
      <View pointerEvents="none" style={[styles.profileLevelCornerAura, workerProfileLevelCornerAura(tokens)]} testID="worker-profile-level-corner-aura" />
      <View style={styles.profileLevelTop}>
        <View style={[styles.profileLevelOrb, workerProfileLevelOrbSurface(tokens)]} testID="worker-profile-level-orb">
          <Text style={[styles.profileLevelOrbMeta, { color: tokens.primary }]} numberOfLines={1}>
            {language === 'en' ? 'Lv' : 'Cấp'}
          </Text>
          <Text style={[styles.profileLevelOrbValue, { color: tokens.primary }]} numberOfLines={1}>
            {workerProfile ? model.level : ''}
          </Text>
        </View>
        <View style={styles.profileLevelCopy}>
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {language === 'en' ? 'Worker level' : 'Cấp thợ'}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1} testID="worker-profile-level-title">
            {model.title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {model.body}
          </Text>
        </View>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ max: model.nextThreshold, min: model.currentFloor, now: progressNow }}
        style={[styles.profileLevelProgressTrack, workerProfileProgressTrackSurface(tokens)]}
        testID="worker-profile-level-progress"
      >
        <View style={[styles.profileLevelProgressFill, workerProfileProgressFillSurface(tokens), { width: progressWidth }]} testID="worker-profile-level-progress-fill" />
      </View>
      <Text style={[styles.profileLevelNext, { color: tokens.muted }]} numberOfLines={2} testID="worker-profile-level-next">
        {model.nextLabel}
      </Text>
      <View style={styles.profileLevelSignalGrid}>
        {model.signals.map((signal) => (
          <View key={signal.id} style={[styles.profileLevelSignal, workerProfileLevelSignalSurface(tokens)]} testID={`worker-profile-level-signal-${signal.id}`}>
            <View pointerEvents="none" style={[styles.profileLevelSignalGlass, workerProfileLevelSignalGlass(tokens)]} testID="worker-profile-level-signal-glass-layer" />
            <View pointerEvents="none" style={[styles.profileLevelSignalTopEdge, workerProfileLevelSignalTopEdge(tokens)]} />
            <Text style={[styles.profileLevelSignalLabel, { color: tokens.muted }]} numberOfLines={1}>
              {signal.label}
            </Text>
            <Text style={[styles.profileLevelSignalValue, { color: tokens.ink }]} numberOfLines={1}>
              {signal.value}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.profileLevelLadder} testID="worker-profile-level-ladder">
        <View style={styles.profileLevelLadderHeader}>
          <Text style={[styles.profileLevelLadderTitle, { color: tokens.ink }]} numberOfLines={1}>
            {language === 'en' ? 'Level path' : 'Lộ trình cấp'}
          </Text>
          <Text style={[styles.profileLevelLadderMax, { color: tokens.primary }]} numberOfLines={1} testID="worker-profile-level-max">
            {language === 'en' ? `Level ${workerProfileLevelMax} max` : `Cấp tối đa ${workerProfileLevelMax}`}
          </Text>
        </View>
        <ScrollView
          horizontal
          onContentSizeChange={handleLevelRailContentSize}
          onLayout={handleLevelRailLayout}
          onScroll={handleLevelRailScroll}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.profileLevelRail}
          contentContainerStyle={styles.profileLevelRailContent}
          testID="worker-profile-level-rail"
        >
          {model.milestones.map((milestone, index) => (
            <View key={milestone.level} style={styles.profileLevelRailItem}>
              {index > 0 ? <WorkerProfileLevelRailSpacer /> : null}
              <WorkerProfileLevelChip
                language={language}
                milestone={milestone}
                onSelect={handleSelectLevel}
                reduceMotion={reduceMotion}
                selected={milestone.level === selectedMilestone.level}
                tokens={tokens}
              />
            </View>
          ))}
        </ScrollView>
        {showRailIndicator ? (
          <View
            pointerEvents="none"
            style={styles.profileLevelScrollIndicatorSlot}
            testID="worker-profile-level-liquid-scroll-indicator"
          >
            <View style={[styles.profileLevelScrollIndicatorTrack, workerProfileLevelScrollTrackSurface(tokens)]}>
              <View style={[styles.profileLevelScrollIndicatorTopEdge, workerProfileLevelScrollEdgeSurface(tokens)]} />
              <Animated.View
                style={[
                  styles.profileLevelScrollIndicatorThumb,
                  workerProfileLevelScrollThumbSurface(tokens),
                  { width: railThumbWidth },
                  railThumbStyle,
                ]}
                testID="worker-profile-level-liquid-scroll-thumb"
              >
                <View style={[styles.profileLevelScrollIndicatorSheen, workerProfileLevelScrollSheenSurface(tokens)]} />
              </Animated.View>
            </View>
          </View>
        ) : null}
        <Animated.View
          style={[styles.profileLevelDetail, workerProfileLevelMilestoneSurface(tokens, selectedMilestone.state), detailRevealStyle]}
          testID="worker-profile-level-detail"
        >
          <View style={[styles.profileLevelMilestoneBadge, workerProfileLevelMilestoneBadgeSurface(tokens, selectedMilestone.state)]}>
            <Text style={[styles.profileLevelMilestoneBadgeMeta, { color: tokens.primary }]} numberOfLines={1}>
              {language === 'en' ? 'Lv' : 'Cấp'}
            </Text>
            <Text style={[styles.profileLevelMilestoneBadgeValue, { color: tokens.ink }]} numberOfLines={1}>
              {selectedMilestone.level}
            </Text>
          </View>
          <View style={styles.profileLevelMilestoneCopy}>
            <View style={styles.profileLevelMilestoneHead}>
              <Text style={[styles.profileLevelMilestoneTitle, { color: tokens.ink }]} numberOfLines={1}>
                {selectedMilestone.title}
              </Text>
              <Text style={[styles.profileLevelMilestoneState, { color: tokens.primary }]} numberOfLines={1}>
                {selectedMilestone.stateLabel}
              </Text>
            </View>
            <Text
              style={[styles.profileLevelMilestoneText, { color: tokens.muted }]}
              numberOfLines={3}
              testID="worker-profile-level-selected-requirement"
            >
              {selectedMilestone.requirement}
            </Text>
            <Text
              style={[styles.profileLevelMilestoneReward, { color: tokens.ink }]}
              numberOfLines={3}
              testID="worker-profile-level-selected-reward"
            >
              {selectedMilestone.reward}
            </Text>
          </View>
        </Animated.View>
      </View>
    </View>
  )
}

function WorkerProfileContent() {
  const { copy, language, tokens } = useWorkerUi()
  const { replace } = useRouter()
  const { role, signOut } = useAuth()
  const { workerProfile } = useFrontendWorkflow()
  const [showVerificationForm, setShowVerificationForm] = useState(false)
  const workerSignOutLabel = language === 'en' ? 'Sign out' : 'Đăng xuất'
  const adminAuditSwitchLabel = language === 'en' ? 'Back to login' : 'Về đăng nhập'
  const verificationCopy = workerVerificationCopy[language]
  const serviceSkillsLabel = workerProfile?.service_types.length
    ? workerProfile.service_types.map((service) => localizedServiceLabel(service, language)).join(' · ')
    : appCopy[language].common.noData
  const workingAreaLabel = workerProfile?.districts.length
    ? workerProfile.districts.map((district) => localizedWorkerAreaLabel(district, language)).join(' · ')
    : appCopy[language].common.noData
  const verificationStatus = workerProfile?.verification_status ?? 'draft'
  const profileRows: { icon: WorkerImageIconName; meta: string; title: string }[] = [
    { icon: 'profileIdentity', meta: localizedWorkerVerificationStatus(verificationStatus, language), title: language === 'en' ? 'Identity verification' : 'Xác minh danh tính' },
    { icon: 'profileSkills', meta: serviceSkillsLabel, title: language === 'en' ? 'Service skills' : 'Kỹ năng dịch vụ' },
    { icon: 'profileServiceArea', meta: workingAreaLabel, title: language === 'en' ? 'Working area' : 'Khu vực làm việc' },
  ]
  const profileStatusValue = localizedWorkerVerificationStatus(verificationStatus, language)
  const submittedProfileValue = workerProfile && verificationStatus !== 'draft'
    ? (language === 'en' ? 'Submitted' : 'Đã gửi')
    : profileStatusValue
  const profileSyncLabel = language === 'en' ? 'Synced from verification' : 'Đồng bộ từ xác thực'
  const profileSyncMeta = workerProfile
    ? localizedWorkerVerificationStatus(workerProfile.verification_status, language)
    : appCopy[language].common.noData
  const canSubmitVerification = role === 'worker' &&
    !workerProfile?.is_suspended &&
    !['approved', 'suspended'].includes(verificationStatus)
  const showProfileSyncPreview = role === 'admin' && Boolean(workerProfile) && !showVerificationForm

  return (
    <>
      <GlassSurface material="liquid" mode={tokens.mode} style={[styles.profileHead, workerProfileHeroSurface(tokens)]} testID="worker-profile-verification-card" variant="hero">
        <WorkerProfileMaterialChrome testID="worker-profile-hero-crisp-shell" variant="hero" />
        <SubtleGlassHighlight liquid />
        <View style={styles.profileHeroTop}>
          <View style={styles.profileAvatarHero}>
            <WorkerImageIcon frameSize={50} name="profileAvatar" size={50} />
          </View>
          <View style={styles.profileTitleStack}>
            <Text style={[styles.profileName, { color: tokens.ink }]} numberOfLines={1}>
              {copy.profile.name}
            </Text>
            <Text style={[styles.profileSubtitle, { color: tokens.muted }]} numberOfLines={2}>
              {language === 'en' ? 'Status and service skills' : 'Trạng thái và kỹ năng dịch vụ'}
            </Text>
          </View>
        </View>
        {role === 'worker' ? (
          <View style={styles.profileHeroAction}>
            <PressButton label={workerSignOutLabel} onPress={() => void signOut()} testID="worker-profile-sign-out" />
          </View>
        ) : role === 'admin' ? (
          <View style={styles.profileHeroAction}>
            <PressButton label={adminAuditSwitchLabel} onPress={() => replace('/(auth)/login')} testID="worker-admin-audit-switch" />
          </View>
        ) : null}
      </GlassSurface>
      {canSubmitVerification && showVerificationForm ? <WorkerVerificationForm /> : null}

      <View style={styles.profileMiniGrid} testID="worker-profile-mini-status-grid">
        <View style={[styles.profileMiniCard, workerProfileMiniSurface(tokens)]}>
          <WorkerProfileMaterialChrome testID="worker-profile-mini-crisp-shell" variant="mini" />
          <WorkerImageIcon frameSize={48} name="profileVerified" size={48} style={styles.profileMiniImage} />
          <Text style={[styles.profileMiniTitle, { color: tokens.ink }]} numberOfLines={1}>
            {profileStatusValue}
          </Text>
          <Text style={[styles.profileMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
            {language === 'en' ? 'Verification' : 'Xác minh'}
          </Text>
        </View>
        <View style={[styles.profileMiniCard, workerProfileMiniSurface(tokens)]}>
          <WorkerProfileMaterialChrome testID="worker-profile-mini-crisp-shell" variant="mini" />
          <WorkerImageIcon frameSize={48} name="profileIdentity" size={48} style={styles.profileMiniImage} />
          <Text style={[styles.profileMiniTitle, { color: tokens.ink }]} numberOfLines={1}>
            {submittedProfileValue}
          </Text>
          <Text style={[styles.profileMiniMeta, { color: tokens.muted }]} numberOfLines={1}>
            {language === 'en' ? 'Worker profile' : 'Hồ sơ thợ'}
          </Text>
        </View>
      </View>

      <WorkerProfileLevelCard workerProfile={workerProfile} />

      {showProfileSyncPreview ? (
        <View style={[styles.profileSyncPreview, workerProfilePanelSurface(tokens)]} testID="worker-profile-sync-preview">
          <WorkerProfileMaterialChrome testID="worker-profile-sync-crisp-shell" variant="panel" />
          <View style={styles.profileSyncPreviewTop}>
            <Text style={[styles.cardTitle, { color: tokens.ink, flex: 1 }]} numberOfLines={1}>
              {profileSyncLabel}
            </Text>
            <Text style={[styles.statusPill, { backgroundColor: tokens.mint, color: tokens.primary }]} numberOfLines={1}>
              {profileSyncMeta}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.listCard, styles.profileListCard, workerProfilePanelSurface(tokens)]} testID="worker-profile-list-groups">
        <WorkerProfileMaterialChrome testID="worker-profile-list-crisp-shell" variant="panel" />
        {profileRows.map((row) => (
          <ProfileListRow key={row.title} icon={row.icon} title={row.title} meta={row.meta} />
        ))}
      </View>

      {canSubmitVerification && !showVerificationForm ? (
        <View style={[styles.profileSyncPreview, workerProfilePanelSurface(tokens)]} testID="worker-profile-verification-collapsed">
          <WorkerProfileMaterialChrome testID="worker-profile-verification-collapsed-crisp-shell" variant="collapsed" />
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {verificationCopy.kicker}
          </Text>
          <Text style={[styles.cardTitle, { color: tokens.ink }]} numberOfLines={1}>
            {verificationCopy.title}
          </Text>
          <Text style={[styles.bodyText, { color: tokens.muted }]} numberOfLines={3}>
            {verificationCopy.savedBody}
          </Text>
          <View style={styles.actionRow}>
            <PressButton label={verificationCopy.submit} onPress={() => setShowVerificationForm(true)} testID="worker-profile-open-verification-form" />
          </View>
        </View>
      ) : null}

      <View style={[styles.preferenceCard, workerProfilePreferenceSurface(tokens)]} testID="worker-profile-preference-toggles">
        <WorkerProfileMaterialChrome testID="worker-profile-preference-crisp-shell" variant="preference" />
        <ThemeToggle />
        <LanguageToggle />
      </View>
    </>
  )
}

function ThemeToggle() {
  const { copy, mode, tokens } = useWorkerUi()
  const nextMode = mode === 'light' ? 'dark' : 'light'
  const currentModeLabel = mode === 'light' ? copy.frame.themeLight : copy.frame.themeDark

  return (
    <Pressable
      accessibilityLabel={mode === 'light' ? copy.frame.themeDark : copy.frame.themeLight}
      accessibilityRole="switch"
      accessibilityState={{ checked: mode === 'dark' }}
      onPress={() => setWorkerThemeMode(nextMode)}
      style={({ pressed }) => [styles.preferenceRow, workerProfilePreferenceRowSurface(tokens), pressed ? styles.pressed : null]}
      testID="worker-dark-mode-toggle"
    >
      <View style={styles.preferenceTitle}>
        <WorkerImageIcon frameSize={44} name="settingTheme" size={44} style={styles.preferenceImage} />
        <View style={styles.preferenceCopy}>
          <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.profile.theme}
          </Text>
        </View>
      </View>
      <Text style={[styles.preferenceMetaAction, { color: tokens.muted }]} numberOfLines={1}>
        {currentModeLabel}
      </Text>
    </Pressable>
  )
}

function LanguageToggle() {
  const { copy, language, tokens } = useWorkerUi()
  const nextLanguage = language === 'vi' ? 'en' : 'vi'
  const currentLanguageLabel = language === 'vi' ? 'Tiếng Việt' : 'English'

  return (
    <Pressable
      accessibilityLabel={copy.frame.lang}
      accessibilityRole="switch"
      accessibilityState={{ checked: language === 'en' }}
      onPress={() => setAppLanguage(nextLanguage)}
      style={({ pressed }) => [styles.preferenceRow, workerProfilePreferenceRowSurface(tokens), pressed ? styles.pressed : null]}
      testID="worker-language-toggle"
    >
      <View style={styles.preferenceTitle}>
        <WorkerImageIcon frameSize={44} name="settingLanguage" size={44} style={styles.preferenceImage} />
        <View style={styles.preferenceCopy}>
          <Text style={[styles.listTitle, { color: tokens.ink }]} numberOfLines={1}>
            {copy.profile.language}
          </Text>
        </View>
      </View>
      <Text style={[styles.preferenceMetaAction, { color: tokens.muted }]} numberOfLines={1}>
        {currentLanguageLabel}
      </Text>
    </Pressable>
  )
}

function ProfileListRow({ icon, meta, title }: { icon: WorkerImageIconName; meta: string; title: string }) {
  const { tokens } = useWorkerUi()

  return (
    <View style={[styles.profileListRow, workerProfileRowSurface(tokens)]}>
      <WorkerImageIcon frameSize={44} name={icon} size={44} style={styles.profileListImage} />
      <Text style={[styles.profileListTitle, { color: tokens.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.84} style={[styles.profileListMeta, { color: tokens.muted }]} numberOfLines={1}>
        {meta}
      </Text>
    </View>
  )
}
