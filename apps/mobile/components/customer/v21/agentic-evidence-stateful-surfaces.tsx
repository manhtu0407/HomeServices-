import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { AgenticChatFact } from './agentic-surfaces'
import { customerV21AgenticStyles as agenticStyles } from './agentic-styles'
import { CaseWideMintAura, CaseWorkActionButtonAura, SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { MediaVoiceNote } from './booking-surfaces'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { ChatMediaCameraIcon } from './chat-surfaces'
import { AssetTile, V21Card } from './shared-surfaces'

export function AgenticEvidenceGateView({
  busy,
  canConfirm,
  fileValue,
  isRecordingVoice,
  language,
  onAddMedia,
  onConfirm,
  onReasonChange,
  onReject,
  onSkip,
  onVoicePress,
  recordingSeconds,
  rejectOpen,
  rejectReason,
  textInputNoOutlineStyle,
  tokens,
  totalFileCount,
  visualMediaValue,
  voiceError,
  voiceValue,
}: {
  busy: boolean
  canConfirm: boolean
  fileValue: string
  isRecordingVoice: boolean
  language: AppLanguage
  onAddMedia: () => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSkip: () => void
  onVoicePress: () => void
  recordingSeconds: number
  rejectOpen: boolean
  rejectReason: string
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
  totalFileCount: number
  visualMediaValue: string
  voiceError: string | null
  voiceValue: string
}) {
  return (
    <V21Card
      style={[agenticStyles.agenticChatCard, agenticStyles.agenticEvidenceGateCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-agentic-evidence-gate"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="ChatEvidenceGate" testID="customer-v21-agentic-evidence-mint-aura" />
      <View style={agenticStyles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.evidence} label={language === 'vi' ? 'Bằng chứng' : 'Evidence'} size={42} sourceAura style={agenticStyles.agenticChatIcon} />
        <View style={viewStyles.flex}>
          <Text numberOfLines={2} style={[agenticStyles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael cần hiện trạng trước' : 'Kael needs current evidence first'}
          </Text>
          <Text numberOfLines={2} style={[agenticStyles.agenticChatBody, { color: tokens.muted }]}>
            {language === 'vi' ? 'Thêm ảnh, video hoặc ghi âm. Kael chỉ phân tích sau khi bạn chốt bước này.' : 'Add photos, video, or voice. Kael analyzes only after you confirm this step.'}
          </Text>
        </View>
      </View>

      <View style={agenticStyles.agenticEvidenceMetricRow}>
        <AgenticChatFact centered label={language === 'vi' ? 'Ảnh/video' : 'Media'} value={visualMediaValue} />
        <AgenticChatFact centered label={language === 'vi' ? 'Giọng nói' : 'Voice'} value={voiceValue} />
        <AgenticChatFact centered label={language === 'vi' ? 'Tệp' : 'Files'} value={fileValue} />
      </View>

      <View style={agenticStyles.agenticEvidenceToolRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || totalFileCount >= 5 }}
          disabled={busy || totalFileCount >= 5}
          onPress={onAddMedia}
          style={[agenticStyles.agenticEvidenceToolButton, { backgroundColor: tokens.service, borderColor: tokens.border }]}
          testID="customer-v21-agentic-evidence-add-media"
        >
          <ChatMediaCameraIcon color={tokens.primary} />
          <Text numberOfLines={1} style={[agenticStyles.agenticEvidenceToolText, { color: tokens.primary }]}>
            {language === 'vi' ? 'Thêm ảnh/video' : 'Add media'}
          </Text>
        </Pressable>
        <View style={[agenticStyles.agenticEvidenceFileCount, { backgroundColor: tokens.service, borderColor: tokens.border, borderWidth: 1 }]} testID="customer-v21-agentic-evidence-file-count">
          <Text style={[agenticStyles.agenticChatFactValue, { color: tokens.text }]}>{fileValue}</Text>
        </View>
      </View>

      <MediaVoiceNote
        isRecording={isRecordingVoice}
        language={language}
        onPress={onVoicePress}
        recordingSeconds={recordingSeconds}
        testID="customer-v21-agentic-evidence-voice-note"
        tokens={tokens}
        value={isRecordingVoice ? `${recordingSeconds}s` : voiceValue}
      />
      {voiceError ? <Text style={[bookingStyles.mediaVoiceError, { color: tokens.primary }]}>{voiceError}</Text> : null}

      {rejectOpen ? (
        <View style={agenticStyles.agenticEvidenceReasonBox}>
          <KaelTextField
            inputShellStyle={agenticStyles.agenticEvidenceReasonInputShell}
            onChangeText={onReasonChange}
            placeholder={language === 'vi' ? 'Lý do ngắn' : 'Short reason'}
            placeholderTextColor={tokens.subtleText}
            shellStyle={agenticStyles.agenticEvidenceReasonInput}
            style={[viewStyles.composerInput, textInputNoOutlineStyle, { color: tokens.text }]}
            testID="customer-v21-agentic-evidence-reason"
            value={rejectReason}
          />
          <KaelButton
            accessibilityState={{ busy, disabled: busy }}
            disabled={busy}
            label={language === 'vi' ? 'Tiếp tục' : 'Continue'}
            onPress={onSkip}
            size="small"
            style={agenticStyles.agenticChatActionButton}
            testID="customer-v21-agentic-evidence-skip"
          />
        </View>
      ) : null}

      <View style={agenticStyles.agenticChatActions}>
        <KaelButton
          backgroundLayer={<CaseWorkActionButtonAura scope="EvidenceReject" />}
          disabled={busy}
          label={language === 'vi' ? 'Từ chối' : 'Decline'}
          onPress={onReject}
          size="small"
          style={agenticStyles.agenticChatActionButton}
          testID="customer-v21-agentic-evidence-reject"
          variant="secondary"
        />
        <KaelButton
          accessibilityState={{ busy, disabled: !canConfirm }}
          disabled={!canConfirm}
          label={busy ? (language === 'vi' ? 'Đang gửi' : 'Sending') : (language === 'vi' ? 'Xác nhận' : 'Confirm')}
          onPress={onConfirm}
          size="small"
          style={agenticStyles.agenticChatActionButton}
          testID="customer-v21-agentic-evidence-confirm"
        />
      </View>
    </V21Card>
  )
}

const viewStyles = StyleSheet.create({
  composerInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 10,
    position: 'relative',
    zIndex: 1,
  },
  flex: {
    flex: 1,
  },
})
