import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Path } from 'react-native-svg'

import { KaelTextInput } from '@/components/ui/kael-primitives'

import type { OnDeviceVoiceTranscriptProps } from './on-device-voice-transcript.types'

export function OnDeviceVoiceTranscriptControl({
  buttonLabel,
  disabled,
  editorVisible,
  error,
  language,
  listening,
  onChangeText,
  onPress,
  transcript,
  tokens,
}: OnDeviceVoiceTranscriptProps & {
  buttonLabel: string
  editorVisible: boolean
  error: string | null
  listening: boolean
  onPress: () => void
}) {
  const voiceCount = transcript.trim() ? 1 : 0

  return (
    <View style={styles.root} testID="customer-v21-on-device-voice">
      <View style={styles.toolRow}>
        <Pressable
          accessibilityLabel={buttonLabel}
          accessibilityRole="button"
          accessibilityState={{ busy: listening, disabled }}
          disabled={disabled}
          onPress={onPress}
          style={[
            styles.toolButton,
            {
              borderColor: listening ? tokens.primary : tokens.border,
            },
          ]}
          testID="customer-v21-agentic-evidence-add-voice"
        >
          <VoiceMicrophoneIcon color={tokens.primary} />
          <Text numberOfLines={1} style={[styles.toolText, { color: tokens.primary }]}>
            {buttonLabel}
          </Text>
        </Pressable>
        <View style={styles.count} testID="customer-v21-agentic-evidence-voice-count">
          <Text style={[styles.countText, { color: tokens.text }]}>{voiceCount}</Text>
        </View>
      </View>

      {editorVisible ? (
        <KaelTextInput
          accessibilityLabel={language === 'vi' ? 'Chỉnh bản chép lời' : 'Edit transcript'}
          editable={!disabled}
          multiline
          onChangeText={onChangeText}
          placeholder={language === 'vi' ? 'Kiểm tra nội dung Kael sẽ phân tích' : 'Review what Kael will analyze'}
          placeholderTextColor={tokens.subtleText}
          style={[styles.input, { backgroundColor: tokens.raised, borderColor: tokens.border, color: tokens.text }]}
          testID="customer-v21-on-device-voice-transcript"
          value={transcript}
        />
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: tokens.primary }]}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

function VoiceMicrophoneIcon({ color }: { color: string }) {
  return (
    <Svg fill="none" height={20} viewBox="0 0 24 24" width={20}>
      <Path d="M12 14.2a3.2 3.2 0 0 0 3.2-3.2V7.2a3.2 3.2 0 1 0-6.4 0V11a3.2 3.2 0 0 0 3.2 3.2Z" stroke={color} strokeWidth={1.9} />
      <Path d="M6.8 10.8a5.2 5.2 0 0 0 10.4 0M12 16v3.2M9.2 19.2h5.6" stroke={color} strokeLinecap="round" strokeWidth={1.9} />
    </Svg>
  )
}

const styles = StyleSheet.create({
  error: {
    fontSize: 11,
    lineHeight: 15,
    paddingHorizontal: 8,
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 14,
    minHeight: 64,
    padding: 12,
    textAlignVertical: 'top',
  },
  root: {
    gap: 8,
    position: 'relative',
    zIndex: 1,
  },
  count: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  toolButton: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 42,
  },
  toolRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  toolText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
})
