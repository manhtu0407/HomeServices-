import { type StyleProp, type TextStyle } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { LocalMediaUploadDraft } from '@/lib/media-upload'

import type { CustomerThemeTokens } from '../customer-theme'
import { AgenticEvidenceGateView } from '../v21/agentic-evidence-stateful-surfaces'
import { formatKnownCount } from '../v21/case-stage-display-model'
import { OnDeviceVoiceTranscript } from './on-device-voice-transcript'
import { MediaDraftPreviewTray } from './media-draft-preview-tray'

export function AgenticEvidenceGateCard({
  allowSkip = true,
  busy,
  language,
  mediaDrafts,
  onAddMedia,
  onConfirm,
  onReasonChange,
  onRemoveMedia,
  onReject,
  onSkip,
  onVoiceTranscriptChange,
  prompt,
  rejectOpen,
  rejectReason,
  requiredEvidenceKind,
  textInputNoOutlineStyle,
  tokens,
  voiceTranscript,
}: {
  allowSkip?: boolean
  busy: boolean
  language: AppLanguage
  mediaDrafts: LocalMediaUploadDraft[]
  onAddMedia: () => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onRemoveMedia: (index: number) => void
  onReject: () => void
  onSkip: () => void
  onVoiceTranscriptChange: (value: string) => void
  prompt?: string
  rejectOpen: boolean
  rejectReason: string
  requiredEvidenceKind?: 'photo' | 'video_frame' | 'voice_transcript'
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
  voiceTranscript: string
}) {
  const visualMediaCount = mediaDrafts.filter((item) => item.type === 'image' || item.type === 'video').length
  const voiceCount = voiceTranscript.trim() ? 1 : 0
  const totalFileCount = mediaDrafts.length + voiceCount
  const hasRequiredEvidence = requiredEvidenceKind === 'photo' || requiredEvidenceKind === 'video_frame'
    ? visualMediaCount > 0
    : requiredEvidenceKind === 'voice_transcript'
      ? voiceCount > 0
      : totalFileCount > 0

  return (
    <AgenticEvidenceGateView
      allowSkip={allowSkip}
      busy={busy}
      canConfirm={hasRequiredEvidence && !busy}
      fileValue={formatKnownCount(totalFileCount, language)}
      language={language}
      mediaPreviewNode={mediaDrafts.length > 0 ? (
        <MediaDraftPreviewTray busy={busy} drafts={mediaDrafts} language={language} onRemove={onRemoveMedia} tokens={tokens} />
      ) : null}
      onAddMedia={onAddMedia}
      onConfirm={onConfirm}
      onReasonChange={onReasonChange}
      onReject={onReject}
      onSkip={onSkip}
      prompt={prompt}
      rejectOpen={rejectOpen}
      rejectReason={rejectReason}
      textInputNoOutlineStyle={textInputNoOutlineStyle}
      tokens={tokens}
      totalFileCount={totalFileCount}
      visualMediaValue={formatKnownCount(visualMediaCount, language)}
      voiceError={null}
      voiceValue={formatKnownCount(voiceCount, language)}
      voiceTranscriptNode={(
        <OnDeviceVoiceTranscript
          disabled={busy}
          language={language}
          onChangeText={onVoiceTranscriptChange}
          tokens={tokens}
          transcript={voiceTranscript}
        />
      )}
    />
  )
}
