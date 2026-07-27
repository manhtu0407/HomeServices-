import { useEffect, useState } from 'react'
import { Platform, View } from 'react-native'

import { OnDeviceVoiceTranscriptControl } from './on-device-voice-transcript-control'
import type { OnDeviceVoiceTranscriptProps } from './on-device-voice-transcript.types'

type SpeechRecognitionRuntime = typeof import('expo-speech-recognition')

const missingNativeModuleError = "Cannot find native module 'ExpoSpeechRecognition'"
const speechRecognitionRuntime = loadSpeechRecognitionRuntime()

export function OnDeviceVoiceTranscript(props: OnDeviceVoiceTranscriptProps) {
  if (!speechRecognitionRuntime) {
    return <UnavailableOnDeviceVoiceTranscript {...props} />
  }

  return <NativeOnDeviceVoiceTranscript {...props} runtime={speechRecognitionRuntime} />
}
function NativeOnDeviceVoiceTranscript({
  disabled,
  language,
  onChangeText,
  runtime,
  transcript,
  tokens,
}: OnDeviceVoiceTranscriptProps & { runtime: SpeechRecognitionRuntime }) {
  const { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } = runtime
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locale = language === 'vi' ? 'vi-VN' : 'en-US'

  useSpeechRecognitionEvent('start', () => {
    setListening(true)
    setError(null)
  })
  useSpeechRecognitionEvent('end', () => setListening(false))
  useSpeechRecognitionEvent('result', (event) => {
    const recognized = event.results[0]?.transcript?.trim()
    if (recognized) onChangeText(recognized)
  })
  useSpeechRecognitionEvent('error', (event) => {
    setListening(false)
    setError(voiceErrorLabel(event.error, language))
  })

  useEffect(() => () => {
    ExpoSpeechRecognitionModule.abort()
  }, [ExpoSpeechRecognitionModule])

  const startOnDeviceRecognition = async () => {
    if (disabled) return
    if (listening) {
      ExpoSpeechRecognitionModule.stop()
      return
    }
    if (
      !ExpoSpeechRecognitionModule.isRecognitionAvailable() ||
      !ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
    ) {
      setError(language === 'vi'
        ? 'Thiết bị chưa hỗ trợ nhận giọng nói ngoại tuyến. Bạn vẫn có thể nhập nội dung.'
        : 'This device does not support offline speech recognition. You can still type the transcript.')
      return
    }
    const permission = await ExpoSpeechRecognitionModule.requestMicrophonePermissionsAsync()
    if (!permission.granted) {
      setError(language === 'vi' ? 'Chưa cấp quyền micro.' : 'Microphone permission is not granted.')
      return
    }
    if (Platform.OS === 'android') {
      const supported = await ExpoSpeechRecognitionModule.getSupportedLocales({}).catch(() => null)
      const installed = supported?.installedLocales ?? []
      const localeInstalled = installed.some((value) => value.toLowerCase() === locale.toLowerCase())
      if (!localeInstalled) {
        await ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale }).catch(() => undefined)
        setError(language === 'vi'
          ? 'Hãy hoàn tất tải gói giọng nói ngoại tuyến rồi chạm lại.'
          : 'Finish downloading the offline speech model, then tap again.')
        return
      }
    }
    ExpoSpeechRecognitionModule.start({
      addsPunctuation: true,
      continuous: false,
      interimResults: true,
      lang: locale,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: true,
    })
  }

  return (
    <OnDeviceVoiceTranscriptControl
      buttonLabel={listening
        ? (language === 'vi' ? 'Dừng thu giọng nói' : 'Stop recording voice')
        : (language === 'vi' ? 'Thu giọng nói' : 'Record voice')}
      disabled={disabled}
      editorVisible={Boolean(transcript.trim())}
      error={error}
      language={language}
      listening={listening}
      onChangeText={onChangeText}
      onPress={() => void startOnDeviceRecognition()}
      transcript={transcript}
      tokens={tokens}
    />
  )
}

function UnavailableOnDeviceVoiceTranscript({
  disabled,
  language,
  onChangeText,
  transcript,
  tokens,
}: OnDeviceVoiceTranscriptProps) {
  const [editorVisible, setEditorVisible] = useState(Boolean(transcript.trim()))

  return (
    <View testID="customer-v21-on-device-voice-unavailable">
      <OnDeviceVoiceTranscriptControl
        buttonLabel={language === 'vi' ? 'Nhập bản chép lời' : 'Enter transcript'}
        disabled={disabled}
        editorVisible={editorVisible || Boolean(transcript.trim())}
        error={null}
        language={language}
        listening={false}
        onChangeText={onChangeText}
        onPress={() => setEditorVisible(true)}
        transcript={transcript}
        tokens={tokens}
      />
    </View>
  )
}

function loadSpeechRecognitionRuntime(): SpeechRecognitionRuntime | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo Go omits the native module, so static import would throw before the fallback renders.
    return require('expo-speech-recognition') as SpeechRecognitionRuntime
  } catch (error) {
    if (String(error).includes(missingNativeModuleError)) return null
    throw error
  }
}

function voiceErrorLabel(code: string, language: 'vi' | 'en') {
  if (code === 'no-speech' || code === 'speech-timeout') {
    return language === 'vi' ? 'Chưa nghe rõ. Bạn thử nói lại.' : 'No clear speech was detected. Try again.'
  }
  if (code === 'language-not-supported') {
    return language === 'vi' ? 'Gói ngôn ngữ ngoại tuyến chưa sẵn sàng.' : 'The offline language model is not ready.'
  }
  return language === 'vi'
    ? 'Không thể nhận giọng nói ngoại tuyến. Bạn vẫn có thể nhập nội dung.'
    : 'Offline speech recognition is unavailable. You can still type the transcript.'
}
