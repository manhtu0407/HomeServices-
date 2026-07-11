import { useEffect, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition'

import { KaelTextInput } from '@/components/ui/kael-primitives'
import type { OnDeviceVoiceTranscriptProps } from './on-device-voice-transcript.types'

export function OnDeviceVoiceTranscript({
  disabled,
  language,
  onChangeText,
  transcript,
  tokens,
}: OnDeviceVoiceTranscriptProps) {
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
  }, [])

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
    <View style={[styles.shell, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-v21-on-device-voice">
      <View style={styles.header}>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: tokens.text }]}>
            {language === 'vi' ? 'Giọng nói → bản chép lời' : 'Voice → editable transcript'}
          </Text>
          <Text style={[styles.note, { color: tokens.muted }]}>
            {language === 'vi'
              ? 'Nhận ngay trên thiết bị; NestScout không lưu hoặc tải tệp âm thanh gốc.'
              : 'Recognized on device; NestScout never stores or uploads the raw audio file.'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={listening
            ? (language === 'vi' ? 'Dừng nhận giọng nói' : 'Stop speech recognition')
            : (language === 'vi' ? 'Nhận giọng nói trên thiết bị' : 'Recognize speech on device')}
          accessibilityRole="button"
          accessibilityState={{ busy: listening, disabled }}
          disabled={disabled}
          onPress={() => void startOnDeviceRecognition()}
          style={[styles.button, { backgroundColor: listening ? tokens.primary : tokens.service, borderColor: tokens.border }]}
          testID="customer-v21-on-device-voice-start"
        >
          <Text style={[styles.buttonText, { color: listening ? tokens.primaryText : tokens.primary }]}>
            {listening ? (language === 'vi' ? 'Dừng' : 'Stop') : (language === 'vi' ? 'Nói' : 'Speak')}
          </Text>
        </Pressable>
      </View>
      <KaelTextInput
        accessibilityLabel={language === 'vi' ? 'Chỉnh bản chép lời' : 'Edit transcript'}
        editable={!disabled}
        multiline
        onChangeText={onChangeText}
        placeholder={language === 'vi' ? 'Bản chép lời sẽ hiện ở đây để bạn kiểm tra' : 'Review and edit the transcript here'}
        placeholderTextColor={tokens.subtleText}
        style={[styles.input, { borderColor: tokens.border, color: tokens.text }]}
        testID="customer-v21-on-device-voice-transcript"
        value={transcript}
      />
      {error ? <Text accessibilityLiveRegion="polite" style={[styles.error, { color: tokens.primary }]}>{error}</Text> : null}
    </View>
  )
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

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderRadius: 18, borderWidth: 1, justifyContent: 'center', minHeight: 40, minWidth: 62, paddingHorizontal: 12 },
  buttonText: { fontSize: 13, fontWeight: '700' },
  copy: { flex: 1, gap: 3 },
  error: { fontSize: 12, lineHeight: 17 },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  input: { borderRadius: 16, borderWidth: 1, fontSize: 14, minHeight: 72, padding: 12, textAlignVertical: 'top' },
  note: { fontSize: 12, lineHeight: 17 },
  shell: { borderRadius: 22, borderWidth: 1, gap: 10, marginHorizontal: 18, marginBottom: 8, padding: 12 },
  title: { fontSize: 14, fontWeight: '700' },
})
