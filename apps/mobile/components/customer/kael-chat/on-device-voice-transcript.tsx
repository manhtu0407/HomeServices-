import { useState } from 'react'

import { OnDeviceVoiceTranscriptControl } from './on-device-voice-transcript-control'
import type { OnDeviceVoiceTranscriptProps } from './on-device-voice-transcript.types'

export function OnDeviceVoiceTranscript({
  disabled,
  language,
  onChangeText,
  transcript,
  tokens,
}: OnDeviceVoiceTranscriptProps) {
  const [editorVisible, setEditorVisible] = useState(Boolean(transcript.trim()))
  const buttonLabel = language === 'vi' ? 'Thêm giọng nói' : 'Add voice'

  return (
    <OnDeviceVoiceTranscriptControl
      buttonLabel={buttonLabel}
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
  )
}
