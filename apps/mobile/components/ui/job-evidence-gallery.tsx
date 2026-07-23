import { useMemo, useState } from 'react'
import { Image } from 'expo-image'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'
import { useGlassAccessibility } from './accessibility-motion'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

type JobEvidenceGalleryProps = {
  addPhotoDisabled?: boolean
  emptyLabel?: string
  language: AppLanguage
  minimumSlots?: number
  onAddPhoto?: (slot: number) => void
  reduceMotion?: boolean
  reduceTransparency?: boolean
  refs: readonly (string | null | undefined)[]
  stageLabel: string
  testID: string
  uploadingSlot?: number | null
}

export function JobEvidenceGallery({
  addPhotoDisabled = false,
  emptyLabel,
  language,
  minimumSlots = 0,
  onAddPhoto,
  reduceMotion,
  reduceTransparency,
  refs,
  stageLabel,
  testID,
  uploadingSlot = null,
}: JobEvidenceGalleryProps) {
  const accessibility = useGlassAccessibility()
  const shouldReduceMotion = reduceMotion ?? accessibility.reduceMotion
  const shouldReduceTransparency = reduceTransparency ?? accessibility.reduceTransparency
  const refsKey = JSON.stringify(refs.map((ref) => ref?.trim() || null))
  const slots = useMemo(() => {
    const normalized = JSON.parse(refsKey) as (string | null)[]
    const slotCount = onAddPhoto
      ? Math.max(minimumSlots, normalized.length)
      : normalized.length
    return Array.from({ length: slotCount }, (_, index) => normalized[index] ?? null)
  }, [minimumSlots, onAddPhoto, refsKey])
  const previewUrls = useJobMediaPreviewUrls(slots)
  const viewerItems = slots.flatMap((ref, slot) => ref
    ? [{ previewUrl: previewUrls[slot] ?? null, ref, slot }]
    : [])
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const visibleViewerIndex = viewerIndex === null
    ? null
    : Math.min(viewerIndex, Math.max(viewerItems.length - 1, 0))
  const activeItem = visibleViewerIndex === null ? null : viewerItems[visibleViewerIndex] ?? null
  const copy = language === 'vi'
    ? {
        add: 'Thêm ảnh',
        close: 'Đóng',
        empty: emptyLabel ?? 'Chưa có ảnh',
        image: 'Ảnh',
        next: 'Ảnh tiếp theo',
        previous: 'Ảnh trước',
        unavailable: 'Chưa thể mở ảnh',
        zoomIn: 'Phóng to',
        zoomOut: 'Thu nhỏ',
      }
    : {
        add: 'Add photo',
        close: 'Close',
        empty: emptyLabel ?? 'No photos',
        image: 'Photo',
        next: 'Next photo',
        previous: 'Previous photo',
        unavailable: 'Photo unavailable',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
      }

  const closeViewer = () => {
    setViewerIndex(null)
    setZoom(MIN_ZOOM)
  }
  const openViewer = (index: number) => {
    setZoom(MIN_ZOOM)
    setViewerIndex(index)
  }
  const moveViewer = (direction: -1 | 1) => {
    if (visibleViewerIndex === null || viewerItems.length === 0) return
    setZoom(MIN_ZOOM)
    setViewerIndex((visibleViewerIndex + direction + viewerItems.length) % viewerItems.length)
  }

  if (slots.length === 0) {
    return (
      <View
        style={[
          styles.emptyState,
          shouldReduceTransparency ? styles.opaqueSurface : null,
        ]}
        testID={`${testID}-empty`}
      >
        <Text style={styles.emptyText}>{copy.empty}</Text>
      </View>
    )
  }

  return (
    <>
      <View style={styles.grid} testID={testID}>
        {slots.map((ref, slot) => {
          const previewUrl = previewUrls[slot] ?? null
          const viewerItemIndex = viewerItems.findIndex((item) => item.slot === slot)
          if (!ref && onAddPhoto) {
            const isUploading = uploadingSlot === slot
            return (
              <Pressable
                accessibilityLabel={`${copy.add} ${slot + 1}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: addPhotoDisabled }}
                disabled={addPhotoDisabled}
                key={`add-${slot}`}
                onPress={() => onAddPhoto(slot)}
                style={({ pressed }) => [
                  styles.tile,
                  styles.addTile,
                  shouldReduceTransparency ? styles.opaqueSurface : null,
                  addPhotoDisabled ? styles.disabled : null,
                  pressed && !addPhotoDisabled
                    ? (shouldReduceMotion ? styles.pressedWithoutMotion : styles.pressed)
                    : null,
                ]}
                testID={`${testID}-add-${slot}`}
              >
                <Text style={styles.addMark}>+</Text>
                <Text numberOfLines={1} style={styles.badge}>
                  {isUploading
                    ? (language === 'vi' ? 'Đang gửi' : 'Uploading')
                    : copy.add}
                </Text>
              </Pressable>
            )
          }

          if (!ref) {
            return (
              <View
                key={`empty-${slot}`}
                style={[
                  styles.tile,
                  styles.addTile,
                  shouldReduceTransparency ? styles.opaqueSurface : null,
                ]}
                testID={`${testID}-empty-${slot}`}
              >
                <Text style={styles.emptyText}>{copy.empty}</Text>
              </View>
            )
          }

          return (
            <Pressable
              accessibilityHint={language === 'vi' ? 'Mở ảnh toàn màn hình' : 'Open full-screen photo'}
              accessibilityLabel={`${stageLabel}, ${copy.image.toLowerCase()} ${viewerItemIndex + 1}/${viewerItems.length}`}
              accessibilityRole="button"
              key={`${ref}-${slot}`}
              onPress={() => openViewer(viewerItemIndex)}
              style={({ pressed }) => [
                styles.tile,
                shouldReduceTransparency ? styles.opaqueSurface : null,
                pressed
                  ? (shouldReduceMotion ? styles.pressedWithoutMotion : styles.pressed)
                  : null,
              ]}
              testID={`${testID}-tile-${viewerItemIndex}`}
            >
              {previewUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="contain"
                  source={{ uri: previewUrl }}
                  style={styles.image}
                  testID={`${testID}-image-${viewerItemIndex}`}
                />
              ) : (
                <Text style={styles.unavailableText}>{copy.unavailable}</Text>
              )}
              <Text numberOfLines={1} style={styles.badge}>
                {viewerItemIndex + 1}/{viewerItems.length}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Modal
        animationType={shouldReduceMotion ? 'none' : 'fade'}
        onRequestClose={closeViewer}
        presentationStyle="overFullScreen"
        transparent
        visible={activeItem !== null}
      >
        <View
          accessibilityViewIsModal
          style={styles.viewer}
          testID={`${testID}-viewer`}
        >
          <View style={styles.viewerHeader}>
            <View style={styles.viewerTitleGroup}>
              <Text numberOfLines={1} style={styles.viewerTitle}>{stageLabel}</Text>
              <Text style={styles.viewerCounter} testID={`${testID}-viewer-counter`}>
                {(visibleViewerIndex ?? 0) + 1} / {viewerItems.length}
              </Text>
            </View>
            <Pressable
              accessibilityLabel={copy.close}
              accessibilityRole="button"
              onPress={closeViewer}
              style={({ pressed }) => [styles.viewerButton, pressed ? styles.viewerButtonPressed : null]}
              testID={`${testID}-viewer-close`}
            >
              <Text style={styles.viewerButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            bounces={false}
            centerContent
            contentContainerStyle={styles.viewerCanvas}
            maximumZoomScale={MAX_ZOOM}
            minimumZoomScale={MIN_ZOOM}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.viewerImageFrame, { transform: [{ scale: zoom }] }]}>
              {activeItem?.previewUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  contentFit="contain"
                  source={{ uri: activeItem.previewUrl }}
                  style={styles.viewerImage}
                  testID={`${testID}-viewer-image`}
                />
              ) : (
                <Text style={styles.viewerUnavailable}>{copy.unavailable}</Text>
              )}
            </View>
          </ScrollView>

          <View style={styles.viewerControls}>
            <Pressable
              accessibilityLabel={copy.previous}
              accessibilityRole="button"
              disabled={viewerItems.length < 2}
              onPress={() => moveViewer(-1)}
              style={({ pressed }) => [
                styles.viewerButton,
                viewerItems.length < 2 ? styles.disabled : null,
                pressed ? styles.viewerButtonPressed : null,
              ]}
              testID={`${testID}-viewer-previous`}
            >
              <Text style={styles.viewerButtonText}>‹</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.zoomOut}
              accessibilityRole="button"
              accessibilityState={{ disabled: zoom <= MIN_ZOOM }}
              disabled={zoom <= MIN_ZOOM}
              onPress={() => setZoom((current) => Math.max(MIN_ZOOM, current - ZOOM_STEP))}
              style={({ pressed }) => [
                styles.viewerButton,
                zoom <= MIN_ZOOM ? styles.disabled : null,
                pressed ? styles.viewerButtonPressed : null,
              ]}
              testID={`${testID}-viewer-zoom-out`}
            >
              <Text style={styles.viewerButtonText}>−</Text>
            </Pressable>
            <Text style={styles.zoomValue} testID={`${testID}-viewer-zoom-value`}>
              {Math.round(zoom * 100)}%
            </Text>
            <Pressable
              accessibilityLabel={copy.zoomIn}
              accessibilityRole="button"
              accessibilityState={{ disabled: zoom >= MAX_ZOOM }}
              disabled={zoom >= MAX_ZOOM}
              onPress={() => setZoom((current) => Math.min(MAX_ZOOM, current + ZOOM_STEP))}
              style={({ pressed }) => [
                styles.viewerButton,
                zoom >= MAX_ZOOM ? styles.disabled : null,
                pressed ? styles.viewerButtonPressed : null,
              ]}
              testID={`${testID}-viewer-zoom-in`}
            >
              <Text style={styles.viewerButtonText}>+</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={copy.next}
              accessibilityRole="button"
              disabled={viewerItems.length < 2}
              onPress={() => moveViewer(1)}
              style={({ pressed }) => [
                styles.viewerButton,
                viewerItems.length < 2 ? styles.disabled : null,
                pressed ? styles.viewerButtonPressed : null,
              ]}
              testID={`${testID}-viewer-next`}
            >
              <Text style={styles.viewerButtonText}>›</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  addMark: {
    color: '#087F75',
    fontSize: 32,
    fontWeight: '500',
    lineHeight: 36,
  },
  addTile: {
    alignItems: 'center',
    backgroundColor: '#E5F1EF',
    justifyContent: 'center',
  },
  badge: {
    backgroundColor: 'rgba(4,29,34,0.72)',
    borderRadius: 999,
    bottom: 7,
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    maxWidth: '80%',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: 7,
  },
  disabled: {
    opacity: 0.46,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: '#E5F1EF',
    borderColor: 'rgba(151,196,189,0.5)',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 92,
    padding: 16,
  },
  emptyText: {
    color: '#607976',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  image: {
    height: '100%',
    width: '100%',
  },
  opaqueSurface: {
    backgroundColor: '#F7FBFA',
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.985 }],
  },
  pressedWithoutMotion: {
    opacity: 0.84,
  },
  tile: {
    aspectRatio: 4 / 3,
    backgroundColor: '#DCE8E6',
    borderColor: 'rgba(255,255,255,0.94)',
    borderRadius: 18,
    borderWidth: 1,
    minWidth: 88,
    overflow: 'hidden',
    position: 'relative',
    width: '31%',
  },
  unavailableText: {
    color: '#607976',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 14,
    paddingHorizontal: 8,
    position: 'absolute',
    textAlign: 'center',
    top: '38%',
    width: '100%',
  },
  viewer: {
    backgroundColor: 'rgba(3,15,18,0.97)',
    flex: 1,
    paddingBottom: 24,
    paddingHorizontal: 14,
    paddingTop: 46,
  },
  viewerButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  viewerButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  viewerButtonText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '500',
    lineHeight: 30,
  },
  viewerCanvas: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 320,
  },
  viewerControls: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    paddingTop: 16,
  },
  viewerCounter: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  viewerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  viewerImage: {
    height: '100%',
    width: '100%',
  },
  viewerImageFrame: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    minHeight: 320,
    width: '100%',
  },
  viewerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 21,
  },
  viewerTitleGroup: {
    flex: 1,
    gap: 2,
  },
  viewerUnavailable: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '600',
  },
  zoomValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    minWidth: 44,
    textAlign: 'center',
  },
})
