import { typography } from '@/design/theme'
import { Image } from 'expo-image'
import { useMemo } from 'react'
import Svg, { Path } from 'react-native-svg'
import {
  FlatList,
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

import { LiquidControlButton } from '@/components/ui/liquid-back-button'

import type { CustomerThemeTokens } from '../customer-theme'

// Every picked photo or video reads as its own thumbnail with an X in the corner; filenames are
// never shown, so removing or swapping a pick is one tap on the media itself.
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
  const rows = useMemo(() => drafts.flatMap((draft, index): ComposerMediaDraftRow[] => {
    if (draft.type !== 'image' && draft.type !== 'video') return []
    const isVideo = draft.type === 'video'
    return [{
      accessibilityLabel: isVideo
        ? (language === 'vi' ? 'Video đã chọn' : 'Selected video')
        : (language === 'vi' ? 'Ảnh đã chọn' : 'Selected photo'),
      disabled: busy,
      frameStyle: [styles.frame, { borderColor: tokens.border }],
      imageSource: isVideo ? null : { uri: draft.uri },
      index,
      key: `${draft.uri}:${index}`,
      mode: tokens.mode,
      onRemove: () => onRemove(index),
      removeAccessibilityLabel: isVideo
        ? (language === 'vi' ? 'Xóa video đã chọn' : 'Remove selected video')
        : (language === 'vi' ? 'Xóa ảnh đã chọn' : 'Remove selected photo'),
      removeGlyphColor: tokens.text,
      videoLabelStyle: [styles.videoText, { color: tokens.primary }],
      videoTileStyle: [styles.media, styles.videoTile, { backgroundColor: tokens.service }],
    }]
  }), [busy, drafts, language, onRemove, tokens.border, tokens.mode, tokens.primary, tokens.service, tokens.text])

  if (rows.length === 0) return null
  const includesVideo = drafts.some((draft) => draft.type === 'video')

  return (
    <View style={styles.root} testID="customer-kael-media-draft-previews">
      <FlatList
        contentContainerStyle={styles.railContent}
        data={rows}
        horizontal
        keyExtractor={keyComposerMediaDraft}
        showsHorizontalScrollIndicator={false}
        renderItem={renderComposerMediaDraft}
        style={styles.rail}
        testID="customer-kael-composer-image-rail"
      />
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

type ComposerMediaDraftRow = {
  accessibilityLabel: string
  disabled: boolean
  frameStyle: StyleProp<ViewStyle>
  imageSource: { uri: string } | null
  index: number
  key: string
  mode: CustomerThemeTokens['mode']
  onRemove: () => void
  removeAccessibilityLabel: string
  removeGlyphColor: string
  videoLabelStyle: StyleProp<TextStyle>
  videoTileStyle: StyleProp<ViewStyle>
}

function keyComposerMediaDraft(item: ComposerMediaDraftRow) {
  return item.key
}

function renderComposerMediaDraft({ item }: ListRenderItemInfo<ComposerMediaDraftRow>) {
  const { key, ...props } = item
  return <ComposerMediaDraftRowView key={key} {...props} />
}

function ComposerMediaDraftRowView({
  accessibilityLabel,
  disabled,
  frameStyle,
  imageSource,
  index,
  mode,
  onRemove,
  removeAccessibilityLabel,
  removeGlyphColor,
  videoLabelStyle,
  videoTileStyle,
}: Omit<ComposerMediaDraftRow, 'key'>) {
  return (
    <View style={frameStyle}>
      {imageSource ? (
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={accessibilityLabel}
          accessible
          contentFit="cover"
          source={imageSource}
          style={styles.media}
          testID={`customer-kael-composer-image-${index}`}
        />
      ) : (
        <View
          accessibilityLabel={accessibilityLabel}
          accessible
          style={videoTileStyle}
          testID={`customer-kael-composer-video-${index}`}
        >
          <Text style={videoLabelStyle}>Video</Text>
        </View>
      )}
      <LiquidControlButton
        accessibilityLabel={removeAccessibilityLabel}
        disabled={disabled}
        hitSlop={7}
        mode={mode}
        onPress={onRemove}
        size={30}
        style={styles.removeButton}
        testID={`customer-kael-media-draft-remove-${index}`}
      >
        <RemoveGlyph color={removeGlyphColor} />
      </LiquidControlButton>
    </View>
  )
}

// A drawn cross sits on the button's geometric centre; a text "×" rides on font metrics and
// lands off-centre by a different amount on each platform.
function RemoveGlyph({ color }: { color: string }) {
  return (
    <Svg height={12} pointerEvents="none" testID="customer-kael-media-draft-remove-glyph" viewBox="0 0 12 12" width={12}>
      <Path d="M2 2L10 10M10 2L2 10" fill="none" stroke={color} strokeLinecap="round" strokeWidth={1.8} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  disclosure: { ...typography.caption2, paddingHorizontal: 8 },
  frame: {
    borderRadius: 16,
    borderWidth: 1,
    height: 114,
    marginRight: 10,
    position: 'relative',
    width: 114,
  },
  media: { borderRadius: 15, height: 112, width: 112 },
  rail: { flexGrow: 0, maxHeight: 126, width: '100%' },
  railContent: { alignItems: 'center', paddingHorizontal: 5, paddingVertical: 7 },
  removeButton: {
    position: 'absolute',
    right: -6,
    top: -6,
  },
  root: { gap: 4, width: '100%' },
  videoText: { ...typography.caption1, fontWeight: '600' },
  videoTile: { alignItems: 'center', justifyContent: 'center' },
})
