import { Image } from 'expo-image'

// Avatars and job evidence are private to the account; nothing decoded or downloaded outlives its session.
export function clearAccountImageCache() {
  try {
    void Image.clearMemoryCache().catch(() => undefined)
    void Image.clearDiskCache().catch(() => undefined)
  } catch {
    // The native image module is absent in some test and web runtimes; there is nothing to clear there.
  }
}

const SIGNED_OBJECT_PATH = /\/storage\/v1\/object\/sign\/([^?#]+)/

// A Supabase signed URL carries a fresh token every time it is re-signed, so keyed by URL the
// image cache downloads the same picture again. Uploads get a new random object path, so the
// bucket/path pair names the content and changes exactly when the picture does.
export function stableImageSource(uri: string): { uri: string; cacheKey?: string } {
  const match = SIGNED_OBJECT_PATH.exec(uri)
  return match ? { uri, cacheKey: `supabase-object:${decodeURIComponent(match[1])}` } : { uri }
}
