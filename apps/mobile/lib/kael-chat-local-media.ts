// Photos sent from this device keep their on-device URI for the rest of the app session, so a
// just-sent turn shows its photos at once instead of waiting for a signed link. Bounded, in memory
// only: nothing here is persisted, and a reopened app reads the server preview links instead.
const MAX_REMEMBERED_PHOTOS = 60
const localUriByMediaRef = new Map<string, string>()

export function rememberKaelChatLocalMedia(mediaRefs: readonly string[], localUris: readonly string[]) {
  if (mediaRefs.length !== localUris.length) return
  mediaRefs.forEach((mediaRef, index) => {
    localUriByMediaRef.delete(mediaRef)
    localUriByMediaRef.set(mediaRef, localUris[index])
  })
  while (localUriByMediaRef.size > MAX_REMEMBERED_PHOTOS) {
    const oldest = localUriByMediaRef.keys().next().value
    if (oldest === undefined) break
    localUriByMediaRef.delete(oldest)
  }
}

export function localKaelChatMediaUri(mediaRef: string) {
  return localUriByMediaRef.get(mediaRef) ?? null
}

export type KaelChatMediaPreview = {
  ref: string
  status: 'available' | 'expired' | 'unavailable'
  url: string | null
}

export type KaelChatTurnImage = {
  key: string
  status: 'available' | 'expired' | 'unavailable'
  uri: string | null
}

// A device URI wins; otherwise the server preview decides. A turn from a server that sends no
// previews reads as unavailable rather than pretending the photo was deleted.
export function kaelChatTurnImages(
  mediaRefs: readonly string[] | undefined,
  previews: readonly KaelChatMediaPreview[] | undefined,
): KaelChatTurnImage[] {
  return (mediaRefs ?? []).map((mediaRef) => {
    const localUri = localKaelChatMediaUri(mediaRef)
    if (localUri) return { key: mediaRef, status: 'available', uri: localUri }
    const preview = previews?.find((item) => item.ref === mediaRef)
    if (preview?.status === 'available' && preview.url) return { key: mediaRef, status: 'available', uri: preview.url }
    return { key: mediaRef, status: preview?.status === 'expired' ? 'expired' : 'unavailable', uri: null }
  })
}
