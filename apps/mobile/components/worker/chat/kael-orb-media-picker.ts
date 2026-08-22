import type { SetStateAction } from 'react'
import { Alert } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

import type { AppLanguage } from '@/lib/app-language'
import { textByLanguage } from '../ui/format'
import { workerV5KaelOrbMediaName, type WorkerV5KaelOrbMediaPreview } from './kael-orb-chat-model'

type WorkerKaelMediaPickerOptions = {
  busy: boolean
  hasJobKaelSessionAccess: boolean
  language: AppLanguage
  openingSessionId: string | null
  setMediaItems: (action: SetStateAction<WorkerV5KaelOrbMediaPreview[]>) => void
}

export async function pickWorkerKaelMedia({
  busy,
  hasJobKaelSessionAccess,
  language,
  openingSessionId,
  setMediaItems,
}: WorkerKaelMediaPickerOptions) {
  if (busy || openingSessionId) return
  if (!hasJobKaelSessionAccess) {
    Alert.alert('Kael', textByLanguage(language, 'Cần việc đang thực hiện để gửi ảnh cho Kael.', 'Active work is needed to send a photo to Kael.'))
    return
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: false,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.84,
  })
  if (result.canceled || result.assets.length === 0) return
  const asset = result.assets[0]
  setMediaItems([{ fileName: workerV5KaelOrbMediaName(asset, 0, language), uri: asset.uri }])
}
