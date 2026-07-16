import { Image } from 'expo-image'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import type { CustomerThemeTokens } from '../customer-theme'

export function MediaDraftPreviewTray({
  busy,
  drafts,
  language,
  onRemove,
  tokens,
}: {
  busy: boolean
  drafts: LocalMediaUploadDraft[]
  language: AppLanguage
  onRemove: (index: number) => void
  tokens: CustomerThemeTokens
}) {
  if (drafts.length === 0) return null
  const includesVideo = drafts.some((draft) => draft.type === 'video')

  return (
    <View style={styles.root} testID="customer-kael-media-draft-previews">
      {drafts.map((draft, index) => (
        <View
          key={`${draft.uri}:${index}`}
          style={[styles.previewItem, { backgroundColor: tokens.service, borderColor: tokens.border }]}
        >
          {draft.type === 'image' ? (
            <Image accessibilityIgnoresInvertColors source={{ uri: draft.uri }} style={styles.previewImage} />
          ) : (
            <View style={[styles.previewImage, styles.videoBadge, { backgroundColor: tokens.ghost }]}>
              <Text style={[styles.videoText, { color: tokens.primary }]}>VIDEO</Text>
            </View>
          )}
          <Text numberOfLines={1} style={[styles.previewName, { color: tokens.text }]}>
            {draft.fileName?.trim() || (draft.type === 'video'
              ? (language === 'vi' ? 'Video đã chọn' : 'Selected video')
              : (language === 'vi' ? 'Ảnh đã chọn' : 'Selected photo'))}
          </Text>
          <Pressable
            accessibilityLabel={language === 'vi' ? 'Bỏ tệp đã chọn' : 'Remove selected file'}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            hitSlop={4}
            onPress={() => onRemove(index)}
            style={styles.removeButton}
            testID={`customer-kael-media-draft-remove-${index}`}
          >
            <Text style={[styles.removeText, { color: tokens.primary }]}>{language === 'vi' ? 'Bỏ' : 'Remove'}</Text>
          </Pressable>
        </View>
      ))}
      {includesVideo ? (
        <Text style={[styles.disclosure, { color: tokens.muted }]} testID="customer-kael-video-privacy-disclosure">
          {language === 'vi'
            ? 'Video gốc được lưu riêng tư cho người có quyền xem lại; Kael chỉ phân tích 1–3 khung hình tách trên thiết bị.'
            : 'The original video is stored privately for authorized review; Kael analyzes only 1–3 frames extracted on your device.'}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  disclosure: { fontSize: 11, lineHeight: 16 },
  previewImage: { borderRadius: 8, height: 40, width: 40 },
  previewItem: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 7 },
  previewName: { flex: 1, fontSize: 12 },
  removeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 7 },
  removeText: { fontSize: 12, fontWeight: '700' },
  root: { gap: 7 },
  videoBadge: { alignItems: 'center', justifyContent: 'center' },
  videoText: { fontSize: 8, fontWeight: '800' },
})
