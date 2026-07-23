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

import { JobEvidenceGallery } from '@/components/ui/job-evidence-gallery'
import type { AppLanguage } from '@/lib/app-language'

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

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5EvidenceTray({
  addPhotoDisabled = false,
  emptyLabel,
  language,
  onAddPhoto,
  reduceTransparency,
  stageLabel,
  testID = 'worker-v5-evidence-tray',
  uploadingSlot = null,
  urls,
}: {
  addPhotoDisabled?: boolean
  emptyLabel: string
  language: AppLanguage
  onAddPhoto?: (slot: number) => void
  reduceTransparency: boolean
  stageLabel?: string
  testID?: string
  uploadingSlot?: number | null
  urls: readonly (string | null | undefined)[]
}) {
  return (
    <JobEvidenceGallery
      addPhotoDisabled={addPhotoDisabled}
      emptyLabel={emptyLabel}
      language={language}
      minimumSlots={onAddPhoto ? 3 : 0}
      onAddPhoto={onAddPhoto}
      reduceTransparency={reduceTransparency}
      refs={urls}
      stageLabel={stageLabel ?? textByLanguage(language, 'Bằng chứng công việc', 'Job evidence')}
      testID={testID}
      uploadingSlot={uploadingSlot}
    />
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
