import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// The privacy boundary here is defined by what the file does NOT contain: no
// recording options, no audio source, no upload call. Absent code renders
// nothing, so no render test can assert it. What the component shows and lets
// the user edit is covered by the surface tests that mount it.
const nativeVoice = readFileSync(
  join(process.cwd(), 'components/customer/kael-chat/on-device-voice-transcript.native.tsx'),
  'utf8',
)
const webVoiceFallback = readFileSync(
  join(process.cwd(), 'components/customer/kael-chat/on-device-voice-transcript.tsx'),
  'utf8',
)

describe('Kael on-device voice privacy boundary', () => {
  it('never records, persists, or uploads raw audio', () => {
    expect(nativeVoice).not.toContain('recordingOptions')
    expect(nativeVoice).not.toContain('audioSource')
    expect(nativeVoice).not.toContain('createMediaUpload')
    expect(nativeVoice).not.toContain('uploadKaelChatMediaDrafts')
  })

  // A static import of the optional native module crashes Expo Go at load, before
  // any test can render the screen. Only the import form itself shows that.
  it('reaches the optional speech module through require, never a static import', () => {
    expect(nativeVoice).not.toMatch(/from ['"]expo-speech-recognition['"]/)
  })

  it('does not present the web fallback as a voice upload', () => {
    expect(webVoiceFallback).not.toContain("'Thêm giọng nói'")
  })
})
