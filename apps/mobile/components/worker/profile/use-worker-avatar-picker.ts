import { useCallback, useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import type { AppLanguage } from '@/lib/app-language'
import type { WorkerAvatarDraft } from '@/lib/worker-avatar-upload'
import { textByLanguage } from '../ui/format'

type UseWorkerAvatarPickerInput = {
  language: AppLanguage
  uploadAvatar: (draft: WorkerAvatarDraft) => Promise<boolean>
}

export function useWorkerAvatarPicker({ language, uploadAvatar }: UseWorkerAvatarPickerInput) {
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false)

  const selectWorkerAvatar = useCallback(async (source: 'camera' | 'library') => {
    if (avatarUploadBusy) return
    try {
      const permission = Platform.OS === 'web'
        ? { granted: true }
        : source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert(
          textByLanguage(language, 'Cần quyền truy cập', 'Permission needed'),
          textByLanguage(
            language,
            source === 'camera'
              ? 'Cho phép camera để chụp ảnh đại diện thật của bạn.'
              : 'Cho phép thư viện ảnh để chọn ảnh đại diện thật của bạn.',
            source === 'camera'
              ? 'Allow camera access to take your real profile photo.'
              : 'Allow photo-library access to choose your real profile photo.',
          ),
        )
        return
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            allowsMultipleSelection: false,
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.82,
          })
      if (result.canceled || result.assets.length === 0) return

      const asset = result.assets[0]
      setAvatarUploadBusy(true)
      const saved = await uploadAvatar({
        fileName: asset.fileName ?? undefined,
        fileSizeBytes: asset.fileSize ?? undefined,
        mimeType: asset.mimeType ?? undefined,
        uri: asset.uri,
      })
      if (!saved) {
        Alert.alert(
          textByLanguage(language, 'Chưa cập nhật được ảnh', 'Could not update photo'),
          textByLanguage(language, 'Kiểm tra kết nối và định dạng ảnh rồi thử lại.', 'Check your connection and image format, then try again.'),
        )
      }
    } catch {
      Alert.alert(
        textByLanguage(language, 'Chưa cập nhật được ảnh', 'Could not update photo'),
        textByLanguage(language, 'Không thể mở hoặc xử lý ảnh này. Vui lòng thử ảnh khác.', 'This photo could not be opened or processed. Please try another one.'),
      )
    } finally {
      setAvatarUploadBusy(false)
    }
  }, [avatarUploadBusy, language, uploadAvatar])

  const openWorkerAvatarPicker = useCallback(() => {
    if (avatarUploadBusy) return
    if (Platform.OS === 'web') {
      void selectWorkerAvatar('library')
      return
    }
    Alert.alert(
      textByLanguage(language, 'Ảnh đại diện', 'Profile photo'),
      textByLanguage(language, 'Dùng ảnh thật để khách hàng nhận đúng thợ.', 'Use a real photo so customers can identify the right worker.'),
      [
        { text: textByLanguage(language, 'Chụp ảnh', 'Take photo'), onPress: () => void selectWorkerAvatar('camera') },
        { text: textByLanguage(language, 'Chọn từ thư viện', 'Choose from library'), onPress: () => void selectWorkerAvatar('library') },
        { text: textByLanguage(language, 'Hủy', 'Cancel'), style: 'cancel' },
      ],
    )
  }, [avatarUploadBusy, language, selectWorkerAvatar])

  return { avatarUploadBusy, openWorkerAvatarPicker }
}
