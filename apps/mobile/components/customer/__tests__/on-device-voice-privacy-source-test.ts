import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const nativeVoice = readFileSync(
  join(process.cwd(), 'components/customer/kael-chat/on-device-voice-transcript.native.tsx'),
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
    expect(nativeVoice).toContain('value={transcript}')
  })
})
