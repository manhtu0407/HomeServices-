import { Pressable, StyleSheet, Text, View } from 'react-native'

import { KaelTextInput } from '@/components/ui/kael-primitives'
import type { OnDeviceVoiceTranscriptProps } from './on-device-voice-transcript.types'

export function OnDeviceVoiceTranscript({
  disabled,
  language,
  onChangeText,
  transcript,
  tokens,
}: OnDeviceVoiceTranscriptProps) {
  return (
    <View style={[styles.shell, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-v21-on-device-voice">
      <View style={styles.header}>
        <Text style={[styles.title, { color: tokens.text }]}>
          {language === 'vi' ? 'Bản chép lời riêng tư' : 'Private transcript'}
        </Text>
        <Pressable
          accessibilityLabel={language === 'vi' ? 'Nhận giọng nói trên thiết bị' : 'Recognize speech on device'}
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          disabled
          style={[styles.button, { backgroundColor: tokens.service, borderColor: tokens.border }]}
          testID="customer-v21-on-device-voice-start"
        >
          <Text style={[styles.buttonText, { color: tokens.muted }]}>{language === 'vi' ? 'Chỉ trên app' : 'Native only'}</Text>
        </Pressable>
      </View>
      <Text style={[styles.note, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Preview web không dùng nhận giọng nói để tránh gửi âm thanh qua dịch vụ mạng. Bạn có thể nhập và sửa nội dung tại đây.'
          : 'Web preview disables speech recognition so audio is never sent to a network service. You can type and edit the text here.'}
      </Text>
      <KaelTextInput
        accessibilityLabel={language === 'vi' ? 'Chỉnh bản chép lời' : 'Edit transcript'}
        editable={!disabled}
        multiline
        onChangeText={onChangeText}
        placeholder={language === 'vi' ? 'Nhập nội dung bạn muốn Kael phân tích' : 'Type what you want Kael to analyze'}
        placeholderTextColor={tokens.subtleText}
        style={[styles.input, { borderColor: tokens.border, color: tokens.text }]}
        testID="customer-v21-on-device-voice-transcript"
        value={transcript}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 36,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontSize: 12, fontWeight: '700' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  input: { borderRadius: 16, borderWidth: 1, fontSize: 14, minHeight: 72, padding: 12, textAlignVertical: 'top' },
  note: { fontSize: 12, lineHeight: 17 },
  shell: { borderRadius: 22, borderWidth: 1, gap: 10, marginHorizontal: 18, marginBottom: 8, padding: 12 },
  title: { flex: 1, fontSize: 14, fontWeight: '700' },
})
