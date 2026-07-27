import { useRef, useState } from 'react'
import { Text as RNText, View, type TextProps } from 'react-native'
import { radius } from '@/design/theme'
import { type AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import {
  normalizeServiceAreaDraftText,
  normalizeWorkerV5DistrictSelectionList,
  parseWorkerV5ServiceAreaDraft,
  workerV5DistrictDraftFromSelection,
} from '../ui/labels'
import { styles } from '../worker-v5-flow-styles'
import type { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { Pressable } from 'react-native'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { WorkerV5EarningsHomeListAura } from '../ui/aura-surfaces'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import { WorkerV5MapStage } from '../home/map-stage-surfaces'
import { formatWorkerDistrict } from '../ui/labels'
import { workerV5CapturedIconAssets } from '../ui/worker-v5-icon-assets'

type WorkerV5Runtime = ReturnType<typeof useFrontendWorkflow>
function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5ServiceAreaMapCard({
  language,
  reduceTransparency,
  runtime,
}: {
  language: AppLanguage
  reduceTransparency: boolean
  runtime: WorkerV5Runtime
}) {
  const profile = runtime.workerProfile
  const savedDistricts = normalizeWorkerV5DistrictSelectionList(profile?.districts ?? [])
  const [serviceAreaState, setServiceAreaState] = useState(() => ({
    areaDraft: workerV5DistrictDraftFromSelection(savedDistricts, language),
    expanded: false,
    savingAreas: false,
    selectedDistricts: savedDistricts,
    serviceAreaMessage: '',
  }))
  const serviceAreaSaveInFlightRef = useRef(false)
  const {
    areaDraft,
    expanded,
    savingAreas,
    selectedDistricts,
    serviceAreaMessage,
  } = serviceAreaState
  const selectedDistrictDraft = workerV5DistrictDraftFromSelection(selectedDistricts, language)
  const draftParse = parseWorkerV5ServiceAreaDraft(areaDraft, language)
  const draftHasChanges = normalizeServiceAreaDraftText(areaDraft) !== normalizeServiceAreaDraftText(selectedDistrictDraft)

  const saveServiceAreas = async () => {
    if (serviceAreaSaveInFlightRef.current || savingAreas) return
    const parsed = parseWorkerV5ServiceAreaDraft(areaDraft, language)
    const nextDistricts = parsed.districts
    if (!nextDistricts.length) {
      setServiceAreaState((current) => ({
        ...current,
        serviceAreaMessage: textByLanguage(language, 'Nhập ít nhất một khu vực phục vụ.', 'Enter at least one service area.'),
      }))
      return
    }
    if (parsed.invalid.length) {
      setServiceAreaState((current) => ({
        ...current,
        serviceAreaMessage: textByLanguage(language, 'Kiểm tra lại tên khu vực trước khi lưu.', 'Check service area names before saving.'),
      }))
      return
    }
    const previousDistricts = selectedDistricts
    serviceAreaSaveInFlightRef.current = true
    setServiceAreaState((current) => ({
      ...current,
      savingAreas: true,
      selectedDistricts: nextDistricts,
      serviceAreaMessage: '',
    }))
    let saved = false
    try {
      saved = await runtime.actions.workerUpdateServiceArea({
        districts: nextDistricts,
      })
    } catch {
      saved = false
    } finally {
      serviceAreaSaveInFlightRef.current = false
    }
    if (!saved) {
      setServiceAreaState((current) => ({
        ...current,
        savingAreas: false,
        selectedDistricts: previousDistricts,
        serviceAreaMessage: textByLanguage(language, 'Chưa đồng bộ được với NestScout. Khu vực vừa nhập vẫn đang chờ lưu.', 'Could not sync with NestScout. Your entered areas are still pending.'),
      }))
      return
    }
    setServiceAreaState((current) => ({
      ...current,
      areaDraft: workerV5DistrictDraftFromSelection(nextDistricts, language),
      savingAreas: false,
      serviceAreaMessage: textByLanguage(language, 'Đã lưu khu vực phục vụ.', 'Service area saved.'),
    }))
  }
  const profileLocation = typeof profile?.home_lat === 'number' &&
    Number.isFinite(profile.home_lat) &&
    typeof profile.home_lng === 'number' &&
    Number.isFinite(profile.home_lng)
    ? { lat: profile.home_lat, lng: profile.home_lng, provider: 'vietmap' as const }
    : null
  const radius = typeof profile?.service_radius_km === 'number' && Number.isFinite(profile.service_radius_km)
    ? `${profile.service_radius_km} km`
    : null
  const selectedDistrictLabels = selectedDistricts.map((district) => formatWorkerDistrict(district, language))
  const visibleAreaLabels = draftHasChanges && draftParse.labels.length ? draftParse.labels : selectedDistrictLabels
  const expandedSummary = visibleAreaLabels.length
    ? radius
      ? textByLanguage(language, `${visibleAreaLabels.length} khu vực ưu tiên · ${radius}`, `${visibleAreaLabels.length} priority areas · ${radius}`)
      : textByLanguage(language, `${visibleAreaLabels.length} khu vực ưu tiên`, `${visibleAreaLabels.length} priority areas`)
    : textByLanguage(language, 'Chưa có khu vực ưu tiên', 'No priority area yet')
  const collapsedSummary = visibleAreaLabels.length || profileLocation
    ? textByLanguage(language, 'Nhấn để xem khu vực ưu tiên', 'Open priority areas')
    : expandedSummary
  const mapLabel = visibleAreaLabels[0] ?? textByLanguage(language, 'Khu vực phục vụ ưu tiên', 'Priority service area')
  return (
    <View style={styles.sectionStack} testID="worker-v5-service-area-map-card">
      <Pressable
        accessibilityLabel={`${textByLanguage(language, 'Khu vực phục vụ', 'Service area')}. ${collapsedSummary}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setServiceAreaState((current) => ({
          ...current,
          expanded: !current.expanded,
        }))}
        style={({ pressed }) => [
          styles.kaelBriefCard,
          styles.serviceAreaOpenCard,
          reduceTransparency && styles.opaqueCard,
          pressed && styles.pressed,
        ]}
        testID="worker-v5-service-area-open-card"
      >
        <WorkerV5IntegratedIcon
          bleed={11}
          image={workerV5CapturedIconAssets.profileServiceArea}
          reduceTransparency={reduceTransparency}
          tone="location"
          variant="compactPanel"
        />
        <View style={styles.kaelBriefText}>
          <Text style={styles.kaelBriefTitle} numberOfLines={2}>{textByLanguage(language, 'Khu vực phục vụ', 'Service area')}</Text>
          <Text style={styles.kaelBriefBody} numberOfLines={2} testID="worker-v5-service-area-open-summary">{collapsedSummary}</Text>
          <WorkerV5DetailRail
            items={[
              {
                glyph: 'location',
                label: visibleAreaLabels.length
                  ? textByLanguage(language, `${visibleAreaLabels.length} khu vực`, `${visibleAreaLabels.length} areas`)
                  : textByLanguage(language, 'Chưa chọn khu vực', 'No area selected'),
              },
              {
                glyph: 'signal',
                label: radius ?? textByLanguage(language, 'Chưa có bán kính', 'No radius yet'),
              },
            ]}
            testID="worker-v5-service-area-detail"
          />
        </View>
        <Text style={[styles.kaelBriefChevron, expanded && styles.serviceAreaChevronOpen]}>›</Text>
      </Pressable>
      {expanded ? (
        <View style={styles.serviceAreaExpandedStack} testID="worker-v5-service-area-expanded">
          {profileLocation ? (
            <View style={[styles.serviceAreaMapShell, reduceTransparency && styles.opaqueCard]}>
              {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-service-area-map-mint-aura" /> : null}
              <WorkerV5MapStage
                activeLocation={profileLocation}
                deal={null}
                language={language}
                profile={profile}
                reduceTransparency={reduceTransparency}
                selectedLabel={mapLabel}
                testID="worker-v5-service-area-map"
              />
            </View>
          ) : null}
          <View style={[styles.serviceAreaPlacePanel, reduceTransparency && styles.opaqueCard]} testID="worker-v5-service-area-place-list">
            {!reduceTransparency ? <WorkerV5EarningsHomeListAura testID="worker-v5-service-area-place-mint-aura" /> : null}
            <Text style={styles.serviceAreaPlaceTitle} numberOfLines={2}>
              {profileLocation
                ? textByLanguage(language, 'Địa điểm ưu tiên đã đồng bộ', 'Synced priority place')
                : textByLanguage(language, 'Tên khu vực ưu tiên', 'Priority area names')}
            </Text>
            {visibleAreaLabels.length ? (
              <Text style={styles.serviceAreaPlaceMeta} numberOfLines={2} testID="worker-v5-service-area-expanded-summary">{expandedSummary}</Text>
            ) : (
              <Text style={styles.serviceAreaPlaceMeta} numberOfLines={2} testID="worker-v5-service-area-empty">
                {textByLanguage(language, 'Chọn khu vực thợ sẽ nhận việc.', 'Choose areas where the worker accepts jobs.')}
              </Text>
            )}
            <View style={styles.serviceAreaInlineEditor} testID="worker-v5-service-area-inline-editor">
              <KaelTextField
                autoCapitalize="words"
                autoCorrect={false}
                inputShellStyle={styles.serviceAreaDraftShell}
                inputShellTestID="worker-v5-service-area-draft-shell"
                label={textByLanguage(language, 'Nhập khu vực ưu tiên', 'Enter priority areas')}
                labelStyle={styles.serviceAreaDraftLabel}
                onChangeText={(areaDraftValue) => setServiceAreaState((current) => ({
                  ...current,
                  areaDraft: areaDraftValue,
                }))}
                placeholder={textByLanguage(language, 'Ví dụ: Bình Thạnh, Quận 1, Thủ Đức', 'Example: Binh Thanh, District 1, Thu Duc')}
                spellCheck={false}
                style={styles.serviceAreaDraftInput}
                testID="worker-v5-service-area-draft-input"
                value={areaDraft}
              />
              <KaelButton
                accessibilityState={{ busy: savingAreas, disabled: savingAreas }}
                label={savingAreas ? textByLanguage(language, 'Đang lưu', 'Saving') : textByLanguage(language, 'Lưu khu vực', 'Save areas')}
                loading={savingAreas}
                onPress={() => { void saveServiceAreas() }}
                showPrimaryGradient={false}
                style={styles.serviceAreaSaveInlineButton}
                testID="worker-v5-service-area-save-inline"
                variant="secondary"
              />
            </View>
            {visibleAreaLabels.map((label, index) => (
              <View
                key={`${label}-${index}`}
                style={[
                  styles.serviceAreaPlaceRow,
                  styles.serviceAreaPlaceRowSelected,
                  draftHasChanges && styles.serviceAreaPlaceRowPending,
                ]}
                testID={`worker-v5-service-area-saved-row-${index}`}
              >
                <View style={styles.serviceAreaPlacePin}>
                  <Text style={styles.serviceAreaPlacePinText}>{index + 1}</Text>
                </View>
                <Text style={styles.serviceAreaPlaceName} numberOfLines={2} testID={`worker-v5-service-area-place-name-${index}`}>{label}</Text>
              </View>
            ))}
            {radius ? (
              <Text style={styles.serviceAreaPlaceMeta} numberOfLines={2} testID="worker-v5-service-area-radius">
                {textByLanguage(language, `Bán kính phục vụ ${radius}`, `Service radius ${radius}`)}
              </Text>
            ) : null}
            {serviceAreaMessage ? (
              <Text
                style={styles.workerSettingsMessage}
                testID="worker-v5-service-area-message"
              >
                {serviceAreaMessage}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  )
}

