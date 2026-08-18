import { useReducer, type ComponentType } from 'react'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type TextProps,
} from 'react-native'
import Svg, { Circle, Path, Rect } from 'react-native-svg'
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
import { WorkerV5ProfileFormulaCard } from './worker-profile-formula-surfaces'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'

type WorkerV5ServicesProfile = WorkerProfileResponse | null | undefined
type WorkerV5SkillsHeroAura = ComponentType<{ testID: string }>
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

type WorkerV5ServiceCardState = {
  selectedServices: ServiceType[]
  savedServices: ServiceType[]
  saving: boolean
  status: WorkerV5ServicePreferenceInteraction['status']
  message: string
}

type WorkerV5ServiceCardAction =
  | { type: 'selection-changed'; selectedServices: ServiceType[] }
  | { type: 'message'; message: string }
  | { type: 'save-start' }
  | { type: 'save-finish'; message: string; saved: boolean; savedServices: ServiceType[] }

function workerV5ServiceCardReducer(
  state: WorkerV5ServiceCardState,
  action: WorkerV5ServiceCardAction,
): WorkerV5ServiceCardState {
  if (action.type === 'selection-changed') {
    return { ...state, message: '', selectedServices: action.selectedServices, status: 'dirty' }
  }
  if (action.type === 'message') return { ...state, message: action.message }
  if (action.type === 'save-start') return { ...state, message: '', saving: true, status: 'saving' }
  return {
    ...state,
    message: action.message,
    savedServices: action.saved ? action.savedServices : state.savedServices,
    saving: false,
    status: action.saved ? 'saved' : 'error',
  }
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
    <WorkerV5ProfileFormulaCard
      contentStyle={styles.skillsServiceHeroContent}
      reduceTransparency={reduceTransparency}
      scope="WorkerSkillsServiceHero"
      testID="worker-v5-skills-service-hero"
    >
      <View style={styles.skillsServiceHeroRow}>
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
    </WorkerV5ProfileFormulaCard>
  )
}

export function WorkerV5ServiceCardGrid({
  language,
  profile,
  reduceTransparency,
  onSave,
}: {
  language: AppLanguage
  profile: WorkerV5ServicesProfile
  reduceTransparency: boolean
  onSave: WorkerV5ServicePreferenceSave
}) {
  const workerThemeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(workerThemeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const serviceOptions = profile ? [...SERVICE_TYPES] : []
  const savedSelectedServices = workerV5SelectedServices(profile)
  const qualityByService = workerV5QualityByService(profile)
  const [state, dispatch] = useReducer(workerV5ServiceCardReducer, {
    selectedServices: [...savedSelectedServices],
    savedServices: [...savedSelectedServices],
    saving: false,
    status: 'saved',
    message: '',
  })
  const { message, savedServices, saving, selectedServices, status } = state
  const hasChanges = SERVICE_TYPES.some((service) =>
    selectedServices.includes(service) !== savedServices.includes(service)
  )

  const toggleService = (service: ServiceType) => {
    if (saving) return
    if (qualityByService.get(service)?.status === 'quality_locked') return
    if (selectedServices.includes(service) && selectedServices.length === 1) {
      dispatch({
        type: 'message',
        message: textByLanguage(language, 'Giữ ít nhất 1 dịch vụ.', 'Keep at least 1 service.'),
      })
      return
    }
    const nextSelectedServices = SERVICE_TYPES.filter((item) =>
      item === service ? !selectedServices.includes(item) : selectedServices.includes(item)
    )
    dispatch({ type: 'selection-changed', selectedServices: nextSelectedServices })
  }

  const savePreferences = async () => {
    if (saving || !hasChanges || selectedServices.length === 0) return
    const servicesToSave = [...selectedServices]
    dispatch({ type: 'save-start' })
    let saved = false
    try {
      saved = await onSave({ selected_service_types: servicesToSave })
    } catch {
      saved = false
    }
    dispatch({
      type: 'save-finish',
      message: saved
        ? textByLanguage(language, 'Đã lưu dịch vụ muốn nhận.', 'Active services saved.')
        : textByLanguage(language, 'Chưa lưu được. Lựa chọn của bạn vẫn được giữ lại.', 'Could not save yet. Your selection is preserved.'),
      saved,
      savedServices: servicesToSave,
    })
  }

  const summaryValue = profile
    ? `${selectedServices.length} / ${SERVICE_TYPES.length} ${textByLanguage(language, 'dịch vụ', 'services')}`
    : textByLanguage(language, 'Chờ hồ sơ', 'Waiting for profile')
  const statusLabel = status === 'dirty'
    ? textByLanguage(language, 'Chưa lưu', 'Unsaved')
    : status === 'saving'
      ? textByLanguage(language, 'Đang lưu', 'Saving')
      : status === 'error'
        ? textByLanguage(language, 'Chưa lưu được', 'Could not save')
        : textByLanguage(language, 'Đã lưu', 'Saved')

  return (
    <View
      style={[styles.serviceFormCard, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
      testID="worker-v5-quick-action-grid"
    >
      <View style={styles.serviceFormHeader}>
        <View style={styles.serviceFormIntroIcon} testID="worker-v5-service-form-intro-icon-frame">
          <ServiceCollectionGlyph color={tokens.primary} testID="worker-v5-service-form-intro-icon" />
        </View>
        <View style={styles.serviceFormIntroCopy}>
          <Text style={[styles.serviceFormIntroTitle, { color: tokens.text }]}>{textByLanguage(language, 'Dịch vụ chuyên môn', 'Professional services')}</Text>
          <Text style={[styles.serviceFormIntroBody, { color: tokens.muted }]}>{textByLanguage(language, 'Chọn những dịch vụ bạn muốn nhận.', 'Choose the services you want to receive.')}</Text>
        </View>
      </View>

      <View style={[styles.serviceSummary, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
        <View style={[styles.serviceSummaryCopy, styles.skillsServiceHeroCopy]} testID="worker-v5-skills-hero-copy">
          <Text style={[styles.serviceSummaryLabel, { color: tokens.muted }]}>{textByLanguage(language, 'Đang chọn', 'Selected')}</Text>
          <Text style={[styles.serviceSummaryValue, { color: tokens.text }]} numberOfLines={1} testID="worker-v5-skills-service-count">{summaryValue}</Text>
        </View>
        <View style={[styles.serviceSummaryStatus, { backgroundColor: tokens.service }]} testID="worker-v5-skills-hero-detail">
          <View style={[styles.serviceSummaryStatusDot, { backgroundColor: tokens.primary }]} />
          <Text style={[styles.serviceSummaryStatusText, { color: tokens.primary }]}>{statusLabel}</Text>
        </View>
      </View>

      {serviceOptions.length ? (
        <View style={[styles.serviceList, { borderColor: tokens.border }]} testID="worker-v5-service-preferences-list">
          {serviceOptions.map((service, index) => {
            const isSelected = selectedServices.includes(service)
            const quality = qualityByService.get(service)
            const isQualityLocked = quality?.status === 'quality_locked'
            const itemStatusLabel = isQualityLocked
              ? textByLanguage(language, 'Tạm khóa', 'Paused')
              : isSelected
                ? textByLanguage(language, 'Đang nhận', 'Active')
                : textByLanguage(language, 'Chưa chọn', 'Not selected')
            return (
              <View key={service}>
                <Pressable
                  accessibilityLabel={`${localizedServiceLabel(service, language)}. ${itemStatusLabel}`}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected, disabled: saving || isQualityLocked }}
                  onPress={() => toggleService(service)}
                  style={({ pressed }) => [
                    styles.serviceRow,
                    { backgroundColor: isQualityLocked ? tokens.warm : isSelected ? tokens.service : tokens.raised },
                    pressed && styles.serviceRowPressed,
                  ]}
                  testID={`worker-v5-quick-action-${index}`}
                >
                  <View style={styles.serviceIcon} testID={`worker-v5-quick-action-${index}-icon-frame`}>
                    <ServiceGlyph color={isQualityLocked ? tokens.muted : tokens.primary} service={service} />
                  </View>
                  <View style={styles.serviceCopy}>
                    <Text numberOfLines={1} style={[styles.serviceTitle, { color: tokens.text }]} testID={`worker-v5-quick-action-title-${index}`}>
                      {localizedServiceLabel(service, language)}
                    </Text>
                    <View style={styles.serviceDetailRail} testID={`worker-v5-service-card-detail-${index}`}>
                      <Text numberOfLines={1} style={[styles.serviceDetail, { color: tokens.muted }]} testID={`worker-v5-quick-action-meta-${index}`}>
                        {workerV5ServiceDetailLabel(service, language)}
                      </Text>
                    </View>
                    {isQualityLocked && quality ? (
                      <Text accessibilityLiveRegion="polite" style={[styles.serviceQualityNotice, { color: tokens.muted }]} testID={`worker-v5-service-quality-notice-${service}`}>
                        {workerV5QualityNotice(quality, language)}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.serviceState}>
                    <Text numberOfLines={1} style={[styles.serviceStatus, { color: isQualityLocked ? tokens.muted : isSelected ? tokens.primary : tokens.muted }]}>
                      {itemStatusLabel}
                    </Text>
                    <SelectionMark checked={isSelected && !isQualityLocked} color={tokens.primary} borderColor={tokens.border} />
                  </View>
                </Pressable>
                {index < serviceOptions.length - 1 ? <View style={[styles.serviceDivider, { backgroundColor: tokens.border }]} /> : null}
              </View>
            )
          })}
        </View>
      ) : (
        <View style={[styles.serviceEmpty, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="worker-v5-quick-action-empty">
          <View style={styles.serviceEmptyIcon} testID="worker-v5-quick-action-empty-icon">
            <ServiceCollectionGlyph color={tokens.primary} />
          </View>
          <View style={styles.serviceEmptyCopy}>
            <Text style={[styles.serviceEmptyTitle, { color: tokens.text }]} numberOfLines={2} testID="worker-v5-quick-action-empty-title">
              {textByLanguage(language, 'Chờ dữ liệu kỹ năng', 'Skill data pending')}
            </Text>
            <Text style={[styles.serviceEmptyMeta, { color: tokens.muted }]} numberOfLines={2} testID="worker-v5-quick-action-empty-meta">
              {textByLanguage(language, 'Kỹ năng sẽ hiện khi hồ sơ thợ đồng bộ', 'Skills appear when the worker profile syncs')}
            </Text>
          </View>
        </View>
      )}

      <Text style={[styles.serviceFormHelper, { color: tokens.muted }]}>
        {textByLanguage(language, 'Chỉ ghép việc cho dịch vụ đã chọn và đủ điều kiện chất lượng.', 'Matching uses selected services that meet quality requirements.')}
      </Text>
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[styles.servicePreferenceMessage, { color: tokens.muted }]} testID="worker-v5-service-preferences-message">
          {message}
        </Text>
      ) : null}
      {profile ? (
        <KaelButton
          disabled={!hasChanges || saving}
          label={saving
            ? textByLanguage(language, 'Đang lưu', 'Saving')
            : hasChanges
              ? textByLanguage(language, 'Lưu thay đổi', 'Save changes')
              : textByLanguage(language, 'Đã lưu', 'Saved')}
          loading={saving}
          onPress={() => { void savePreferences() }}
          showPrimaryGradient={false}
          style={styles.servicePreferenceSave}
          testID="worker-v5-service-preferences-save"
          variant="primary"
        />
      ) : null}
    </View>
  )
}

function ServiceCollectionGlyph({ color, testID }: { color: string; testID?: string }) {
  const common = {
    fill: 'none' as const,
    stroke: color,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.45,
  }
  return (
    <Svg height={21} testID={testID} viewBox="0 0 20 20" width={21}>
      <Rect {...common} height={5.2} rx={1.3} width={5.2} x={2.8} y={2.8} />
      <Rect {...common} height={5.2} rx={1.3} width={5.2} x={12} y={2.8} />
      <Rect {...common} height={5.2} rx={1.3} width={5.2} x={2.8} y={12} />
      <Rect {...common} height={5.2} rx={1.3} width={5.2} x={12} y={12} />
    </Svg>
  )
}

function SelectionMark({ borderColor, checked, color }: { borderColor: string; checked: boolean; color: string }) {
  return (
    <View style={[styles.selectionMark, { backgroundColor: checked ? color : 'transparent', borderColor: checked ? color : borderColor }]}>
      {checked ? <Svg height={13} viewBox="0 0 16 16" width={13}><Path d="m3 8.2 3 3 7-7" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} /></Svg> : null}
    </View>
  )
}

function ServiceGlyph({ color, service }: { color: string; service: ServiceType }) {
  const common = { fill: 'none' as const, stroke: color, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, strokeWidth: 1.45 }
  if (service === 'electrical') return <Svg height={22} viewBox="0 0 22 22" width={22}><Path {...common} d="m12.3 2.8-6 8h4.4l-1 8.4 6-8.3h-4.3l.9-8.1Z" /></Svg>
  if (service === 'plumbing') return <Svg height={22} viewBox="0 0 22 22" width={22}><Path {...common} d="M4 5.5h7v3H9.2v2.1a3.1 3.1 0 0 0 6.2 0V9.1M11 5.5V3.7M8.5 5.5V3.7M15.4 14.6v3.1M13.8 17.7h3.2" /></Svg>
  if (service === 'cleaning') return <Svg height={22} viewBox="0 0 22 22" width={22}><Path {...common} d="M7.2 5.2h6.4l-1.1 3.2H8.3L7.2 5.2ZM8.3 8.4h5.4v6.5a2 2 0 0 1-2 2h-1.4a2 2 0 0 1-2-2V8.4ZM14.3 5.2h2.1M16.4 5.2l1.4-1.4M17.9 3.8l1.1 1.1" /></Svg>
  if (service === 'hvac') return <Svg height={22} viewBox="0 0 22 22" width={22}><Path {...common} d="M11 3v16M4.1 7l13.8 8M4.1 15 17.9 7M11 3l1.7 2.2M11 3 9.3 5.2M11 19l1.7-2.2M11 19 9.3 16.8M4.1 7l2.8.2M4.1 7l1 2.6M17.9 15l-2.8-.2M17.9 15l-1-2.6M4.1 15l1-2.6M4.1 15l2.8-.2M17.9 7l-1 2.6M17.9 7l-2.8.2" /></Svg>
  if (service === 'upholstery') return <Svg height={22} viewBox="0 0 22 22" width={22}><Path {...common} d="M5 10.2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4.8H5v-4.8ZM5 12h12M7.2 15v2M14.8 15v2M7 8.2V6.8h8v1.4" /></Svg>
  return <Svg height={22} viewBox="0 0 22 22" width={22}><Path {...common} d="m4 16.4 5-5 2.2 2.2 5.2-5.2M14.2 8.4h3.2v3.2M5 18.2h12" /><Circle {...common} cx={4} cy={16.4} r={1.1} /></Svg>
}
