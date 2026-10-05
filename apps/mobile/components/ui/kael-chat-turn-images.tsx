import { Image } from 'expo-image'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import type { KaelChatTurnImage } from '@/lib/kael-chat-local-media'

type Colors = { border: string; muted: string; surface: string }

// The photos a person sent, shown above their message like the composer thumbnails they picked.
// A photo past retention or one that cannot load is a labelled tile, never a blank gap.
export function KaelChatTurnImages({
  colors,
  images,
  language,
  testID,
}: {
  colors: Colors
  images: readonly KaelChatTurnImage[]
  language: AppLanguage
  testID: string
}) {
  if (images.length === 0) return null
  return (
    <View style={styles.row} testID={testID}>
      {images.map((image, index) => (
        <KaelChatTurnImageTile colors={colors} image={image} key={image.key} language={language} testID={`${testID}-${index}`} />
      ))}
    </View>
  )
}

function KaelChatTurnImageTile({
  colors,
  image,
  language,
  testID,
}: {
  colors: Colors
  image: KaelChatTurnImage
  language: AppLanguage
  testID: string
}) {
  // A failed load belongs to that URL only: a refreshed signed URL for the same photo retries.
  const [failedUri, setFailedUri] = useState<string | null>(null)
  const status = failedUri !== null && failedUri === image.uri ? 'unavailable' : image.status
  if (status !== 'available' || !image.uri) {
    const label = status === 'expired'
      ? language === 'vi' ? 'Ảnh đã hết hạn lưu' : 'Photo no longer kept'
      : language === 'vi' ? 'Chưa tải được ảnh' : 'Photo could not load'
    return (
      <View
        accessibilityLabel={label}
        accessible
        style={[styles.frame, styles.placeholder, { backgroundColor: colors.surface, borderColor: colors.border }]}
        testID={`${testID}-${status}`}
      >
        <Text style={[styles.placeholderText, { color: colors.muted }]}>{label}</Text>
      </View>
    )
  }
  return (
    <View style={[styles.frame, { borderColor: colors.border }]}>
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={language === 'vi' ? 'Ảnh bạn đã gửi' : 'Photo you sent'}
        accessible
        contentFit="cover"
        onError={() => setFailedUri(image.uri ?? null)}
        source={{ uri: image.uri }}
        style={styles.image}
        testID={testID}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { borderRadius: 16, borderWidth: 1, height: 114, overflow: 'hidden', width: 114 },
  image: { height: 112, width: 112 },
  placeholder: { alignItems: 'center', justifyContent: 'center', padding: 10 },
  placeholderText: { ...typography.caption2, textAlign: 'center' },
  row: { alignSelf: 'flex-end', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end', maxWidth: '84%' },
})
