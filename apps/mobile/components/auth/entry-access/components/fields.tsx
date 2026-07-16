import { useState } from 'react'
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type KeyboardTypeOptions,
  type TextStyle,
  type TextInputProps,
} from 'react-native'
import { KaelTextInput } from '@/components/ui/kael-primitives'
import { useAppLanguage } from '@/lib/app-language'
import { entryAccessCopy } from '../copy'
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
  const language = useAppLanguage()
  const accessibilityCopy = entryAccessCopy[language].accessibility
  const [focused, setFocused] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const isSecure = Boolean(secureTextEntry) && !revealed
  const shellTestID = testID ? `${testID}-shell` : undefined
  const iconRailTestID = testID ? `${testID}-icon-rail` : undefined

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]} testID={shellTestID}>
        <View style={styles.iconRail} testID={iconRailTestID}>
          <EntryIcon color={entryTheme.color.mint.mint700} name={icon} size={16} />
        </View>
        <KaelTextInput
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          keyboardType={keyboardType}
          onBlur={() => setFocused(false)}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          placeholderTextColor="#87999E"
          secureTextEntry={isSecure}
          style={[styles.input, webInputFocusReset]}
          testID={testID}
          textContentType={textContentType}
          value={value}
        />
        {secureTextEntry ? (
          <Pressable accessibilityLabel={revealed ? accessibilityCopy.hidePassword : accessibilityCopy.showPassword} hitSlop={8} onPress={() => setRevealed((current) => !current)}>
            <EntryIcon color={entryTheme.color.text.muted} name="eye" size={18} />
          </Pressable>
        ) : null}
      </View>
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
    boxShadow: '0px 0px 3px rgba(8,135,121,0.08)',
  },
  group: { gap: 7, marginBottom: 12 },
  iconRail: {
    alignItems: 'center',
    backgroundColor: 'rgba(230,249,245,0.9)',
    borderColor: 'rgba(36,179,161,0.14)',
    borderRadius: 10,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  input: { color: entryTheme.color.text.primary, flex: 1, fontSize: 13, height: '100%', paddingVertical: 0 },
  label: { color: entryTheme.color.text.strong, fontSize: 12, fontWeight: '600', paddingLeft: 2 },
})

const webInputFocusReset = Platform.OS === 'web'
  ? ({ boxShadow: 'none', outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle)
  : null
