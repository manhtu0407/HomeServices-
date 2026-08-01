import { useProfileAvatarPicker } from '@/components/profile/use-profile-avatar-picker'
import type { AppLanguage } from '@/lib/app-language'
import type { CustomerAvatarDraft } from '@/lib/customer-avatar-upload'

export function useCustomerAvatarPicker({
  language,
  uploadAvatar,
}: {
  language: AppLanguage
  uploadAvatar: (draft: CustomerAvatarDraft) => Promise<boolean>
}) {
  const { avatarUploadBusy, openProfileAvatarPicker } = useProfileAvatarPicker({
    language,
    profileKind: 'customer',
    uploadAvatar,
  })
  return { avatarUploadBusy, openCustomerAvatarPicker: openProfileAvatarPicker }
}
