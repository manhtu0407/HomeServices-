import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { ChatMediaCameraIcon } from './chat-surfaces'
import { CaseWorkResponse } from './case-work-response'
import { buildCaseWorkResponseModel } from './case-work-response-model'

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
  reduceMotion = true,
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
  reduceMotion?: boolean
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
  const canSkip = rejectReason.trim().length > 0 && !busy
  const evidenceGuidance = language === 'vi'
    ? [
        { label: 'Ảnh', text: 'Kiểm tra vùng thấy được và độ rõ.' },
        { label: 'Video', text: 'Giữ bản gốc riêng tư; chỉ phân tích khung hình tách trên thiết bị.' },
        { label: 'Giọng nói', text: 'Chỉ gửi bản chép lời bạn đã duyệt.' },
        { label: 'Lưu ý', text: 'Nêu thời điểm nếu lỗi xuất hiện khi chuyển động hoặc có tiếng động.' },
      ]
    : [
        { label: 'Images', text: 'Checks visible areas and clarity.' },
        { label: 'Video', text: 'Keeps the original private; only on-device frames are analyzed.' },
        { label: 'Voice', text: 'Sends only your approved transcript.' },
        { label: 'Note', text: 'Include timing if a symptom depends on motion or sound.' },
      ]
  const baseModel = buildCaseWorkResponseModel({ language, phase: 'kael_collecting' })
  const model = {
    ...baseModel,
    noteCopy: prompt ?? (allowSkip
      ? (language === 'vi'
          ? 'Bạn có thể thêm ảnh, video hoặc bản chép lời, hoặc bỏ qua với một lý do ngắn.'
          : 'You can add photos, video, or an editable transcript, or skip with a short reason.')
      : (language === 'vi'
          ? 'Thêm bằng chứng được yêu cầu, Kael chỉ phân tích sau khi bạn xác nhận bước này.'
          : 'Add the requested evidence. Kael analyzes it only after you confirm this step.')),
    noteTitle: language === 'vi' ? 'Thông tin Kael cần' : 'What Kael needs',
    status: allowSkip
      ? (language === 'vi' ? 'Có thể bổ sung' : 'Optional evidence')
      : (language === 'vi' ? 'Cần bổ sung' : 'Evidence required'),
    title: allowSkip
      ? (language === 'vi' ? 'Bổ sung hiện trạng nếu thuận tiện' : 'Add current evidence if convenient')
      : (language === 'vi' ? 'Kael cần hiện trạng trước' : 'Kael needs current evidence first'),
  }

  return (
    <CaseWorkResponse
      controls={(
        <>
          {allowSkip && rejectOpen ? (
            <View style={styles.reason}>
              <KaelTextField
                onChangeText={onReasonChange}
                placeholder={language === 'vi' ? 'Lý do ngắn' : 'Short reason'}
                placeholderTextColor={tokens.subtleText}
                style={[styles.reasonInput, textInputNoOutlineStyle, { color: tokens.text }]}
                testID="customer-v21-agentic-evidence-reason"
                value={rejectReason}
              />
              <KaelButton
                accessibilityState={{ busy, disabled: !canSkip }}
                disabled={!canSkip}
                label={language === 'vi' ? 'Tiếp tục' : 'Continue'}
                onPress={onSkip}
                size="small"
                testID="customer-v21-agentic-evidence-skip"
              />
            </View>
          ) : null}
          <View style={styles.actions}>
            {allowSkip ? (
              <KaelButton
                disabled={busy}
                label={language === 'vi' ? 'Bỏ qua' : 'Skip'}
                onPress={onReject}
                size="small"
                style={styles.action}
                testID="customer-v21-agentic-evidence-reject"
                variant="secondary"
              />
            ) : null}
            <KaelButton
              accessibilityState={{ busy, disabled: !canConfirm }}
              disabled={!canConfirm}
              label={busy
                ? (language === 'vi' ? 'Đang gửi' : 'Sending')
                : (language === 'vi' ? 'Xác nhận' : 'Confirm')}
              onPress={onConfirm}
              size="small"
              style={styles.action}
              testID="customer-v21-agentic-evidence-confirm"
            />
          </View>
        </>
      )}
      details={(
        <View style={styles.details}>
          <Text style={[styles.counts, { color: tokens.text }]}>
            {language === 'vi'
              ? `Ảnh/video ${visualMediaValue} · Giọng nói ${voiceValue} · Tổng ${fileValue}`
              : `Media ${visualMediaValue} · Voice ${voiceValue} · Total ${fileValue}`}
          </Text>
          <View style={styles.toolRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || totalFileCount >= 5 }}
              disabled={busy || totalFileCount >= 5}
              onPress={onAddMedia}
              style={({ pressed }) => [
                styles.toolButton,
                { borderColor: tokens.border, opacity: pressed ? 0.72 : 1 },
              ]}
              testID="customer-v21-agentic-evidence-add-media"
            >
              <ChatMediaCameraIcon color={tokens.primary} />
              <Text style={[styles.toolText, { color: tokens.primary }]}>
                {language === 'vi' ? 'Thêm ảnh hoặc video' : 'Add media'}
              </Text>
            </Pressable>
            <Text style={[styles.fileCount, { color: tokens.muted }]} testID="customer-v21-agentic-evidence-file-count">
              {fileValue}
            </Text>
          </View>
          {voiceTranscriptNode}
          {voiceError ? <Text style={[styles.error, { color: tokens.primary }]}>{voiceError}</Text> : null}
          {mediaPreviewNode}
          <View style={styles.disclosure} testID="customer-v21-agentic-evidence-privacy-disclosure">
            <Text style={[styles.disclosureIntro, { color: tokens.muted }]}>
              {language === 'vi'
                ? 'Kael xử lý trong phạm vi phù hợp.'
                : 'Kael handles evidence within the appropriate limits.'}
            </Text>
            {evidenceGuidance.map((item) => (
              <View key={item.label} style={styles.disclosureItem}>
                <Text style={[styles.disclosureLabel, { color: tokens.text }]}>{item.label}</Text>
                <Text style={[styles.disclosureCopy, { color: tokens.muted }]}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
      model={model}
      reduceMotion={reduceMotion}
      testID="customer-v21-agentic-evidence-gate"
      tokens={tokens}
    />
  )
}

const styles = StyleSheet.create({
  action: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  counts: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  details: { gap: 12 },
  disclosure: { gap: 6 },
  disclosureCopy: { flex: 1, fontSize: 12, lineHeight: 18 },
  disclosureIntro: { fontSize: 12, lineHeight: 18 },
  disclosureItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  disclosureLabel: { fontSize: 12, fontWeight: '700', lineHeight: 18, minWidth: 68 },
  error: { fontSize: 12, lineHeight: 18 },
  fileCount: { fontSize: 13, fontWeight: '600', lineHeight: 20 },
  reason: { gap: 10 },
  reasonInput: { flex: 1, fontSize: 15, minHeight: 44 },
  toolButton: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 9, minHeight: 42 },
  toolRow: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  toolText: { flex: 1, fontSize: 14, fontWeight: '600' },
})
