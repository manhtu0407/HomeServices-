import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelButton } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import {
  cameraPermissionAllowsAccess,
  presentBlockedCameraSettings,
  resolveUserInitiatedCameraPermission,
  shouldOfferCameraSettings,
} from '@/lib/user-initiated-camera-permission'

type PhotoDraft = { uri: string; mimeType: 'image/jpeg' | 'image/png' }

export type EvidencePhotoPalette = { text: string; muted: string; border: string; tile: string; raised: string }

function toDraft(asset: ImagePicker.ImagePickerAsset): PhotoDraft {
  return { uri: asset.uri, mimeType: asset.mimeType === 'image/png' ? 'image/png' : 'image/jpeg' }
}

// Square photo slots, three to a row, filled from the camera or the library. Customer claims and
// worker appeals use the same slots so evidence looks and behaves the same on both sides.
export function EvidencePhotoSlots<T extends PhotoDraft>({ label, language, max, onChange, palette, photos, testID }: {
  label: string
  language: AppLanguage
  max: number
  onChange: (photos: T[]) => void
  palette: EvidencePhotoPalette
  photos: T[]
  testID: string
}) {
  const vi = language === 'vi'
  const [pickerFailed, setPickerFailed] = useState(false)
  const remaining = max - photos.length

  const add = async (source: 'camera' | 'library') => {
    try {
      if (source === 'camera' && Platform.OS !== 'web') {
        const permission = await resolveUserInitiatedCameraPermission()
        if (!cameraPermissionAllowsAccess(permission)) {
          if (shouldOfferCameraSettings(permission)) presentBlockedCameraSettings(language)
          return
        }
      }
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.82 })
        : await ImagePicker.launchImageLibraryAsync({
          allowsMultipleSelection: true,
          mediaTypes: ['images'],
          quality: 0.82,
          selectionLimit: Math.max(1, remaining),
        })
      if (result.canceled) return
      onChange([...photos, ...(result.assets.map(toDraft) as T[])].slice(0, max))
      setPickerFailed(false)
    } catch {
      setPickerFailed(true)
    }
  }

  return (
    <View style={styles.stack} testID={testID}>
      <Text style={[styles.label, { color: palette.text }]}>
        {label}
      </Text>
      <View style={styles.row}>
        {Array.from({ length: max }, (_, index) => {
          const photo = photos[index]
          return (
            <View key={index} style={[styles.slot, { backgroundColor: palette.tile, borderColor: palette.border }]} testID={`${testID}-slot-${index}`}>
              {photo ? (
                <>
                  <Image accessibilityIgnoresInvertColors contentFit="cover" source={{ uri: photo.uri }} style={styles.image} />
                  <Pressable
                    accessibilityLabel={vi ? `Bỏ ảnh ${index + 1}` : `Remove photo ${index + 1}`}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => onChange(photos.filter((_, other) => other !== index))}
                    style={[styles.remove, { backgroundColor: palette.raised, borderColor: palette.border }]}
                    testID={`${testID}-remove-${index}`}
                  >
                    <Svg height={12} viewBox="0 0 24 24" width={12}>
                      <Path d="M6 6l12 12M18 6 6 18" stroke={palette.text} strokeLinecap="round" strokeWidth={2.6} />
                    </Svg>
                  </Pressable>
                </>
              ) : (
                <Text style={[styles.empty, { color: palette.muted }]}>{vi ? 'Trống' : 'Empty'}</Text>
              )}
            </View>
          )
        })}
      </View>
      {remaining > 0 ? (
        <View style={styles.actions}>
          <KaelButton label={vi ? 'Chụp ảnh' : 'Take photo'} onPress={() => { void add('camera') }} size="small" style={styles.action} testID={`${testID}-camera`} variant="secondary" />
          <KaelButton label={vi ? 'Chọn từ máy' : 'Choose photos'} onPress={() => { void add('library') }} size="small" style={styles.action} testID={`${testID}-library`} variant="secondary" />
        </View>
      ) : null}
      {pickerFailed ? (
        <Text accessibilityRole="alert" style={[styles.empty, { color: palette.text }]}>
          {vi ? 'Chưa mở được ảnh. Thử lại hoặc chọn ảnh khác.' : 'Could not open the photo. Try again or pick another.'}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  stack: {
    gap: 8,
  },
  label: {
    ...typography.footnote,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slot: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    flexBasis: '30%',
    flexGrow: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    height: '100%',
    width: '100%',
  },
  empty: {
    ...typography.caption1,
  },
  remove: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flex: 1,
  },
})
