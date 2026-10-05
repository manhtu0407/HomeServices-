import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { CustomerServiceId, ServiceType, WorkerKaelChatMode } from '@nestscout/shared'

import { customerV21BookingWorkartAssets } from '@/components/customer/ui/assets'
import { ProfileSettingsGlyph } from '@/components/customer/profile/profile-settings-icons'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { useDockScrollHandler } from '@/components/ui/dock-scroll-state'
import type { AppLanguage } from '@/lib/app-language'
import { isWorkerOperationalJobStatus } from '@/lib/frontend-workflow/helpers'
import { stagePendingWorkerKaelDraft, type PendingWorkerKaelDraftScope } from '@/lib/pending-worker-kael-draft'
import type { WorkerV5Runtime } from '../worker-v5-runtime'
import { getWorkerV5Screen } from '../dock/screens'
import type { WorkerV5ScreenDefinition } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { workerV5JobsDestinationScreenId } from '../ui/screen-navigation'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'
import { WorkerV5AvailabilityCard } from './availability-surfaces'
import { WorkerHomeProductionEarningsCard } from './worker-home-production-earnings-card'
import { WorkerHomeProductionIcon, type WorkerHomeProductionIconName } from './worker-home-production-icon'
import { buildWorkerHomeProductionModel, type WorkerHomeProductionModel } from './worker-home-production-model'
import type { WorkerEarningsPeriod } from '../earnings/overview-model'

const SERVICE_WORKART_KEY: Record<ServiceType, CustomerServiceId> = {
  cleaning: 'home_cleaning',
  electrical: 'electrical',
  handyman: 'handyman_minor_installation',
  hvac: 'hvac_basic_maintenance',
  plumbing: 'plumbing',
  upholstery: 'upholstery_care',
}

function workart(serviceType: ServiceType): ImageSourcePropType {
  return customerV21BookingWorkartAssets[SERVICE_WORKART_KEY[serviceType]]
}

function Header({
  avatarUploadBusy,
  avatarUrl,
  displayName,
  language,
  onPickAvatar,
  statusLabel,
  themeMode,
  workerDisplayCode,
}: {
  avatarUploadBusy: boolean
  avatarUrl: string | null
  displayName: string
  language: AppLanguage
  onPickAvatar: () => void
  statusLabel: string
  themeMode: 'dark' | 'light'
  workerDisplayCode: string
}) {
  const dark = themeMode === 'dark'
  return (
    <View style={styles.header} testID="worker-home-production-header">
      <Pressable
        accessibilityLabel={avatarUrl
          ? textByLanguage(language, 'Đổi ảnh đại diện', 'Change profile photo')
          : textByLanguage(language, 'Thêm ảnh đại diện', 'Add profile photo')}
        accessibilityRole="button"
        accessibilityState={{ busy: avatarUploadBusy }}
        disabled={avatarUploadBusy}
        onPress={onPickAvatar}
        style={[styles.avatarButton, dark && styles.avatarButtonDark]}
      >
        {avatarUrl ? (
          <Image contentFit="cover" source={{ uri: avatarUrl }} style={styles.avatar} testID="worker-home-production-avatar" />
        ) : (
          <View style={styles.avatarPlaceholder} testID="worker-home-production-avatar-placeholder">
            <ProfileSettingsGlyph color={dark ? '#F1F6F4' : '#0A6F60'} name="personal" testID="worker-home-production-avatar-placeholder-glyph" />
          </View>
        )}
        <View pointerEvents="none" style={[styles.avatarCameraBadge, dark && styles.avatarCameraBadgeDark]}>
          <WorkerHomeProductionIcon color={dark ? '#F1F6F4' : '#0A6F60'} name="camera" size={12} />
        </View>
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={[styles.headerTitle, dark && styles.textDark]}>{`Hello, ${displayName}`}</Text>
        <Text style={[styles.headerMeta, dark && styles.mutedDark]}>{textByLanguage(language, `Mã thợ ${workerDisplayCode}`, `Worker ID ${workerDisplayCode}`)}</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={[styles.statusLabel, dark && styles.mutedDark]} testID="worker-home-production-profile-status">{statusLabel}</Text>
        </View>
      </View>
    </View>
  )
}

function Hero({
  language,
  mode,
  onSearch,
  reduceMotion,
  searchError,
  searchMode,
  setSearchMode,
}: {
  language: AppLanguage
  mode: WorkerHomeProductionModel['mode']
  onSearch: (message: string, mode: WorkerKaelChatMode) => boolean
  reduceMotion: boolean
  searchError: string | null
  searchMode: WorkerKaelChatMode
  setSearchMode: (mode: WorkerKaelChatMode) => void
}) {
  const inputRef = useRef<TextInput>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [query, setQuery] = useState('')
  const title = mode === 'execution'
    ? textByLanguage(language, 'Tiếp tục đúng bước công việc', 'Continue the current work step')
    : textByLanguage(language, 'Việc tốt mỗi ngày,\nthu nhập vững từng bước', 'Good work every day,\nsteady income step by step')
  const detail = mode === 'execution'
    ? textByLanguage(language, 'Công việc hiện tại luôn được ưu tiên', 'Current work always comes first')
    : textByLanguage(language, 'Việc phù hợp  •  Gần bạn  •  Thu nhập cao', 'Relevant work  •  Nearby  •  Higher earnings')
  const placeholder = searchMode === 'normal'
    ? textByLanguage(language, 'Nhắn Kael để được hỗ trợ...', 'Message Kael for support...')
    : mode === 'execution'
      ? textByLanguage(language, 'Hỏi Kael về công việc hiện tại...', 'Ask Kael about the current job...')
      : textByLanguage(language, 'Tìm việc theo khu vực, kỹ năng...', 'Find work by area or skill...')
  const submit = () => {
    if (onSearch(query, searchMode)) return
    inputRef.current?.focus()
  }

  return (
    <LinearGradient colors={['#38BAAF', '#7ACCC6', '#ACE0DC', '#C4E9E5', '#DDEDE8']} end={{ x: 1, y: 0.5 }} locations={[0, 0.2, 0.33, 0.5, 1]} start={{ x: 0, y: 0.5 }} style={styles.hero} testID="worker-home-production-hero">
      <Image accessibilityIgnoresInvertColors contentFit="cover" source={workerV5CapturedIconAssets.homeWorkerHero} style={styles.heroArtwork} />
      <View style={styles.heroCopy}>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroDetail}>{detail}</Text>
      </View>
      <View style={styles.heroActions}>
        <View style={styles.heroSearch} testID="worker-home-production-kael-search">
          <Pressable
            accessibilityLabel={textByLanguage(language, 'Tìm với Kael', 'Search with Kael')}
            accessibilityRole="button"
            hitSlop={8}
            onPress={submit}
            style={({ pressed }) => pressed && !reduceMotion && styles.searchIconPressed}
            testID="worker-home-production-kael-search-submit"
          >
            <WorkerHomeProductionIcon color="#536B7F" name="search" size={15.5} />
          </Pressable>
          <TextInput spellCheck={false}
            accessibilityHint={textByLanguage(language, 'Nội dung chỉ được điền sẵn trong Kael và chưa tự gửi.', 'The text is only prefilled in Kael and is not sent automatically.')}
            accessibilityLabel={placeholder}
            maxLength={1_200}
            onChangeText={setQuery}
            onSubmitEditing={submit}
            placeholder={placeholder}
            placeholderTextColor="#66768A"
            ref={inputRef}
            returnKeyType="search"
            style={styles.heroSearchInput}
            testID="worker-home-production-kael-search-input"
            value={query}
          />
        </View>
        <Pressable accessibilityLabel={textByLanguage(language, 'Chọn luồng Kael', 'Choose Kael flow')} accessibilityRole="button" accessibilityState={{ expanded: filterOpen }} onPress={() => setFilterOpen(true)} style={({ pressed }) => [styles.heroFilter, pressed && !reduceMotion && styles.pressed]} testID="worker-home-production-kael-filter">
          <WorkerHomeProductionIcon color="#29495F" name="options" size={15} />
          <Text style={styles.heroFilterLabel}>{searchMode === 'intake' ? 'Kael' : textByLanguage(language, 'Chat', 'Chat')}</Text>
        </Pressable>
      </View>
      {searchError ? <Text accessibilityLiveRegion="polite" style={styles.heroSearchError}>{searchError}</Text> : null}
      <Modal animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setFilterOpen(false)} transparent visible={filterOpen}>
        <Pressable accessibilityLabel={textByLanguage(language, 'Đóng bộ chọn luồng Kael', 'Close Kael flow selector')} accessibilityRole="button" onPress={() => setFilterOpen(false)} style={styles.modeSheetBackdrop} testID="worker-home-production-kael-mode-backdrop">
          <Pressable accessibilityRole="none" onPress={(event) => event.stopPropagation()} style={styles.modeSheet} testID="worker-home-production-kael-mode-sheet">
            <Text style={styles.modeSheetTitle}>{textByLanguage(language, 'Chọn cách Kael hỗ trợ', 'Choose how Kael helps')}</Text>
            {([
              ['intake', textByLanguage(language, 'Kael nhận việc', 'Kael job intake'), textByLanguage(language, 'Tìm và giải thích cơ hội; bạn vẫn tự quyết định.', 'Find and explain opportunities; you still decide.')],
              ['normal', textByLanguage(language, 'Chat thường', 'Normal chat'), textByLanguage(language, 'Hỏi đáp và hỗ trợ nhanh.', 'Quick questions and support.')],
            ] as const).map(([value, label, description]) => {
              const selected = searchMode === value
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={value}
                  onPress={() => {
                    setSearchMode(value)
                    setFilterOpen(false)
                  }}
                  style={[styles.modeOption, selected && styles.modeOptionSelected]}
                  testID={`worker-home-production-kael-mode-${value}`}
                >
                  <View style={styles.modeOptionCopy}>
                    <Text style={styles.modeOptionLabel}>{label}</Text>
                    <Text style={styles.modeOptionDescription}>{description}</Text>
                  </View>
                  <View style={[styles.modeRadio, selected && styles.modeRadioSelected]} />
                </Pressable>
              )
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  )
}

function Stats({ language, model, onOpenJobs, onOpenProfile, themeMode }: {
  language: AppLanguage
  model: WorkerHomeProductionModel
  onOpenJobs: () => void
  onOpenProfile: () => void
  themeMode: 'dark' | 'light'
}) {
  const dark = themeMode === 'dark'
  const items: { icon: WorkerHomeProductionIconName; key: string; stat: { label: string; value: string | null }; onPress: () => void }[] = [
    { icon: 'inbox', key: 'opportunities', onPress: onOpenJobs, stat: model.stats.opportunities },
    { icon: 'activity', key: 'active', onPress: onOpenJobs, stat: model.stats.activeJobs },
    { icon: 'check', key: 'completed', onPress: onOpenProfile, stat: model.stats.completedJobs },
    { icon: 'star', key: 'rating', onPress: onOpenProfile, stat: model.stats.rating },
  ]
  return (
    <View style={[styles.stats, dark && styles.cardDark]} testID="worker-home-production-stats">
      {items.map((item, index) => (
        <Pressable accessibilityLabel={`${item.stat.label}, ${item.stat.value ?? textByLanguage(language, 'chưa ghi nhận', 'unavailable')}`} accessibilityRole="button" key={item.key} onPress={item.onPress} style={styles.statItem} testID={`worker-home-production-stat-${item.key}`}>
          {index > 0 ? <View style={[styles.statDivider, dark && styles.dividerDark]} /> : null}
          <View style={styles.statIcon}>
            <WorkerHomeProductionIcon color="#079C83" name={item.icon} size={17} />
          </View>
          <Text style={[styles.statValue, dark && styles.textDark]}>{item.stat.value ?? '—'}</Text>
          <Text numberOfLines={2} style={[styles.statLabel, dark && styles.mutedDark]}>{item.stat.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function QuickActions({ language, onOpenEarnings, onOpenJobs, onOpenProfile, reduceMotion, themeMode }: {
  language: AppLanguage
  onOpenEarnings: () => void
  onOpenJobs: () => void
  onOpenProfile: () => void
  reduceMotion: boolean
  themeMode: 'dark' | 'light'
}) {
  const dark = themeMode === 'dark'
  const actions: { icon: WorkerHomeProductionIconName; key: string; label: string; onPress: () => void }[] = [
    { icon: 'briefcase', key: 'jobs', label: textByLanguage(language, 'Nhận việc', 'Find work'), onPress: onOpenJobs },
    { icon: 'calendar', key: 'schedule', label: textByLanguage(language, 'Lịch làm việc', 'Work schedule'), onPress: onOpenJobs },
    { icon: 'coins', key: 'earnings', label: textByLanguage(language, 'Thu nhập', 'Earnings'), onPress: onOpenEarnings },
    { icon: 'person', key: 'profile', label: textByLanguage(language, 'Hồ sơ', 'Profile'), onPress: onOpenProfile },
  ]
  return (
    <View style={[styles.quickActions, dark && styles.cardDark]} testID="worker-home-production-quick-actions">
      {actions.map((item, index) => (
        <Pressable accessibilityRole="button" key={item.key} onPress={item.onPress} style={({ pressed }) => [styles.quickAction, pressed && !reduceMotion && styles.quickActionPressed]} testID={`worker-home-production-action-${item.key}`}>
          {index > 0 ? <View style={[styles.divider, dark && styles.dividerDark]} /> : null}
          <WorkerHomeProductionIcon color="#079C83" name={item.icon} size={23} />
          <Text style={[styles.quickActionLabel, dark && styles.textDark]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  )
}

function SectionHeader({ action, compact = false, onPress, themeMode, title }: { action: string; compact?: boolean; onPress: () => void; themeMode: 'dark' | 'light'; title: string }) {
  const dark = themeMode === 'dark'
  return (
    <View style={[styles.sectionHeader, compact && styles.sectionHeaderCompact]}>
      <Text style={[styles.sectionTitle, dark && styles.textDark]}>{title}</Text>
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable>
    </View>
  )
}

function Opportunity({ language, model, onOpen, onOpenAll, reduceMotion, themeMode }: {
  language: AppLanguage
  model: WorkerHomeProductionModel
  onOpen: (broadcastId: string) => void
  onOpenAll: () => void
  reduceMotion: boolean
  themeMode: 'dark' | 'light'
}) {
  const dark = themeMode === 'dark'
  const jobs = (model.featuredOpportunity
    ? [model.featuredOpportunity, ...model.secondaryOpportunities]
    : []).slice(0, 2)
  return (
    <View style={styles.opportunitySection} testID="worker-home-production-opportunities">
      <SectionHeader action={textByLanguage(language, 'Xem tất cả', 'See all')} onPress={onOpenAll} themeMode={themeMode} title={textByLanguage(language, 'Việc phù hợp cho bạn', 'Relevant work for you')} />
      {jobs.length > 0 ? (
        <View style={styles.opportunityList} testID="worker-home-production-opportunity-list">
          {jobs.map((job, index) => (
            <Pressable accessibilityRole="button" key={job.id} onPress={() => job.broadcastId && onOpen(job.broadcastId)} style={({ pressed }) => [styles.jobCard, dark && styles.cardDark, pressed && !reduceMotion && styles.pressed]} testID={index === 0 ? 'worker-home-production-featured-opportunity' : `worker-home-production-opportunity-${index + 1}`}>
              <Image accessibilityIgnoresInvertColors contentFit="cover" source={workart(job.serviceType)} style={styles.jobArtwork} />
              <Text numberOfLines={1} style={[styles.jobTitle, dark && styles.textDark]}>{job.title}</Text>
              <Text numberOfLines={1} style={[styles.jobMeta, dark && styles.mutedDark]}>{job.location}</Text>
              <Text numberOfLines={1} style={[styles.jobMeta, dark && styles.mutedDark]}>{job.scheduledLabel}</Text>
              <Text style={styles.opportunityEarning}>{job.earningLabel ?? textByLanguage(language, 'Chưa ghi nhận', 'Unavailable')}</Text>
              <View style={[styles.jobStatusPill, dark && styles.jobStatusPillDark]}>
                <Text style={[styles.jobStatus, dark && styles.jobStatusDark]}>{job.statusLabel}</Text>
              </View>
            </Pressable>
          ))}
          {model.opportunityState === 'stale' ? (
            <Text accessibilityLiveRegion="polite" style={[styles.opportunityStateText, dark && styles.mutedDark]}>
              {textByLanguage(language, 'Chưa thể cập nhật cơ hội.', 'Opportunities could not be refreshed.')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={[styles.compactEmpty, dark && styles.cardDark]}><Text style={[styles.compactEmptyText, dark && styles.mutedDark]}>{model.mode === 'execution'
          ? textByLanguage(language, 'Công việc hiện tại đang được ưu tiên.', 'Current work is taking priority.')
          : model.opportunityState === 'loading'
            ? textByLanguage(language, 'Đang tải cơ hội...', 'Loading opportunities...')
            : model.opportunityState === 'unavailable' || model.opportunityState === 'stale'
              ? textByLanguage(language, 'Chưa thể tải cơ hội.', 'Opportunities could not be loaded.')
              : textByLanguage(language, 'Chưa có cơ hội còn hiệu lực.', 'No active opportunity.')}</Text></View>
      )}
    </View>
  )
}

function TodayJob({ language, model, onOpen, reduceMotion, themeMode }: {
  language: AppLanguage
  model: WorkerHomeProductionModel
  onOpen: () => void
  reduceMotion: boolean
  themeMode: 'dark' | 'light'
}) {
  const dark = themeMode === 'dark'
  const job = model.todayJob
  return (
    <View style={styles.scheduleSection} testID="worker-home-production-schedule">
      <SectionHeader action={textByLanguage(language, 'Xem lịch', 'View schedule')} compact onPress={onOpen} themeMode={themeMode} title={textByLanguage(language, 'Lịch làm việc hôm nay', "Today's work")} />
      {job ? (
        <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.scheduleCard, dark && styles.cardDark, pressed && !reduceMotion && styles.pressed]} testID="worker-home-production-today-job">
          <Text style={[styles.scheduleTime, dark && styles.textDark]}>{job.scheduledLabel}</Text>
          <View style={styles.scheduleArtworkPanel}>
            <Image accessibilityIgnoresInvertColors contentFit="cover" source={workart(job.serviceType)} style={styles.scheduleArtwork} />
            <LinearGradient colors={['rgba(255,254,255,0)', themeMode === 'dark' ? '#17322C' : '#FFFEFF']} end={{ x: 1, y: 0 }} pointerEvents="none" start={{ x: 0, y: 0 }} style={styles.scheduleArtworkWash} />
          </View>
          <View style={styles.scheduleCopy}>
            <Text numberOfLines={2} style={[styles.scheduleTitle, dark && styles.textDark]}>{job.title}</Text>
            <Text numberOfLines={1} style={[styles.scheduleMeta, dark && styles.mutedDark]}>{job.location}</Text>
          </View>
          <View style={styles.jobAside}>
            {job.earningLabel ? <Text style={styles.scheduleEarning}>{job.earningLabel}</Text> : null}
            <View style={[styles.scheduleStatusPill, dark && styles.jobStatusPillDark]}>
              <Text style={[styles.scheduleStatus, dark && styles.jobStatusDark]}>{job.statusLabel}</Text>
            </View>
          </View>
        </Pressable>
      ) : (
        <View style={[styles.compactEmpty, dark && styles.cardDark]}><Text style={[styles.compactEmptyText, dark && styles.mutedDark]}>{textByLanguage(language, 'Hôm nay chưa có công việc đã lên lịch.', 'No work is scheduled for today.')}</Text></View>
      )}
    </View>
  )
}

function ProfilePrompt({ language, model, onOpen, reduceMotion, themeMode }: {
  language: AppLanguage
  model: WorkerHomeProductionModel
  onOpen: () => void
  reduceMotion: boolean
  themeMode: 'dark' | 'light'
}) {
  const dark = themeMode === 'dark'
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.profilePrompt, dark && styles.profilePromptDark, pressed && !reduceMotion && styles.pressed]} testID="worker-home-production-profile-prompt">
      <View style={styles.profilePromptIcon}>
        <WorkerHomeProductionIcon color="#00A88B" name="shield" size={20} />
      </View>
      <View style={styles.profilePromptCopy}>
        <Text style={styles.profilePromptTitle}>{model.profilePrompt.title}</Text>
        <Text style={[styles.profilePromptDetail, dark && styles.mutedDark]}>{model.profilePrompt.detail}</Text>
      </View>
      <WorkerHomeProductionIcon color="#079C83" name="chevron-forward" size={16} />
    </Pressable>
  )
}

export function WorkerHomeProductionSurface({
  avatarUploadBusy,
  glass,
  language,
  minHeight,
  onOpenEarnings,
  onPickAvatar,
  openScreen,
  runtime,
  surfaceStyle,
  themeMode,
  workerKey,
}: {
  avatarUploadBusy: boolean
  glass: ReturnType<typeof useGlassAccessibility>
  language: AppLanguage
  minHeight: number
  onOpenEarnings: (period: WorkerEarningsPeriod) => void
  onPickAvatar: () => void
  openScreen: (target: WorkerV5ScreenDefinition | null) => void
  runtime: WorkerV5Runtime
  surfaceStyle: StyleProp<ViewStyle>
  themeMode: 'dark' | 'light'
  workerKey: string | null
}) {
  const { width } = useWindowDimensions()
  const onDockScroll = useDockScrollHandler()
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchMode, setSearchMode] = useState<WorkerKaelChatMode>('intake')
  const model = buildWorkerHomeProductionModel({
    broadcasts: runtime.workerBroadcasts ?? [],
    broadcastsError: runtime.workerBroadcastsError ?? null,
    broadcastsHydrated: runtime.workerBroadcastsHydrated ?? false,
    deal: runtime.state.deal,
    earnings: runtime.workerEarnings,
    earningsError: runtime.workerEarningsError,
    jobs: runtime.workerJobs,
    jobsHydrated: runtime.workerJobsHydrated,
    language,
    performanceInsights: runtime.workerPerformanceInsights,
    profile: runtime.workerProfile,
  })
  const openJobs = () => openScreen(getWorkerV5Screen(workerV5JobsDestinationScreenId(runtime.state.deal)))
  const openInbox = () => openScreen(getWorkerV5Screen('2.1-opportunity-inbox'))
  const openProfile = () => openScreen(getWorkerV5Screen(model.profilePrompt.kind === 'verified' ? '5.1-profile-overview' : '5.7-verification-documents'))
  const openEarnings = () => onOpenEarnings('month')
  const contentWidth = Math.min(Math.max(width - 34, 0), 394)
  const hasActiveJob = runtime.workerJobs.some((job) => isWorkerOperationalJobStatus(job.status))
  const openOpportunity = async (broadcastId: string) => {
    if (runtime.actions.workerSelectBroadcast(broadcastId)) {
      openScreen(getWorkerV5Screen('2.2-offer-detail'))
      return
    }
    await runtime.actions.workerRefresh()
  }
  const openKaelFromSearch = (message: string, mode: WorkerKaelChatMode) => {
    const scope: PendingWorkerKaelDraftScope = mode === 'normal'
      ? 'normal'
      : model.executionJob
        ? 'job'
        : 'opportunity'
    if (!stagePendingWorkerKaelDraft(workerKey, { message, mode, scope })) {
      setSearchError(textByLanguage(language, 'Nhập nội dung cần Kael hỗ trợ.', 'Enter what you want Kael to help with.'))
      return false
    }
    setSearchError(null)
    openScreen(getWorkerV5Screen(mode === 'intake' ? '3.2-kael-job-intake' : '3.1-kael-chat-normal'))
    return true
  }

  return (
    <SafeAreaView style={[styles.safeArea, surfaceStyle, themeMode === 'light' && styles.safeAreaLight]} testID="worker-v5-screen-1.1-worker-home">
      <ScrollView contentContainerStyle={[styles.scrollContent, { minHeight }]} onScroll={onDockScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} testID="worker-home-production-scroll">
        <View style={[styles.surface, { maxWidth: contentWidth }]} testID="worker-home-production-surface">
          <Header avatarUploadBusy={avatarUploadBusy} avatarUrl={runtime.workerProfile?.avatar_url ?? null} displayName={model.displayName} language={language} onPickAvatar={onPickAvatar} statusLabel={model.statusLabel} themeMode={themeMode} workerDisplayCode={model.workerDisplayCode} />
          <Hero language={language} mode={model.mode} onSearch={openKaelFromSearch} reduceMotion={glass.reduceMotion} searchError={searchError} searchMode={searchMode} setSearchMode={setSearchMode} />
          {runtime.workerProfile?.is_approved ? (
            <View style={styles.availabilitySlot} testID="worker-home-production-availability-slot">
              <WorkerV5AvailabilityCard
                availabilityGuardReady={runtime.workerJobsHydrated}
                avatarPresentation="workart"
                hasActiveJob={hasActiveJob}
                language={language}
                onOpenProfileSetup={openProfile}
                onToggleAvailability={runtime.actions.workerUpdateAvailability}
                profile={runtime.workerProfile}
                reduceMotion={glass.reduceMotion}
                reduceTransparency={glass.reduceTransparency}
                surface="default"
                themeMode={themeMode}
              />
            </View>
          ) : null}
          <WorkerHomeProductionEarningsCard earnings={runtime.workerEarnings} earningsError={runtime.workerEarningsError} language={language} onOpen={onOpenEarnings} onRetry={() => void runtime.actions.workerRefresh()} reduceMotion={glass.reduceMotion} themeMode={themeMode} />
          <Stats language={language} model={model} onOpenJobs={openJobs} onOpenProfile={openProfile} themeMode={themeMode} />
          <QuickActions language={language} onOpenEarnings={openEarnings} onOpenJobs={openInbox} onOpenProfile={openProfile} reduceMotion={glass.reduceMotion} themeMode={themeMode} />
          <Opportunity language={language} model={model} onOpen={(broadcastId) => void openOpportunity(broadcastId)} onOpenAll={openInbox} reduceMotion={glass.reduceMotion} themeMode={themeMode} />
          <TodayJob language={language} model={model} onOpen={openJobs} reduceMotion={glass.reduceMotion} themeMode={themeMode} />
          <ProfilePrompt language={language} model={model} onOpen={openProfile} reduceMotion={glass.reduceMotion} themeMode={themeMode} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  availabilitySlot: { marginHorizontal: 11, marginTop: 10 },
  avatar: { borderRadius: 23, height: '100%', width: '100%' },
  avatarButton: { backgroundColor: '#FEFFFF', borderColor: '#D8EBE7', borderRadius: 23, borderWidth: 1, boxShadow: '0 4px 12px rgba(24,67,66,0.08)', height: 45, position: 'relative', width: 45 },
  avatarButtonDark: { backgroundColor: '#1D2522', borderColor: 'rgba(190,210,205,0.28)' },
  avatarCameraBadge: { alignItems: 'center', backgroundColor: '#FEFFFF', borderColor: '#D8EBE7', borderRadius: 9, borderWidth: 1, bottom: -1, height: 18, justifyContent: 'center', position: 'absolute', right: -1, width: 18 },
  avatarCameraBadgeDark: { backgroundColor: '#1D2522', borderColor: 'rgba(190,210,205,0.28)' },
  avatarPlaceholder: { alignItems: 'center', backgroundColor: 'transparent', borderRadius: 23, height: '100%', justifyContent: 'center', width: '100%' },
  cardDark: { backgroundColor: '#17322C', borderColor: '#31554D' },
  compactEmpty: { alignItems: 'center', backgroundColor: '#F8FBFA', borderColor: '#E1E9E7', borderRadius: 13, borderWidth: 1, justifyContent: 'center', marginHorizontal: 11, minHeight: 54, padding: 12 },
  compactEmptyText: { color: '#657488', fontSize: 11, lineHeight: 15, textAlign: 'center' },
  divider: { backgroundColor: '#ECF0EF', bottom: 10, left: 0, position: 'absolute', top: 10, width: 1 },
  dividerDark: { backgroundColor: '#31554D' },
  header: { alignItems: 'flex-start', flexDirection: 'row', height: 55, paddingLeft: 8, paddingRight: 11 },
  headerCopy: { flex: 1, paddingLeft: 8, paddingTop: 1 },
  headerMeta: { color: '#526177', fontSize: 9.8, lineHeight: 12, marginTop: 5 },
  headerTitle: { color: '#102437', fontSize: 13.4, fontWeight: '600', letterSpacing: -0.22, lineHeight: 16 },
  hero: { borderCurve: 'continuous', borderRadius: 16, height: 133, marginHorizontal: 11, overflow: 'hidden' },
  heroActions: { bottom: 14, flexDirection: 'row', gap: 6, height: 29, left: 18, position: 'absolute', right: 9 },
  heroArtwork: { height: 90, position: 'absolute', right: 0, top: 0, width: 164 },
  heroCopy: { paddingLeft: 18, paddingTop: 22 },
  heroDetail: { color: '#28565A', fontSize: 9, lineHeight: 11, marginTop: 7 },
  heroFilter: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 999, boxShadow: '0 4px 13px rgba(18, 97, 87, 0.11)', flexDirection: 'row', gap: 6, justifyContent: 'center', paddingHorizontal: 10, width: 64 },
  heroFilterLabel: { color: '#102437', fontSize: 10.1, lineHeight: 12 },
  heroSearch: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.98)', borderRadius: 999, boxShadow: '0 4px 13px rgba(18, 97, 87, 0.11)', flex: 1, flexDirection: 'row', gap: 7, minWidth: 0, paddingHorizontal: 12 },
  heroSearchError: { bottom: 1, color: '#9C2D2D', fontSize: 8, left: 25, lineHeight: 10, position: 'absolute' },
  heroSearchInput: { color: '#526177', flex: 1, fontSize: 8.5, height: '100%', lineHeight: 11, minWidth: 0, paddingHorizontal: 0, paddingVertical: 0 },
  heroTitle: { color: '#102437', fontSize: 15.4, fontWeight: '600', letterSpacing: -0.32, lineHeight: 19.2, maxWidth: 220 },
  jobArtwork: { borderRadius: 10, height: 48, left: 1, position: 'absolute', top: 4, width: 48 },
  jobAside: { alignItems: 'flex-end', gap: 4, width: 66 },
  jobCard: { backgroundColor: '#FFFEFF', borderColor: '#E1E9E7', borderCurve: 'continuous', borderRadius: 14, borderWidth: 1, boxShadow: '0 5px 16px rgba(24, 67, 66, 0.062)', flex: 1, overflow: 'hidden', paddingBottom: 8, paddingLeft: 52, paddingRight: 6, paddingTop: 10 },
  jobMeta: { color: '#667588', fontSize: 7.5, lineHeight: 9, marginTop: 3 },
  jobStatus: { color: '#078F7A', fontSize: 7, lineHeight: 8 },
  jobStatusDark: { color: '#8FE4D4' },
  jobStatusPill: { alignItems: 'center', backgroundColor: '#E9F8F5', borderRadius: 999, bottom: 7, flexDirection: 'row', left: 8, paddingHorizontal: 6, paddingVertical: 2, position: 'absolute' },
  jobStatusPillDark: { backgroundColor: '#21463F' },
  jobTitle: { color: '#102437', fontSize: 9, fontWeight: '600', lineHeight: 11 },
  mutedDark: { color: '#AAC0BC' },
  modeOption: { alignItems: 'center', borderColor: '#DCE8E5', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 64, paddingHorizontal: 14, paddingVertical: 10 },
  modeOptionCopy: { flex: 1, minWidth: 0 },
  modeOptionDescription: { color: '#617084', fontSize: 12, lineHeight: 17, marginTop: 3 },
  modeOptionLabel: { color: '#102437', fontSize: 15, fontWeight: '600', lineHeight: 20 },
  modeOptionSelected: { backgroundColor: '#EFFAF7', borderColor: '#85D8C9' },
  modeRadio: { borderColor: '#8BA09B', borderRadius: 8, borderWidth: 1.5, height: 16, width: 16 },
  modeRadioSelected: { backgroundColor: '#09A88B', borderColor: '#09A88B', borderWidth: 4 },
  modeSheet: { alignSelf: 'center', backgroundColor: '#FFFEFF', borderRadius: 24, gap: 10, maxWidth: 420, padding: 18, width: '90%' },
  modeSheetBackdrop: { backgroundColor: 'rgba(9, 25, 22, 0.42)', flex: 1, justifyContent: 'flex-end', paddingBottom: 28 },
  modeSheetTitle: { color: '#102437', fontSize: 18, fontWeight: '600', lineHeight: 24, marginBottom: 2 },
  opportunityList: { flexDirection: 'row', gap: 6, height: 80, marginHorizontal: 11 },
  opportunityEarning: { color: '#039A80', fontSize: 8.9, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 10, position: 'absolute', right: 7, top: 34 },
  opportunitySection: { marginTop: 10 },
  opportunityStateText: { color: '#657488', fontSize: 9, lineHeight: 12, textAlign: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  profilePrompt: { alignItems: 'center', backgroundColor: '#DEF5F0', borderRadius: 11, flexDirection: 'row', height: 32, marginHorizontal: 11, marginTop: 6, overflow: 'hidden', paddingHorizontal: 8 },
  profilePromptDark: { backgroundColor: '#1B4038' },
  profilePromptCopy: { flex: 1, minWidth: 0 },
  profilePromptDetail: { color: '#667889', fontSize: 6.8, lineHeight: 8, marginTop: 2 },
  profilePromptIcon: { alignItems: 'center', width: 34 },
  profilePromptTitle: { color: '#087B6D', fontSize: 8.8, fontWeight: '600', lineHeight: 11 },
  quickAction: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center' },
  quickActionLabel: { color: '#102437', fontSize: 9, lineHeight: 10.5, textAlign: 'center' },
  quickActionPressed: { backgroundColor: '#F7FCFB' },
  quickActions: { backgroundColor: '#FFFEFF', borderColor: '#E1E9E7', borderCurve: 'continuous', borderRadius: 15, borderWidth: 1, boxShadow: '0 5px 16px rgba(24, 67, 66, 0.062)', flexDirection: 'row', height: 62, marginHorizontal: 11, marginTop: 7, overflow: 'hidden' },
  safeArea: { flex: 1 },
  safeAreaLight: { backgroundColor: '#FFFFFF' },
  scheduleArtwork: { height: '100%', width: '100%' },
  scheduleArtworkPanel: { alignSelf: 'stretch', backgroundColor: '#E8F5F1', overflow: 'hidden', position: 'relative', width: 46 },
  scheduleArtworkWash: { bottom: 0, position: 'absolute', right: -1, top: 0, width: 18 },
  scheduleCard: { alignItems: 'center', backgroundColor: '#FFFEFF', borderColor: '#E1E9E7', borderCurve: 'continuous', borderRadius: 13, borderWidth: 1, boxShadow: '0 5px 16px rgba(24, 67, 66, 0.062)', flexDirection: 'row', height: 46, marginHorizontal: 11, overflow: 'hidden', paddingRight: 8 },
  scheduleCopy: { flex: 1, minWidth: 0, paddingLeft: 9 },
  scheduleEarning: { color: '#079B81', fontSize: 8.9, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 10 },
  scheduleMeta: { color: '#6B7A8D', fontSize: 7.6, lineHeight: 9, marginTop: 3 },
  scheduleSection: { marginTop: 12 },
  scheduleStatus: { color: '#078F7A', fontSize: 7.1, lineHeight: 8 },
  scheduleStatusPill: { backgroundColor: '#E6F7F3', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  scheduleTime: { color: '#102437', fontSize: 10.2, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 12, textAlign: 'center', width: 60 },
  scheduleTitle: { color: '#102437', fontSize: 9.2, fontWeight: '600', lineHeight: 11 },
  searchIconPressed: { opacity: 0.62 },
  scrollContent: { alignItems: 'center', paddingBottom: 118, paddingHorizontal: 12 },
  sectionAction: { color: '#02967D', fontSize: 8.7, lineHeight: 10 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', height: 19, justifyContent: 'space-between', marginBottom: 4, paddingLeft: 13, paddingRight: 15 },
  sectionHeaderCompact: { height: 18 },
  sectionTitle: { color: '#102437', fontSize: 10.8, fontWeight: '600', letterSpacing: -0.15, lineHeight: 13 },
  statItem: { alignItems: 'center', flex: 1, minWidth: 0, paddingBottom: 4, paddingTop: 8 },
  statIcon: { alignItems: 'center', height: 26, justifyContent: 'center', width: 26 },
  statDivider: { backgroundColor: '#ECF0EF', bottom: 13, left: 0, position: 'absolute', top: 16, width: 1 },
  statLabel: { color: '#617084', fontSize: 7.7, lineHeight: 9, marginTop: 4, textAlign: 'center' },
  statValue: { color: '#102437', fontSize: 14.5, fontVariant: ['tabular-nums'], fontWeight: '600', lineHeight: 15, marginTop: 4 },
  stats: { backgroundColor: '#FFFEFF', borderColor: '#E1E9E7', borderCurve: 'continuous', borderRadius: 16, borderWidth: 1, boxShadow: '0 5px 16px rgba(24, 67, 66, 0.062)', flexDirection: 'row', height: 72, marginHorizontal: 11, marginTop: 7 },
  statusDot: { backgroundColor: '#18B89E', borderRadius: 3, height: 6, width: 6 },
  statusLabel: { color: '#66768A', fontSize: 9.1, lineHeight: 11 },
  statusRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 5 },
  surface: { alignSelf: 'center', paddingBottom: 16, paddingTop: 14, width: '100%' },
  textDark: { color: '#F1F6F4' },
})
