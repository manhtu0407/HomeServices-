import { useProfileAvatarPicker } from '@/components/profile/use-profile-avatar-picker'
import type { AppLanguage } from '@/lib/app-language'
import type { WorkerAvatarDraft } from '@/lib/worker-avatar-upload'

type UseWorkerAvatarPickerInput = {
  language: AppLanguage
  uploadAvatar: (draft: WorkerAvatarDraft) => Promise<boolean>
}

export function useWorkerAvatarPicker({ language, uploadAvatar }: UseWorkerAvatarPickerInput) {
  const { avatarUploadBusy, openProfileAvatarPicker } = useProfileAvatarPicker({
    language,
    profileKind: 'worker',
    uploadAvatar,
  })
  return { avatarUploadBusy, openWorkerAvatarPicker: openProfileAvatarPicker }
}
