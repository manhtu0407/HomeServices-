import { useCallback, useState } from 'react'
import { Alert, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import type { AppLanguage } from '@/lib/app-language'
import type { ProfileAvatarDraft } from '@/lib/profile-avatar-upload'

type ProfileAvatarKind = 'customer' | 'worker'

type UseProfileAvatarPickerInput = {
  language: AppLanguage
  profileKind: ProfileAvatarKind
  uploadAvatar: (draft: ProfileAvatarDraft) => Promise<boolean>
}

export function useProfileAvatarPicker({
  language,
  profileKind,
  uploadAvatar,
}: UseProfileAvatarPickerInput) {
  const [avatarUploadBusy, setAvatarUploadBusy] = useState(false)
  const copy = useCallback(
    (vi: string, en: string) => language === 'vi' ? vi : en,
    [language],
  )

  const selectProfileAvatar = useCallback(async (source: 'camera' | 'library') => {
    if (avatarUploadBusy) return
    try {
      const permission = Platform.OS === 'web'
        ? { granted: true }
        : source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!permission.granted) {
        Alert.alert(
          copy('Cần quyền truy cập', 'Permission needed'),
          copy(
            source === 'camera'
              ? 'Cho phép Camera để chụp ảnh đại diện của bạn.'
              : 'Cho phép Thư viện ảnh để chọn ảnh đại diện của bạn.',
            source === 'camera'
              ? 'Allow Camera access to take your profile photo.'
              : 'Allow Photos access to choose your profile photo.',
          ),
        )
        return
      }

      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            mediaTypes: ['images'],
            quality: 0.82,
          })
        : await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            allowsMultipleSelection: false,
            mediaTypes: ['images'],
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
          copy('Chưa cập nhật được ảnh', 'Could not update photo'),
          copy(
            'Kiểm tra kết nối và định dạng ảnh rồi thử lại.',
            'Check your connection and image format, then try again.',
          ),
        )
      }
    } catch {
      Alert.alert(
        copy('Chưa cập nhật được ảnh', 'Could not update photo'),
        copy(
          'Không thể mở hoặc xử lý ảnh này. Vui lòng thử ảnh khác.',
          'This photo could not be opened or processed. Please try another one.',
        ),
      )
    } finally {
      setAvatarUploadBusy(false)
    }
  }, [avatarUploadBusy, copy, uploadAvatar])

  const openProfileAvatarPicker = useCallback(() => {
    if (avatarUploadBusy) return
    if (Platform.OS === 'web') {
      void selectProfileAvatar('library')
      return
    }
    Alert.alert(
      copy('Ảnh đại diện', 'Profile photo'),
      copy(
        profileKind === 'worker'
          ? 'Dùng ảnh thật để khách hàng nhận đúng thợ.'
          : 'Bạn có thể chụp ảnh mới hoặc chọn một ảnh có sẵn.',
        profileKind === 'worker'
          ? 'Use a real photo so customers can identify the right worker.'
          : 'Take a new photo or choose one you already have.',
      ),
      [
        { text: copy('Chụp ảnh', 'Take photo'), onPress: () => void selectProfileAvatar('camera') },
        { text: copy('Chọn từ thư viện', 'Choose from library'), onPress: () => void selectProfileAvatar('library') },
        { text: copy('Hủy', 'Cancel'), style: 'cancel' },
      ],
    )
  }, [avatarUploadBusy, copy, profileKind, selectProfileAvatar])

  return { avatarUploadBusy, openProfileAvatarPicker }
}
