import { useState, type ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import {
  SERVICE_TYPES,
  type ServiceType,
  type WorkerServicePreferencesUpdateInput,
} from '@nestscout/shared'

import { KaelButton } from '@/components/ui/kael-primitives'
import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type {
  WorkerProfileResponse,
  WorkerServiceQualityStatus,
} from '@/lib/api-types'

import { textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { styles } from './services-styles'

type WorkerV5ServicesProfile = WorkerProfileResponse | null | undefined
type WorkerV5SkillsHeroAura = ComponentType<{ testID: string }>
type WorkerV5SkillsListAura = ComponentType<{ testID: string }>
type WorkerV5ServicePreferenceSave = (
  input: WorkerServicePreferencesUpdateInput,
) => Promise<boolean>
export type WorkerV5ServicePreferenceInteraction = {
  selectedServices: ServiceType[]
  status: 'dirty' | 'error' | 'saved' | 'saving'
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function workerV5ServiceDetailLabel(service: ServiceType, language: AppLanguage) {
  if (service === 'plumbing') return textByLanguage(language, 'Đường nước', 'Water systems')
  if (service === 'electrical') return textByLanguage(language, 'Thiết bị điện', 'Electrical systems')
  if (service === 'cleaning') return textByLanguage(language, 'Không gian sống', 'Living spaces')
  if (service === 'hvac') return textByLanguage(language, 'Điều hòa & không khí', 'Air conditioning & air')
  if (service === 'upholstery') return textByLanguage(language, 'Sofa, nệm, rèm & thảm', 'Upholstery care')
  return textByLanguage(language, 'Sửa chữa & lắp đặt nhỏ', 'Minor repairs & installation')
}

function workerV5ActiveServices(profile: WorkerV5ServicesProfile) {
  return profile?.active_service_types ?? profile?.service_types ?? []
}

function workerV5SelectedServices(profile: WorkerV5ServicesProfile) {
  return profile?.selected_service_types
    ?? profile?.active_service_types
    ?? profile?.service_types
    ?? []
}

function workerV5QualityByService(profile: WorkerV5ServicesProfile) {
  return new Map(
    (profile?.service_quality ?? []).map((quality) => [quality.service_type, quality]),
  )
}

function workerV5QualityNotice(
  quality: WorkerServiceQualityStatus,
  language: AppLanguage,
) {
  const rating = quality.average_rating?.toFixed(1) ?? '—'
  const lockedUntil = quality.locked_until ? new Date(quality.locked_until) : null
  const unlockDate = lockedUntil && Number.isFinite(lockedUntil.getTime())
    ? language === 'vi'
      ? `${String(lockedUntil.getDate()).padStart(2, '0')}/${String(lockedUntil.getMonth() + 1).padStart(2, '0')}/${lockedUntil.getFullYear()}`
      : `${lockedUntil.getFullYear()}-${String(lockedUntil.getMonth() + 1).padStart(2, '0')}-${String(lockedUntil.getDate()).padStart(2, '0')}`
    : null
  return textByLanguage(
    language,
    `${quality.review_count} đánh giá · ${rating}/5. ${unlockDate ? `Tạm khóa đến ${unlockDate}.` : 'Đang rà soát chất lượng.'}`,
    `${quality.review_count} reviews · ${rating}/5. ${unlockDate ? `Paused until ${unlockDate}.` : 'Quality review in progress.'}`,
  )
}

export function WorkerV5SkillsServiceHero({
  heroAura: _heroAura,
  interaction,
  language,
  profile,
  reduceTransparency,
  toolsIcon,
}: {
  heroAura: WorkerV5SkillsHeroAura
  interaction?: WorkerV5ServicePreferenceInteraction | null
  language: AppLanguage
  profile: WorkerV5ServicesProfile
  reduceTransparency: boolean
  toolsIcon: ImageSourcePropType
}) {
  const qualityLockedServices = new Set(
    (profile?.service_quality ?? [])
      .filter((quality) => quality.status === 'quality_locked')
      .map((quality) => quality.service_type),
  )
  const selectedServices = interaction?.selectedServices ?? workerV5SelectedServices(profile)
  const selectedServiceCount = selectedServices.length
  const activeServiceCount = interaction
    ? selectedServices.filter((service) => !qualityLockedServices.has(service)).length
    : workerV5ActiveServices(profile).length
  const qualityLockedCount = (profile?.service_quality ?? [])
    .filter((quality) => quality.status === 'quality_locked')
    .length
  const serviceCountLabel = profile
    ? interaction?.status === 'saving'
      ? textByLanguage(language, `Đang lưu ${activeServiceCount} dịch vụ`, `Saving ${activeServiceCount} services`)
      : interaction?.status === 'dirty' || interaction?.status === 'error'
        ? textByLanguage(language, `${activeServiceCount} dịch vụ đang chọn`, `${activeServiceCount} services selected`)
        : activeServiceCount > 0
          ? textByLanguage(language, `${activeServiceCount} dịch vụ đang nhận`, `${activeServiceCount} active services`)
          : textByLanguage(language, 'Chọn dịch vụ muốn nhận', 'Choose services to receive')
    : textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
  const interactionStatus = interaction
    ? interaction.status === 'dirty'
      ? { glyph: 'sync' as const, label: textByLanguage(language, 'Chưa lưu thay đổi', 'Changes not saved') }
      : interaction.status === 'saving'
        ? { glyph: 'sync' as const, label: textByLanguage(language, 'Đang lưu lựa chọn', 'Saving selection') }
        : interaction.status === 'saved'
          ? { glyph: 'check' as const, label: textByLanguage(language, 'Đã lưu lựa chọn', 'Selection saved') }
          : { glyph: 'sync' as const, label: textByLanguage(language, 'Chưa lưu được', 'Could not save') }
    : null
  return (
    <View style={[styles.earningsHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-skills-service-hero">
      <View accessibilityLiveRegion="polite" style={[styles.earningsHeroCopy, styles.skillsServiceHeroCopy]} testID="worker-v5-skills-hero-copy">
        <Text style={[styles.earningsHeroAmount, styles.skillsServiceHeroAmount]} numberOfLines={2} testID="worker-v5-skills-service-count">
          {serviceCountLabel}
        </Text>
        <WorkerV5DetailRail
          items={[
            {
              glyph: 'service',
              label: !profile
                ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
                : selectedServiceCount
                  ? textByLanguage(language, `${selectedServiceCount} dịch vụ đã chọn`, `${selectedServiceCount} selected`)
                  : textByLanguage(language, 'Chưa chọn dịch vụ', 'No services selected'),
            },
            {
              glyph: interactionStatus?.glyph ?? (qualityLockedCount > 0 ? 'sync' : 'check'),
              label: !profile
                ? textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
                : interactionStatus?.label
                  ?? (qualityLockedCount > 0
                    ? textByLanguage(language, `${qualityLockedCount} dịch vụ đang rà soát`, `${qualityLockedCount} under review`)
                    : textByLanguage(language, 'Chất lượng đạt yêu cầu', 'Quality clear')),
            },
          ]}
          prominent
          testID="worker-v5-skills-hero-detail"
        />
      </View>
      <WorkerV5IntegratedIcon bleed={16} edge="left" image={toolsIcon} reduceTransparency={reduceTransparency} tone="service" variant="heroPanel" />
    </View>
  )
}

export function WorkerV5ServiceCardGrid({
  language,
  listAura: _listAura,
  profile,
  reduceTransparency,
  serviceIcons,
  toolsIcon,
  onInteractionChange,
  onSave,
}: {
  language: AppLanguage
  listAura: WorkerV5SkillsListAura
  profile: WorkerV5ServicesProfile
  reduceTransparency: boolean
  serviceIcons: Record<ServiceType, ImageSourcePropType>
  toolsIcon: ImageSourcePropType
  onInteractionChange: (interaction: WorkerV5ServicePreferenceInteraction) => void
  onSave: WorkerV5ServicePreferenceSave
}) {
  const serviceOptions = profile ? [...SERVICE_TYPES] : []
  const savedSelectedServices = workerV5SelectedServices(profile)
  const qualityByService = workerV5QualityByService(profile)
  const [selectedServices, setSelectedServices] = useState<ServiceType[]>(() => [
    ...savedSelectedServices,
  ])
  const [savedServices, setSavedServices] = useState<ServiceType[]>(() => [
    ...savedSelectedServices,
  ])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const hasChanges = SERVICE_TYPES.some((service) =>
    selectedServices.includes(service) !== savedServices.includes(service)
  )

  const toggleService = (service: ServiceType) => {
    if (saving) return
    if (qualityByService.get(service)?.status === 'quality_locked') return
    if (selectedServices.includes(service) && selectedServices.length === 1) {
      setMessage(textByLanguage(
        language,
        'Giữ ít nhất 1 dịch vụ.',
        'Keep at least 1 service.',
      ))
      return
    }
    setMessage('')
    const nextSelectedServices = SERVICE_TYPES.filter((item) =>
      item === service ? !selectedServices.includes(item) : selectedServices.includes(item)
    )
    setSelectedServices(nextSelectedServices)
    onInteractionChange({
      selectedServices: nextSelectedServices,
      status: 'dirty',
    })
  }

  const savePreferences = async () => {
    if (saving || !hasChanges || selectedServices.length === 0) return
    const servicesToSave = [...selectedServices]
    setSaving(true)
    setMessage('')
    onInteractionChange({
      selectedServices: servicesToSave,
      status: 'saving',
    })
    let saved = false
    try {
      saved = await onSave({ selected_service_types: servicesToSave })
    } catch {
      saved = false
    } finally {
      setSaving(false)
    }
    if (saved) setSavedServices(servicesToSave)
    onInteractionChange({
      selectedServices: servicesToSave,
      status: saved ? 'saved' : 'error',
    })
    setMessage(saved
      ? textByLanguage(language, 'Đã lưu dịch vụ muốn nhận.', 'Active services saved.')
      : textByLanguage(language, 'Chưa lưu được. Lựa chọn của bạn vẫn được giữ lại.', 'Could not save yet. Your selection is preserved.'))
  }

  if (!serviceOptions.length) {
    return (
      <View style={styles.serviceCardGrid} testID="worker-v5-quick-action-grid">
        <View style={[styles.serviceSourceCard, styles.serviceSourceCardFull, reduceTransparency && styles.opaqueCard]} testID="worker-v5-quick-action-empty">
          <WorkerV5IntegratedIcon bleed={11} edge="none" image={toolsIcon} reduceTransparency={reduceTransparency} style={styles.serviceSourceIntegratedIcon} tone="service" variant="stagePanel" />
          <View style={styles.serviceSourceCopy}>
            <Text style={styles.serviceSourceTitle} numberOfLines={2} testID="worker-v5-quick-action-empty-title">
              {profile
                ? textByLanguage(language, 'Chưa có kỹ năng đã ghi', 'No saved skills')
                : textByLanguage(language, 'Chờ dữ liệu kỹ năng', 'Skill data pending')}
            </Text>
            <Text style={styles.serviceSourceMeta} numberOfLines={2} testID="worker-v5-quick-action-empty-meta">
              {textByLanguage(language, 'Kỹ năng sẽ hiện khi hồ sơ thợ đồng bộ', 'Skills appear when the worker profile syncs')}
            </Text>
            <WorkerV5DetailRail
              items={[
                { glyph: 'sync', label: textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile') },
                { glyph: 'service', label: profile
                  ? textByLanguage(language, 'Chưa dùng để lọc', 'Not filtering yet')
                  : textByLanguage(language, 'Chờ nguồn thật', 'Waiting for real source') },
              ]}
              layout="stacked"
              testID="worker-v5-service-card-empty-detail"
            />
          </View>
        </View>
      </View>
    )
  }
  return (
    <View style={styles.serviceCardGrid} testID="worker-v5-quick-action-grid">
      {serviceOptions.map((service, index) => {
        const isSelected = selectedServices.includes(service)
        const quality = qualityByService.get(service)
        const isQualityLocked = quality?.status === 'quality_locked'
        const statusLabel = isQualityLocked
          ? textByLanguage(language, 'Tạm khóa chất lượng', 'Quality paused')
          : isSelected
            ? textByLanguage(language, 'Đang nhận việc', 'Active')
            : textByLanguage(language, 'Chưa chọn', 'Not selected')
        return (
          <Pressable
            accessibilityLabel={`${localizedServiceLabel(service, language)}. ${textByLanguage(
              language,
              isQualityLocked
                ? 'Tạm khóa chất lượng'
                : isSelected
                  ? 'Đang nhận việc'
                  : 'Chưa chọn',
              isQualityLocked
                ? 'Quality paused'
                : isSelected
                  ? 'Active for matching'
                  : 'Not selected',
            )}`}
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: isSelected,
              disabled: saving || isQualityLocked,
            }}
            key={service}
            onPress={() => toggleService(service)}
            style={({ pressed }) => [
              styles.serviceSourceCard,
              isQualityLocked
                ? styles.serviceSourceCardQualityLocked
                : isSelected
                  ? styles.serviceSourceCardSelected
                  : styles.serviceSourceCardInactive,
              pressed && styles.serviceSourceCardPressed,
              reduceTransparency && styles.opaqueCard,
            ]}
            testID={`worker-v5-quick-action-${index}`}
          >
            <WorkerV5IntegratedIcon bleed={11} edge="none" image={serviceIcons[service]} reduceTransparency={reduceTransparency} style={styles.serviceSourceIntegratedIcon} tone="service" variant="stagePanel" />
            <View style={styles.serviceSourceCopy}>
              <Text style={styles.serviceSourceTitle} numberOfLines={2} testID={`worker-v5-quick-action-title-${index}`}>
                {localizedServiceLabel(service, language)}
              </Text>
              <Text style={styles.serviceSourceMeta} numberOfLines={2} testID={`worker-v5-quick-action-meta-${index}`}>
                {statusLabel}
              </Text>
              <WorkerV5DetailRail
                items={[
                  { glyph: 'service', label: workerV5ServiceDetailLabel(service, language) },
                  {
                    glyph: isSelected && !isQualityLocked ? 'check' : 'sync',
                    label: textByLanguage(
                      language,
                      isQualityLocked
                        ? 'Tạm ngưng ghép việc'
                        : isSelected
                          ? 'Dùng để lọc việc'
                          : 'Chạm để chọn',
                      isQualityLocked
                        ? 'Matching paused'
                        : isSelected
                          ? 'Used for matching'
                          : 'Tap to select',
                    ),
                  },
                ]}
                layout="stacked"
                testID={`worker-v5-service-card-detail-${index}`}
              />
              {isQualityLocked && quality ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={styles.serviceQualityNotice}
                  testID={`worker-v5-service-quality-notice-${service}`}
                >
                  {workerV5QualityNotice(quality, language)}
                </Text>
              ) : null}
            </View>
          </Pressable>
        )
      })}
      <View style={styles.servicePreferenceControls}>
        <Text style={styles.servicePreferenceHelper}>
          {textByLanguage(
            language,
            'Chọn dịch vụ phù hợp. Chỉ ghép việc khi đạt chất lượng.',
            'Choose suitable services. Matching requires good quality.',
          )}
        </Text>
        {message ? (
          <Text
            accessibilityLiveRegion="polite"
            style={styles.servicePreferenceMessage}
            testID="worker-v5-service-preferences-message"
          >
            {message}
          </Text>
        ) : null}
        <KaelButton
          disabled={!hasChanges || saving}
          label={saving
            ? textByLanguage(language, 'Đang lưu', 'Saving')
            : textByLanguage(language, 'Lưu dịch vụ muốn nhận', 'Save selected services')}
          loading={saving}
          onPress={() => { void savePreferences() }}
          showPrimaryGradient={false}
          style={styles.servicePreferenceSave}
          testID="worker-v5-service-preferences-save"
          variant="secondary"
        />
      </View>
    </View>
  )
}
