import type { ImagePickerAsset, MediaType } from 'expo-image-picker'
import { SERVICE_TYPES, type ServiceType } from '@nestscout/shared'

import type { LocalMediaUploadDraft } from '@/lib/media-upload'

export const bookingServiceImageIcons: Record<ServiceType, number> = {
  cleaning: require('../../assets/client-image-icons/client-service-cleaning.png'),
  electrical: require('../../assets/client-image-icons/client-service-electrical.png'),
  handyman: require('./v21/assets/service-icons/client-service-handyman-installation.png'),
  hvac: require('./v21/assets/service-icons/client-service-hvac.png'),
  plumbing: require('../../assets/client-image-icons/client-service-plumbing.png'),
  upholstery: require('./v21/assets/service-icons/client-service-upholstery-care.png'),
}

export const bookingEvidenceMediaTypes: MediaType[] = ['images', 'videos']
export const bookingServiceOrder: readonly ServiceType[] = [...SERVICE_TYPES]
export const bookingServiceSegmentWidthPercent = 100 / bookingServiceOrder.length

export function parseRouteServiceType(value: string | string[] | undefined): ServiceType | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && SERVICE_TYPES.includes(raw as ServiceType) ? raw as ServiceType : null
}

export function mergeBookingPhotoDrafts(
  current: LocalMediaUploadDraft[],
  drafts: LocalMediaUploadDraft[],
) {
  const seenUris = new Set(current.map((photo) => photo.uri))
  const merged = [...current]
  for (const draft of drafts) {
    if (seenUris.has(draft.uri)) continue
    seenUris.add(draft.uri)
    merged.push(draft)
    if (merged.length >= 5) break
  }
  return merged
}

export function mediaDraftTypeFromAsset(asset: ImagePickerAsset): LocalMediaUploadDraft['type'] {
  if (asset.type === 'video' || asset.mimeType?.startsWith('video/')) return 'video'
  return 'image'
}
