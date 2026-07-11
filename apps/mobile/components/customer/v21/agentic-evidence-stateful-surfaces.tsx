import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { AgenticChatFact } from './agentic-surfaces'
import { customerV21AgenticStyles as agenticStyles } from './agentic-styles'
import { CaseWideMintAura, CaseWorkActionButtonAura, SourceCardSkin } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { ChatMediaCameraIcon } from './chat-surfaces'
import { AssetTile, V21Card } from './shared-surfaces'

export function AgenticEvidenceGateView({
  allowSkip,
  busy,
  canConfirm,
  fileValue,
  language,
  mediaPreviewNode,
  onAddMedia,
  onConfirm,
  onReasonChange,
  onReject,
  onSkip,
  prompt,
  rejectOpen,
  rejectReason,
  textInputNoOutlineStyle,
  tokens,
  totalFileCount,
  visualMediaValue,
  voiceError,
  voiceTranscriptNode,
  voiceValue,
}: {
  allowSkip: boolean
  busy: boolean
  canConfirm: boolean
  fileValue: string
  language: AppLanguage
  mediaPreviewNode: ReactNode
  onAddMedia: () => void
  onConfirm: () => void
  onReasonChange: (value: string) => void
  onReject: () => void
  onSkip: () => void
  prompt?: string
  rejectOpen: boolean
  rejectReason: string
  textInputNoOutlineStyle: StyleProp<TextStyle>
  tokens: CustomerThemeTokens
  totalFileCount: number
  visualMediaValue: string
  voiceError: string | null
  voiceTranscriptNode: ReactNode
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
            {prompt ?? (language === 'vi' ? 'Thêm ảnh, video hoặc bản chép lời. Kael chỉ phân tích sau khi bạn chốt bước này.' : 'Add photos, video, or an editable transcript. Kael analyzes only after you confirm this step.')}
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

      {mediaPreviewNode}
      <Text style={[viewStyles.mediaDisclosure, { color: tokens.muted }]} testID="customer-v21-agentic-evidence-privacy-disclosure">
        {language === 'vi'
          ? 'Video gốc được lưu riêng tư cùng hồ sơ để người có quyền xem lại; Kael chỉ phân tích 1–3 khung hình được tách trên thiết bị. Bạn có thể bỏ tệp trước khi xác nhận.'
          : 'The original video is stored privately with the case for authorized review; Kael analyzes only 1–3 frames extracted on your device. You can remove a file before confirming.'}
      </Text>

      {voiceTranscriptNode}
      {voiceError ? <Text style={[bookingStyles.mediaVoiceError, { color: tokens.primary }]}>{voiceError}</Text> : null}

      {allowSkip ? (
        rejectOpen ? (
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
        ) : null
      ) : null}

      <View style={agenticStyles.agenticChatActions}>
        {allowSkip ? (
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
        ) : null}
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
  mediaDisclosure: {
    fontSize: 12,
    lineHeight: 18,
  },
})
