import { useEffect, useRef, useState } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'
import { radius } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { kaelMemoryService } from '@/lib/services'
import { WorkerV5IconName } from '../dock/types'
import { WorkerV5EarningsHomeHeroAura, WorkerV5EarningsHomeListAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { formatWorkerDistrict } from '../ui/labels'
import { WorkerV5SectionHeader } from '../ui/primitives-surfaces'
import { WORKER_V5_PROFILE_ICON_VISUAL_BOOST, workerV5Icons } from '../ui/screen-icons'
import { styles } from '../worker-v5-flow-styles'
import { WORKER_V5_MEMORY_PREFERENCE_API_KEYS, WorkerV5MemoryPreferenceUiId, workerV5MemoryPreferenceOverridesFromMemory } from './memory'
import { WorkerV5MemoryHero, WorkerV5MemorySwitchList } from './memory-surfaces'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { localizedServiceLabel } from '@/lib/app-language'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5AgentMemoryBody({ language, reduceTransparency, runtime }: { language: AppLanguage; reduceTransparency: boolean; runtime: WorkerV5Runtime }) {
  const profile = runtime.workerProfile
  const [memoryToggleOverrides, setMemoryToggleOverrides] = useState<Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>>({})
  const [savingMemoryToggleIds, setSavingMemoryToggleIds] = useState<Partial<Record<WorkerV5MemoryPreferenceUiId, boolean>>>({})
  const memoryToggleInFlightIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, true>>>({})
  const memoryToggleRequestIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, number>>>({})
  const memoryTouchedToggleIds = useRef<Partial<Record<WorkerV5MemoryPreferenceUiId, true>>>({})
  const readMemoryToggle = (id: WorkerV5MemoryPreferenceUiId, initialValue: boolean) => memoryToggleOverrides[id] ?? initialValue
  useEffect(() => {
    let mounted = true
    memoryToggleInFlightIds.current = {}
    memoryTouchedToggleIds.current = {}
    memoryToggleRequestIds.current = {}
    kaelMemoryService.getMyWorkerMemory()
      .then((response) => {
        if (!mounted) return
        if (response.success) {
          const remoteOverrides = workerV5MemoryPreferenceOverridesFromMemory(response.data.memory)
          setMemoryToggleOverrides((current) => {
            const next = { ...current }
            for (const [id, enabled] of Object.entries(remoteOverrides) as [WorkerV5MemoryPreferenceUiId, boolean][]) {
              if (!memoryTouchedToggleIds.current[id]) {
                next[id] = enabled
              }
            }
            return next
          })
        }
      })
      .catch(() => {
        return undefined
      })
    return () => {
      mounted = false
    }
  }, [profile?.id])
  const setMemoryItemEnabled = (id: WorkerV5MemoryPreferenceUiId, nextEnabled: boolean, previousEnabled: boolean) => {
    if (memoryToggleInFlightIds.current[id]) return
    memoryToggleInFlightIds.current[id] = true
    const requestId = (memoryToggleRequestIds.current[id] ?? 0) + 1
    memoryToggleRequestIds.current[id] = requestId
    memoryTouchedToggleIds.current[id] = true
    setMemoryToggleOverrides((current) => ({
      ...current,
      [id]: nextEnabled,
    }))
    setSavingMemoryToggleIds((current) => ({ ...current, [id]: true }))
    kaelMemoryService.updateMyWorkerPreference({
      enabled: nextEnabled,
      key: WORKER_V5_MEMORY_PREFERENCE_API_KEYS[id],
    })
      .then((response) => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        if (!response.success) {
          setMemoryToggleOverrides((current) => ({ ...current, [id]: previousEnabled }))
          return
        }
        const remoteOverrides = workerV5MemoryPreferenceOverridesFromMemory(response.data.memory)
        setMemoryToggleOverrides((current) => ({
          ...current,
          ...Object.fromEntries(
            (Object.entries(remoteOverrides) as [WorkerV5MemoryPreferenceUiId, boolean][])
              .filter(([remoteId]) => remoteId === id || !memoryTouchedToggleIds.current[remoteId]),
          ),
          [id]: remoteOverrides[id] ?? nextEnabled,
        }))
      })
      .catch(() => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        setMemoryToggleOverrides((current) => ({ ...current, [id]: previousEnabled }))
      })
      .finally(() => {
        if (memoryToggleRequestIds.current[id] !== requestId) return
        delete memoryToggleInFlightIds.current[id]
        setSavingMemoryToggleIds((current) => ({ ...current, [id]: false }))
      })
  }
  const hasDistricts = Boolean(profile?.districts?.length)
  const hasRadius = typeof profile?.service_radius_km === 'number' && Number.isFinite(profile.service_radius_km)
  const selectedServices = profile?.selected_service_types
    ?? profile?.active_service_types
    ?? profile?.service_types
    ?? []
  const hasServices = selectedServices.length > 0
  const districts = hasDistricts
    ? (profile?.districts ?? []).map((district) => formatWorkerDistrict(district, language)).join(', ')
    : textByLanguage(language, 'Chưa có khu vực đã ghi', 'No saved area')
  const radius = hasRadius
    ? `${profile.service_radius_km} km`
    : textByLanguage(language, 'Chưa có giới hạn di chuyển', 'No travel limit')
  const areaPreference = hasDistricts && hasRadius
    ? textByLanguage(language, `${districts} · bán kính ${radius}`, `${districts} · ${radius} radius`)
    : hasDistricts
      ? districts
      : textByLanguage(language, 'Chưa có khu vực đã ghi', 'No saved area')
  const services = hasServices
    ? selectedServices.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có kỹ năng ưu tiên', 'No priority skills')
  const canFilterFromProfile = hasDistricts || hasServices || hasRadius
  const permissionItems: { enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }[] = [
    {
      id: 'area-preference',
      enabled: readMemoryToggle('area-preference', hasDistricts),
      icon: 'map' as const,
      label: textByLanguage(language, 'Ưu tiên khu vực', 'Area preference'),
      value: areaPreference,
    },
    {
      id: 'travel-limit',
      enabled: readMemoryToggle('travel-limit', hasRadius),
      icon: 'clock' as const,
      label: textByLanguage(language, 'Giới hạn di chuyển', 'Travel limit'),
      value: hasRadius ? textByLanguage(language, `Tối đa ${radius}`, `Up to ${radius}`) : radius,
    },
    {
      id: 'skill-preference',
      enabled: readMemoryToggle('skill-preference', hasServices),
      icon: 'tools' as const,
      label: textByLanguage(language, 'Ưu tiên kỹ năng', 'Skill preference'),
      value: services,
    },
  ]
  const boundaryItems: { enabled: boolean; icon: WorkerV5IconName; id: WorkerV5MemoryPreferenceUiId; label: string; value: string }[] = [
    {
      id: 'opportunity-filter',
      enabled: readMemoryToggle('opportunity-filter', canFilterFromProfile),
      icon: 'jobs' as const,
      label: textByLanguage(language, 'Tự lọc cơ hội phù hợp', 'Auto-filter matching opportunities'),
      value: textByLanguage(language, 'Chỉ sắp xếp và đề xuất', 'Sorts and suggests only'),
    },
    {
      id: 'auto-accept-work',
      enabled: readMemoryToggle('auto-accept-work', false),
      icon: 'shield' as const,
      label: textByLanguage(language, 'Tự động nhận việc', 'Auto-accept work'),
      value: textByLanguage(language, 'Luôn khóa theo quyền quyết định của thợ', 'Always locked to worker authority'),
    },
  ]

  return (
    <View style={styles.sectionStack}>
      <WorkerV5MemoryHero
        heroAura={WorkerV5EarningsHomeHeroAura}
        language={language}
        reduceTransparency={reduceTransparency}
        shieldIcon={workerV5Icons.shield}
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Chỉnh sửa', 'Edit')}
        title={textByLanguage(language, 'Thông tin được phép dùng', 'Allowed information')}
      />
      <WorkerV5MemorySwitchList
        auraTestID="worker-v5-memory-permission-mint-aura"
        iconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
        icons={workerV5Icons}
        items={permissionItems}
        listAura={WorkerV5EarningsHomeListAura}
        onChange={setMemoryItemEnabled}
        reduceTransparency={reduceTransparency}
        savingIds={savingMemoryToggleIds}
        testID="worker-v5-memory-permission-list"
      />
      <WorkerV5SectionHeader
        action={textByLanguage(language, 'Không được vượt', 'Cannot bypass')}
        title={textByLanguage(language, 'Ranh giới tự động hóa', 'Automation boundary')}
      />
      <WorkerV5MemorySwitchList
        auraTestID="worker-v5-memory-boundary-mint-aura"
        iconVisualBoost={WORKER_V5_PROFILE_ICON_VISUAL_BOOST}
        icons={workerV5Icons}
        items={boundaryItems}
        listAura={WorkerV5EarningsHomeListAura}
        onChange={setMemoryItemEnabled}
        reduceTransparency={reduceTransparency}
        savingIds={savingMemoryToggleIds}
        testID="worker-v5-memory-boundary-list"
      />
    </View>
  )
}

