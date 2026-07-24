import { localizedServiceLabel, type AppLanguage } from '@/lib/app-language'
import type { WorkerProfileResponse } from '@/lib/api-types'

import type { WorkerV5IconName } from '../dock/types'
import { textByLanguage } from '../ui/format'
import { workerVerificationLabel } from '../ui/labels'

export type WorkerV5VerificationCheck = {
  done: boolean
  icon: WorkerV5IconName
  meta: string
  title: string
}

export function workerV5VerificationChecks(
  profile: WorkerProfileResponse | null | undefined,
  language: AppLanguage,
): WorkerV5VerificationCheck[] {
  const selectedServices = profile?.selected_service_types
    ?? profile?.active_service_types
    ?? profile?.service_types
    ?? []
  const services = selectedServices.length
    ? selectedServices.map((service) => localizedServiceLabel(service, language)).join(', ')
    : textByLanguage(language, 'Chưa có dịch vụ đã ghi', 'No saved services')
  return [
    {
      done: Boolean(profile?.has_cccd),
      icon: 'document',
      meta: profile?.has_cccd
        ? textByLanguage(language, 'CCCD đã được ghi nhận trong hồ sơ', 'ID card is recorded in the profile')
        : textByLanguage(language, 'Chưa có CCCD trong hồ sơ', 'No ID card in profile'),
      title: textByLanguage(language, 'CCCD trong hồ sơ', 'ID card on file'),
    },
    {
      done: Boolean(profile?.has_selfie),
      icon: 'profile',
      meta: profile?.has_selfie
        ? textByLanguage(language, 'Ảnh chân dung đã được ghi nhận', 'Portrait is recorded in the profile')
        : textByLanguage(language, 'Chưa có ảnh chân dung trong hồ sơ', 'No portrait in the profile'),
      title: textByLanguage(language, 'Ảnh trong hồ sơ', 'Profile portrait'),
    },
    {
      done: selectedServices.length > 0,
      icon: 'tools',
      meta: services,
      title: textByLanguage(language, 'Dịch vụ đã chọn', 'Selected services'),
    },
    {
      done: profile?.verification_status === 'approved',
      icon: 'shield',
      meta: profile?.verification_status === 'approved'
        ? textByLanguage(language, 'Hồ sơ đã được duyệt', 'Profile approved')
        : workerVerificationLabel(profile?.verification_status, language),
      title: textByLanguage(language, 'Trạng thái xét duyệt', 'Review status'),
    },
  ]
}
