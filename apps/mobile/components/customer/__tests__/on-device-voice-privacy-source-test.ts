import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const nativeVoice = readFileSync(
  join(process.cwd(), 'components/customer/kael-chat/on-device-voice-transcript.native.tsx'),
  'utf8',
)
const voiceControl = readFileSync(
  join(process.cwd(), 'components/customer/kael-chat/on-device-voice-transcript-control.tsx'),
  'utf8',
)
const webVoiceFallback = readFileSync(
  join(process.cwd(), 'components/customer/kael-chat/on-device-voice-transcript.tsx'),
  'utf8',
)

describe('Kael on-device voice privacy boundary', () => {
  it('requires local recognition and never persists or uploads raw audio', () => {
    expect(nativeVoice).toContain('requiresOnDeviceRecognition: true')
    expect(nativeVoice).toContain('requestMicrophonePermissionsAsync')
    expect(nativeVoice).toContain('supportsOnDeviceRecognition')
    expect(nativeVoice).not.toContain('recordingOptions')
    expect(nativeVoice).not.toContain('audioSource')
    expect(nativeVoice).not.toContain('createMediaUpload')
    expect(nativeVoice).not.toContain('uploadKaelChatMediaDrafts')
  })

  it('keeps the transcript editable before it becomes evidence', () => {
    expect(nativeVoice).toContain('onChangeText={onChangeText}')
    expect(nativeVoice).toContain('transcript={transcript}')
    expect(voiceControl).toContain('onChangeText={onChangeText}')
    expect(voiceControl).toContain('value={transcript}')
  })

  it('does not crash Expo Go when the optional native speech module is absent', () => {
    expect(nativeVoice).not.toMatch(/from ['"]expo-speech-recognition['"]/)
    expect(nativeVoice).toContain("require('expo-speech-recognition')")
    expect(nativeVoice).toContain("Cannot find native module 'ExpoSpeechRecognition'")
    expect(nativeVoice).toContain('customer-v21-on-device-voice-unavailable')
  })

  it('labels the web fallback as an editable transcript instead of a voice upload', () => {
    expect(webVoiceFallback).toContain("'Nhập bản chép lời'")
    expect(webVoiceFallback).not.toContain("'Thêm giọng nói'")
  })
})
