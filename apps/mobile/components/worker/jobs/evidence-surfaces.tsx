import type { ComponentType } from 'react'
import { Image } from 'expo-image'
import {
  Pressable,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'

import { textByLanguage } from '../ui/format'
import { styles } from './evidence-styles'

type WorkerV5EvidenceAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5SourceCardSkinComponent = ComponentType<{
  testID?: string
}>

const EVIDENCE_TRAY_SLOTS = [0, 1, 2] as const

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5EvidenceTray({
  addPhotoDisabled = false,
  emptyLabel,
  evidenceIcon,
  language,
  onAddPhoto,
  reduceTransparency,
  uploadingSlot = null,
  urls,
}: {
  addPhotoDisabled?: boolean
  emptyLabel: string
  evidenceIcon: ImageSourcePropType
  language: AppLanguage
  onAddPhoto?: (slot: number) => void
  reduceTransparency: boolean
  uploadingSlot?: number | null
  urls: readonly (string | null | undefined)[]
}) {
  const previewUrls = useJobMediaPreviewUrls(urls)
  return (
    <View style={styles.evidenceTray} testID="worker-v5-evidence-tray">
      {EVIDENCE_TRAY_SLOTS.map((slot) => {
        const mediaRef = urls[slot] ?? null
        const previewUrl = previewUrls[slot] ?? null
        const overflowCount = slot === 2 && urls.length > 3 ? urls.length - 2 : 0
        const canAddPhoto = !mediaRef && Boolean(onAddPhoto)
        const isUploading = uploadingSlot === slot
        return (
          canAddPhoto ? (
            <Pressable
              accessibilityLabel={textByLanguage(language, `Thêm ảnh hiện trường ${slot + 1}`, `Add on-site photo ${slot + 1}`)}
              accessibilityRole="button"
              accessibilityState={{ disabled: addPhotoDisabled }}
              disabled={addPhotoDisabled}
              key={slot}
              onPress={() => onAddPhoto?.(slot)}
              style={({ pressed }) => [
                styles.evidenceTrayTile,
                reduceTransparency && styles.opaqueCard,
                addPhotoDisabled && styles.navButtonDisabled,
                pressed && !addPhotoDisabled ? styles.pressed : null,
              ]}
              testID={`worker-v5-evidence-tray-add-${slot}`}
            >
              <View style={styles.evidenceTrayIconShell}>
                {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
                <Text style={styles.evidenceTrayAddMark}>+</Text>
              </View>
              <Text style={styles.evidenceTrayBadge} numberOfLines={1} testID={`worker-v5-evidence-tray-badge-${slot}`}>
                {isUploading
                  ? textByLanguage(language, 'Đang gửi', 'Uploading')
                  : textByLanguage(language, 'Thêm ảnh', 'Add photo')}
              </Text>
            </Pressable>
          ) : (
            <View
              key={slot}
              style={[styles.evidenceTrayTile, reduceTransparency && styles.opaqueCard]}
              testID={`worker-v5-evidence-tray-tile-${slot}`}
            >
              {mediaRef && previewUrl ? (
                <Image source={{ uri: previewUrl }} style={styles.evidenceTrayImage} testID={`worker-v5-evidence-tray-image-${slot}`} />
              ) : (
                <View style={styles.evidenceTrayIconShell}>
                  {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
                  <Image source={evidenceIcon} style={styles.evidenceTrayIcon} />
                </View>
              )}
              <Text style={styles.evidenceTrayBadge} numberOfLines={1} testID={`worker-v5-evidence-tray-badge-${slot}`}>
                {mediaRef
                  ? overflowCount
                    ? `+${overflowCount}`
                    : textByLanguage(language, 'Đã có', 'Added')
                  : emptyLabel}
              </Text>
            </View>
          )
        )
      })}
    </View>
  )
}

export function WorkerV5EvidencePickerActions({
  busy,
  caseWideAura: CaseWideAura,
  documentIcon,
  evidenceIcon,
  language,
  onCamera,
  onLibrary,
  reduceTransparency,
  sourceCardSkin: SourceCardSkin,
}: {
  busy: boolean
  caseWideAura: WorkerV5EvidenceAuraComponent
  documentIcon: ImageSourcePropType
  evidenceIcon: ImageSourcePropType
  language: AppLanguage
  onCamera: () => void
  onLibrary: () => void
  reduceTransparency: boolean
  sourceCardSkin: WorkerV5SourceCardSkinComponent
}) {
  return (
    <View style={styles.evidencePickerRow} testID="worker-v5-evidence-picker-actions">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onCamera}
        style={({ pressed }) => [
          styles.evidencePickerButton,
          reduceTransparency && styles.opaqueCard,
          busy && styles.navButtonDisabled,
          pressed && !busy ? styles.pressed : null,
        ]}
        testID="worker-v5-in-progress-camera-action"
      >
        {!reduceTransparency ? (
          <>
            <SourceCardSkin testID="worker-v5-in-progress-camera-action-card-skin" />
            <CaseWideAura
              scope="JobProgressEvidenceCameraAction"
              testID="worker-v5-in-progress-camera-action-mint-aura"
            />
          </>
        ) : null}
        <Image source={evidenceIcon} style={styles.evidencePickerIcon} testID="worker-v5-in-progress-camera-icon" />
        <Text style={styles.evidencePickerText} numberOfLines={1}>{textByLanguage(language, 'Chụp ảnh', 'Camera')}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onLibrary}
        style={({ pressed }) => [
          styles.evidencePickerButton,
          reduceTransparency && styles.opaqueCard,
          busy && styles.navButtonDisabled,
          pressed && !busy ? styles.pressed : null,
        ]}
        testID="worker-v5-in-progress-library-action"
      >
        {!reduceTransparency ? (
          <>
            <SourceCardSkin testID="worker-v5-in-progress-library-action-card-skin" />
            <CaseWideAura
              scope="JobProgressEvidenceLibraryAction"
              testID="worker-v5-in-progress-library-action-mint-aura"
            />
          </>
        ) : null}
        <Image source={documentIcon} style={styles.evidencePickerIcon} testID="worker-v5-in-progress-library-icon" />
        <Text style={styles.evidencePickerText} numberOfLines={1}>{textByLanguage(language, 'Thư viện', 'Library')}</Text>
      </Pressable>
    </View>
  )
}
