import { useEffect, useMemo, useState } from 'react'

import { supabase } from './supabase'

const JOB_MEDIA_REF_PREFIX = 'supabase://job-media/'
const JOB_MEDIA_STAGES = new Set([
  'access_check_in',
  'after',
  'before',
  'cancellation_evidence',
  'kael_reference',
  'scope_change_evidence',
])

/**
 * Converts only a private job-media storage reference into its object path.
 * Never accept arbitrary Supabase buckets or traversal-like paths here.
 */
export function jobMediaObjectPathFromRef(ref: string): string | null {
  if (!ref.startsWith(JOB_MEDIA_REF_PREFIX)) return null

  const path = ref.slice(JOB_MEDIA_REF_PREFIX.length)
  const segments = path.split('/')
  if (segments.length < 3 || segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  if (!JOB_MEDIA_STAGES.has(segments[1])) return null

  return path
}

export async function resolveJobMediaPreviewUrl(ref: string): Promise<string | null> {
  if (!ref.startsWith('supabase://')) return ref

  const objectPath = jobMediaObjectPathFromRef(ref)
  if (!objectPath || !supabase) return null

  const { data, error } = await supabase.storage.from('job-media').createSignedUrl(objectPath, 15 * 60)
  return error || !data?.signedUrl ? null : data.signedUrl
}

/**
 * Keeps storage references private at rest while making authorized job media
 * renderable in the native image surface for the current participant.
 */
export function useJobMediaPreviewUrls(urls: readonly (string | null | undefined)[]) {
  const key = urls.map((url) => url ?? '').join('\u0000')
  const refs = useMemo(() => urls.map((url) => url?.trim() || null), [key])
  const directUrls = useMemo(
    () => refs.map((ref) => ref && !ref.startsWith('supabase://') ? ref : null),
    [refs],
  )
  const [signedPreview, setSignedPreview] = useState(() => ({
    key,
    urls: refs.map(() => null as string | null),
  }))

  useEffect(() => {
    if (!refs.some((ref) => ref?.startsWith('supabase://'))) return
    let active = true

    void Promise.all(refs.map(async (ref) => ref?.startsWith('supabase://') ? resolveJobMediaPreviewUrl(ref) : null)).then((nextUrls) => {
      if (active) setSignedPreview({ key, urls: nextUrls })
    })

    return () => {
      active = false
    }
  }, [key, refs])

  return directUrls.map((url, index) => url ?? (signedPreview.key === key ? signedPreview.urls[index] : null))
}
