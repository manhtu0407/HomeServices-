import type { ComponentType } from 'react'
import {
  Image,
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
  emptyLabel,
  evidenceIcon,
  language,
  reduceTransparency,
  urls,
}: {
  emptyLabel: string
  evidenceIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  urls: readonly string[]
}) {
  const slots = [0, 1, 2]
  return (
    <View style={styles.evidenceTray} testID="worker-v5-evidence-tray">
      {slots.map((slot) => {
        const url = urls[slot]
        const overflowCount = slot === 2 && urls.length > 3 ? urls.length - 2 : 0
        return (
          <View
            key={slot}
            style={[styles.evidenceTrayTile, reduceTransparency && styles.opaqueCard]}
            testID={`worker-v5-evidence-tray-tile-${slot}`}
          >
            {url ? (
              <Image source={{ uri: url }} style={styles.evidenceTrayImage} />
            ) : (
              <View style={styles.evidenceTrayIconShell}>
                {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.iconTileMintAura} /> : null}
                <Image source={evidenceIcon} style={styles.evidenceTrayIcon} />
              </View>
            )}
            <Text style={styles.evidenceTrayBadge} numberOfLines={1} testID={`worker-v5-evidence-tray-badge-${slot}`}>
              {url
                ? overflowCount
                  ? `+${overflowCount}`
                  : textByLanguage(language, 'Đã có', 'Added')
                : emptyLabel}
            </Text>
          </View>
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
