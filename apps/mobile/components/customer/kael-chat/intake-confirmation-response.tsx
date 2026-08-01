import { Pressable, StyleSheet, Text, View } from 'react-native'

import type { KaelIntakeConfirmation } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'
import type { CustomerThemeTokens } from '../customer-theme'

export function IntakeConfirmationResponse({
  busy,
  confirmation,
  language,
  onConfirm,
  onCorrection,
  tokens,
}: {
  busy: boolean
  confirmation: KaelIntakeConfirmation
  language: AppLanguage
  onConfirm: () => void
  onCorrection: () => void
  tokens: CustomerThemeTokens
}) {
  const copy = language === 'vi'
    ? {
        accessibilityLabel: 'Thông tin công việc cần xác nhận',
        attention: 'Cần lưu ý',
        confirm: 'Xác nhận thông tin',
        correction: 'Thông tin chưa đúng',
        invalid: 'Cần chỉnh sửa',
      }
    : {
        accessibilityLabel: 'Work details awaiting confirmation',
        attention: 'Needs attention',
        confirm: 'Confirm information',
        correction: 'Information is incorrect',
        invalid: 'Needs correction',
      }

  return (
    <View
      accessibilityLabel={copy.accessibilityLabel}
      style={styles.content}
      testID="customer-kael-intake-confirmation"
    >
      <View style={styles.fields}>
        {confirmation.fields.map((field) => {
          const needsAttention = field.state !== 'clear'
          return (
            <View
              key={field.key}
              style={styles.field}
              testID={`customer-kael-intake-field-${field.key}`}
            >
              <View style={styles.fieldHeading}>
                <Text style={[styles.fieldLabel, { color: tokens.subtleText }]}>
                  {field.label}
                </Text>
                {needsAttention ? (
                  <Text style={[styles.fieldState, { color: tokens.danger }]}>
                    {field.state === 'invalid' ? copy.invalid : copy.attention}
                  </Text>
                ) : null}
              </View>
              <Text style={[styles.fieldValue, { color: tokens.text }]}>{field.value}</Text>
              {field.note ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.fieldNote, {
                    color: field.state === 'invalid' ? tokens.danger : tokens.muted,
                  }]}
                >
                  {field.note}
                </Text>
              ) : null}
            </View>
          )
        })}
      </View>

      <Text style={[styles.question, { color: tokens.muted }]}>{confirmation.question}</Text>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCorrection}
          style={({ pressed }) => [
            styles.button,
            styles.secondaryButton,
            {
              backgroundColor: tokens.base,
              borderColor: tokens.borderStrong,
              opacity: busy ? 0.55 : pressed ? 0.78 : 1,
            },
          ]}
          testID="customer-kael-intake-correction"
        >
          <Text style={[styles.secondaryLabel, { color: tokens.primary }]}>
            {copy.correction}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: busy || confirmation.blocking }}
          disabled={busy || confirmation.blocking}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            {
              backgroundColor: confirmation.blocking ? tokens.disabled : tokens.primary,
              opacity: busy ? 0.55 : pressed ? 0.82 : 1,
            },
          ]}
          testID="customer-kael-intake-confirm"
        >
          <Text style={[styles.primaryLabel, { color: tokens.primaryText }]}>
            {copy.confirm}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  button: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 52,
    minWidth: 150,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  content: {
    gap: 18,
    width: '100%',
  },
  field: {
    gap: 4,
  },
  fieldHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  fieldLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  fieldNote: {
    fontSize: 13,
    lineHeight: 19,
  },
  fieldState: {
    fontSize: 11,
    fontWeight: '600',
  },
  fields: {
    gap: 15,
  },
  fieldValue: {
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
  primaryButton: {
    flexGrow: 1.15,
  },
  primaryLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  question: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
  },
  secondaryButton: {
    borderWidth: 1,
    flexGrow: 1,
  },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
})
