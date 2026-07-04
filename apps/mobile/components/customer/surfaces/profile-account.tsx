import { styles } from './styles'
import { customerProfileInputSurface, customerProfileSegmentSurface } from './surface-styles'
import { type CustomerThemeTokens } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { Pressable, Text, TextInput, View } from 'react-native'

export type CustomerProfileEditField = 'address' | 'nickname'

export type CustomerAccountInfoDraft = {
  birthDate: string
  email: string
  fullName: string
  gender: string
  phone: string
  salutation: string
}

type CustomerGenderValue = 'female' | 'male' | 'other'

const customerGenderOptions: readonly CustomerGenderValue[] = ['male', 'female', 'other']

export function readCustomerProfileMetric(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

export function formatCustomerBirthDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

export function isValidCustomerBirthDate(value: string) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return false
  const day = Number(match[1])
  const month = Number(match[2])
  const year = Number(match[3])
  const currentYear = new Date().getFullYear()
  if (year < 1900 || year > currentYear || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysByMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= daysByMonth[month - 1]
}

export function normalizeCustomerGender(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'male' || normalized === 'nam') return 'male'
  if (normalized === 'female' || normalized === 'nữ' || normalized === 'nu') return 'female'
  if (normalized === 'other' || normalized === 'khác' || normalized === 'khac') return 'other'
  return ''
}

export function AccountInfoField({
  autoCapitalize = 'sentences',
  editable,
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  testID,
  tokens,
  value,
}: {
  autoCapitalize?: 'none' | 'sentences'
  editable: boolean
  keyboardType?: 'default' | 'email-address' | 'number-pad' | 'phone-pad'
  label: string
  onChangeText: (value: string) => void
  placeholder: string
  testID: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={[styles.accountInfoField, customerProfileInputSurface(tokens)]}>
      <Text style={[styles.accountInfoFieldLabel, { color: tokens.text }]} numberOfLines={1}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        editable={editable}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.subtleText}
        returnKeyType="done"
        style={[styles.accountInfoFieldInput, { color: tokens.text }]}
        testID={testID}
        value={value}
      />
    </View>
  )
}

export function AccountInfoGenderSegment({
  disabled,
  labels,
  onSelect,
  selected,
  title,
  tokens,
}: {
  disabled: boolean
  labels: Record<CustomerGenderValue, string>
  onSelect: (value: CustomerGenderValue) => void
  selected: string
  title: string
  tokens: CustomerThemeTokens
}) {
  const { reduceMotion } = useGlassAccessibility()

  return (
    <View style={[styles.accountInfoField, customerProfileInputSurface(tokens)]} testID="customer-account-gender-segment">
      <Text style={[styles.accountInfoFieldLabel, { color: tokens.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.accountInfoSegmentRow}>
        {customerGenderOptions.map((option) => {
          const active = selected === option
          return (
            <Pressable
              accessibilityLabel={labels[option]}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: active }}
              disabled={disabled}
              key={option}
              onPress={() => onSelect(option)}
              style={({ pressed }) => [
                styles.accountInfoSegmentButton,
                customerProfileSegmentSurface(tokens, active),
                reduceMotionAwarePressStyle(pressed, reduceMotion),
                disabled ? styles.disabled : null,
              ]}
              testID={`customer-account-gender-${option}`}
            >
              <Text style={[styles.accountInfoSegmentText, { color: active ? tokens.primary : tokens.muted }]} numberOfLines={1}>
                {labels[option]}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
