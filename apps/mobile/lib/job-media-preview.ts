import { useEffect, useMemo, useState } from 'react'

import { supabase } from './supabase'
import { withNetworkDeadline } from './response-guard'

const JOB_MEDIA_REF_PREFIX = 'supabase://job-media/'
const JOB_MEDIA_SIGNED_URL_TIMEOUT_MS = 10_000
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
  const match = path.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([A-Za-z_]+)\/([A-Za-z0-9][A-Za-z0-9._-]{0,220})$/i,
  )
  if (!match || path.includes('..') || !JOB_MEDIA_STAGES.has(match[2])) return null

  return path
}

export function mergeJobMediaRefsNewestFirst(
  ...groups: readonly (readonly string[])[]
) {
  return [...new Set(groups.flat())]
    .filter((ref) => Boolean(jobMediaObjectPathFromRef(ref)))
    .slice(0, 5)
}

function isLocalMediaPreviewUri(ref: string) {
  return /^(?:file|content|ph|assets-library):/i.test(ref)
}

export async function resolveJobMediaPreviewUrl(ref: string): Promise<string | null> {
  if (isLocalMediaPreviewUri(ref)) return ref
  if (!ref.startsWith('supabase://')) return null

  const objectPath = jobMediaObjectPathFromRef(ref)
  const client = supabase
  if (!objectPath || !client) return null

  try {
    const { data, error } = await withNetworkDeadline(
      () => client.storage.from('job-media').createSignedUrl(
        objectPath,
        15 * 60,
        {
          transform: {
            height: 1200,
            quality: 82,
            resize: 'contain',
            width: 1200,
          },
        },
      ),
      JOB_MEDIA_SIGNED_URL_TIMEOUT_MS,
    )
    return error || !data?.signedUrl ? null : data.signedUrl
  } catch {
    return null
  }
}

/**
 * Keeps storage references private at rest while making authorized job media
 * renderable in the native image surface for the current participant.
 */
export function useJobMediaPreviewUrls(urls: readonly (string | null | undefined)[]) {
  const key = JSON.stringify(urls.map((url) => url?.trim() || null))
  const refs = useMemo(
    () => JSON.parse(key) as (string | null)[],
    [key],
  )
  const directUrls = useMemo(
    () => refs.map((ref) => ref && isLocalMediaPreviewUri(ref) ? ref : null),
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
