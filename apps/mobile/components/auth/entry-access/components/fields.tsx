import { useRef, useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type KeyboardTypeOptions,
  type TextStyle,
  type TextInput as RNTextInput,
  type TextInputProps,
} from 'react-native'
import { KaelTextInput } from '@/components/ui/kael-primitives'
import { entryTheme } from '../theme'
import { EntryIcon, type EntryIconName } from './icons'

export function EntryTextField({
  autoCapitalize = 'none',
  icon,
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  secureTextEntry,
  testID,
  textContentType,
  value,
}: {
  autoCapitalize?: TextInputProps['autoCapitalize']
  icon: EntryIconName
  keyboardType?: KeyboardTypeOptions
  label: string
  onChangeText: (value: string) => void
  placeholder: string
  secureTextEntry?: boolean
  testID?: string
  textContentType?: TextInputProps['textContentType']
  value: string
}) {
  const inputRef = useRef<RNTextInput>(null)
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const isSecure = Boolean(secureTextEntry) && !revealed
  const shellTestID = testID ? `${testID}-shell` : undefined
  const focusInput = () => inputRef.current?.focus()

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        accessible={false}
        onPress={focusInput}
        onPressIn={focusInput}
        style={({ pressed }: { pressed: boolean }) => [styles.field, focused && styles.fieldFocused, pressed && !focused && styles.fieldPressed]}
        testID={shellTestID}
      >
        <EntryIcon color={entryTheme.color.mint.mint700} name={icon} size={17} />
        <KaelTextInput
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor="#87999E"
          ref={inputRef}
          secureTextEntry={isSecure}
          style={[styles.input, webInputFocusReset]}
          testID={testID}
          textContentType={textContentType}
          value={value}
        />
        {secureTextEntry ? (
          <Pressable accessibilityLabel={revealed ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} hitSlop={8} onPress={() => setRevealed((current) => !current)}>
            <EntryIcon color={entryTheme.color.text.muted} name="eye" size={18} />
          </Pressable>
        ) : null}
      </Pressable>
    </View>
  )
}

export function CheckRow({ checked, label, onPress, testID }: { checked: boolean; label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={styles.checkRow} testID={testID}>
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked ? <EntryIcon color={entryTheme.color.mint.mint700} name="check" size={11} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  checkLabel: { color: entryTheme.color.text.secondary, flexShrink: 1, fontSize: 11, lineHeight: 16 },
  checkbox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: entryTheme.color.surface.strokeStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 17,
    justifyContent: 'center',
    width: 17,
  },
  checkboxChecked: { backgroundColor: entryTheme.color.mint.mint50 },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 28 },
  field: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderColor: entryTheme.color.surface.stroke,
    borderRadius: entryTheme.radius.input,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 50,
    paddingHorizontal: 14,
  },
  fieldFocused: {
    borderColor: 'rgba(36,179,161,0.65)',
    shadowColor: '#088779',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  fieldPressed: { borderColor: 'rgba(36,179,161,0.42)' },
  group: { gap: 7, marginBottom: 12 },
  input: { color: entryTheme.color.text.primary, flex: 1, fontSize: 13, height: '100%', paddingVertical: 0 },
  label: { color: entryTheme.color.text.strong, fontSize: 12, fontWeight: '600', paddingLeft: 2 },
})

const webInputFocusReset = Platform.OS === 'web'
  ? ({ boxShadow: 'none', outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle)
  : null
