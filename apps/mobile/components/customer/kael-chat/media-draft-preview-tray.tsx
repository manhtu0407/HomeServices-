import { typography } from '@/design/theme'
import { Image } from 'expo-image'
import { useMemo } from 'react'
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import type { CustomerThemeTokens } from '../customer-theme'

export function MediaDraftPreviewTray({
  busy,
  drafts,
  language,
  onRemove,
  variant = 'case',
  tokens,
}: {
  busy: boolean
  drafts: LocalMediaUploadDraft[]
  language: AppLanguage
  onRemove: (index: number) => void
  variant?: 'case' | 'composer-images'
  tokens: CustomerThemeTokens
}) {
  const imageDrafts = useMemo(() => drafts.flatMap((draft, index) => {
    if (draft.type !== 'image') return []
    return [{
      accessibilityLabel: language === 'vi' ? 'Ảnh đã chọn' : 'Selected photo',
      accessibilityState: { disabled: busy },
      frameStyle: [styles.composerImageFrame, { borderColor: tokens.border }],
      imageSource: { uri: draft.uri },
      index,
      key: `${draft.uri}:${index}`,
      onRemove: () => onRemove(index),
      removeAccessibilityLabel: language === 'vi' ? 'Xóa ảnh đã chọn' : 'Remove selected photo',
      removeButtonStyle: [styles.composerRemoveButton, { backgroundColor: tokens.raised, borderColor: tokens.border }],
      removeTextStyle: [styles.composerRemoveText, { color: tokens.text }],
    }]
  }), [busy, drafts, language, onRemove, tokens.border, tokens.raised, tokens.text])

  if (drafts.length === 0) return null

  if (variant === 'composer-images') {
    if (imageDrafts.length === 0) return null

    return (
      <FlatList
        contentContainerStyle={styles.composerImageRailContent}
        data={imageDrafts}
        horizontal
        keyExtractor={keyComposerImageDraft}
        showsHorizontalScrollIndicator={false}
        renderItem={renderComposerImageDraft}
        style={styles.composerImageRail}
        testID="customer-kael-composer-image-rail"
      />
    )
  }

  const includesVideo = drafts.some((draft) => draft.type === 'video')

  return (
    <View style={styles.root} testID="customer-kael-media-draft-previews">
      {drafts.map((draft, index) => (
        <View
          key={`${draft.uri}:${index}`}
          style={[styles.previewItem, { backgroundColor: tokens.service, borderColor: tokens.border }]}
        >
          {draft.type === 'image' ? (
            <Image accessibilityIgnoresInvertColors contentFit="contain" source={{ uri: draft.uri }} style={styles.previewImage} />
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

type ComposerImageDraftRow = {
  accessibilityLabel: string
  accessibilityState: { disabled: boolean }
  frameStyle: StyleProp<ViewStyle>
  imageSource: { uri: string }
  index: number
  key: string
  onRemove: () => void
  removeAccessibilityLabel: string
  removeButtonStyle: StyleProp<ViewStyle>
  removeTextStyle: StyleProp<TextStyle>
}

function keyComposerImageDraft(item: ComposerImageDraftRow) {
  return item.key
}

function renderComposerImageDraft({ item }: ListRenderItemInfo<ComposerImageDraftRow>) {
  const { key, ...props } = item
  return <ComposerImageDraftRowView key={key} {...props} />
}

function ComposerImageDraftRowView({
  accessibilityLabel,
  accessibilityState,
  frameStyle,
  imageSource,
  index,
  onRemove,
  removeAccessibilityLabel,
  removeButtonStyle,
  removeTextStyle,
}: ComposerImageDraftRow) {
  return (
    <View style={frameStyle}>
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={accessibilityLabel}
        accessible
        contentFit="cover"
        source={imageSource}
        style={styles.composerImage}
        testID={`customer-kael-composer-image-${index}`}
      />
      <Pressable
        accessibilityLabel={removeAccessibilityLabel}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        disabled={accessibilityState.disabled}
        hitSlop={7}
        onPress={onRemove}
        style={removeButtonStyle}
        testID={`customer-kael-media-draft-remove-${index}`}
      >
        <Text style={removeTextStyle}>×</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  composerImage: { borderRadius: 15, height: 112, width: 112 },
  composerImageFrame: {
    borderRadius: 16,
    borderWidth: 1,
    height: 114,
    marginRight: 10,
    position: 'relative',
    width: 114,
  },
  composerImageRail: { flexGrow: 0, maxHeight: 126, width: '100%' },
  composerImageRailContent: { alignItems: 'center', paddingHorizontal: 5, paddingVertical: 7 },
  composerRemoveButton: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    position: 'absolute',
    right: -6,
    top: -6,
    width: 30,
  },
  composerRemoveText: { fontSize: 22, fontWeight: '500', lineHeight: 24, marginTop: -2 },
  disclosure: { ...typography.caption2 },
  previewImage: { borderRadius: 8, height: 40, width: 40 },
  previewItem: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 7 },
  previewName: { flex: 1, ...typography.caption1 },
  removeButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44, paddingHorizontal: 7 },
  removeText: { ...typography.caption1, fontWeight: '600' },
  root: { gap: 7 },
  videoBadge: { alignItems: 'center', justifyContent: 'center' },
  videoText: { ...typography.caption2, fontWeight: '600' },
})
