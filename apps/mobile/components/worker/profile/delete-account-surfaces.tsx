import { useState } from 'react'
import { Pressable, StyleSheet, Text as RNText, View, type TextProps } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'

import { ProfileSettingsGlyph } from '../../customer/profile/profile-settings-icons'
import { textByLanguage } from '../ui/format'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'

export function WorkerV5DeleteAccountBody({
  language,
  onOpenSupport,
}: {
  language: AppLanguage
  onOpenSupport: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const { reduceTransparency } = useGlassAccessibility()
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const isDark = themeMode === 'dark'

  return (
    <View style={styles.stack} testID="worker-v5-delete-account-screen">
      <View style={[styles.card, { backgroundColor: tokens.base, borderColor: tokens.border }]} testID="worker-v5-delete-account-card">
        <View style={styles.headingRow}>
          <View
            style={[styles.iconFrame, { backgroundColor: tokens.base, borderColor: tokens.borderStrong }]}
            testID="worker-v5-delete-account-icon-frame"
          >
            <ProfileSettingsGlyph color={tokens.danger} name="delete" testID="worker-v5-delete-account-icon" />
          </View>
          <View style={styles.headingCopy}>
            <Text style={[styles.title, { color: tokens.text }]}>{textByLanguage(language, 'Xóa tài khoản', 'Delete account')}</Text>
            <Text style={[styles.subtitle, { color: tokens.muted }]}>
              {textByLanguage(language, 'Yêu cầu này cần được kiểm tra trước khi xử lý.', 'This request needs a review before it can be processed.')}
            </Text>
          </View>
        </View>

        <View style={[styles.warning, { backgroundColor: tokens.base, borderColor: tokens.danger }]} testID="worker-v5-delete-account-warning">
          <Text style={[styles.warningTitle, { color: tokens.text }]}>{textByLanguage(language, 'Trước khi tiếp tục', 'Before you continue')}</Text>
          <Text style={[styles.body, { color: tokens.muted }]}>
            {textByLanguage(
              language,
              'Tài khoản thợ có thể gắn với công việc, đối soát và chứng từ. Yêu cầu xóa được tiếp nhận qua Hỗ trợ để bảo toàn dữ liệu giao dịch cần lưu.',
              'A worker account may be linked to jobs, settlement, and verification records. Deletion requests go through Support so required transaction records remain protected.',
            )}
          </Text>
        </View>

        <Pressable
          accessibilityLabel={textByLanguage(language, 'Xác nhận tôi hiểu việc xóa tài khoản có thể không hoàn tác', 'I understand account deletion may not be reversible')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged }}
          onPress={() => setAcknowledged((current) => !current)}
          style={({ pressed }) => [styles.acknowledgementRow, pressed ? styles.pressed : null]}
          testID="worker-v5-delete-account-acknowledgement"
        >
          <View style={[styles.checkbox, { backgroundColor: acknowledged ? tokens.primary : 'transparent', borderColor: acknowledged ? tokens.primary : tokens.borderStrong }]}>
            {acknowledged ? <Text style={[styles.checkmark, { color: tokens.primaryText }]}>✓</Text> : null}
          </View>
          <Text style={[styles.acknowledgementText, { color: isDark ? tokens.text : tokens.muted }]}>
            {textByLanguage(language, 'Tôi hiểu việc xóa tài khoản có thể không hoàn tác.', 'I understand account deletion may not be reversible.')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityHint={textByLanguage(language, 'Mở Hỗ trợ để gửi yêu cầu xóa tài khoản', 'Open Support to submit an account deletion request')}
          accessibilityLabel={textByLanguage(language, 'Mở Hỗ trợ', 'Open Support')}
          accessibilityRole="button"
          disabled={!acknowledged}
          onPress={onOpenSupport}
          style={({ pressed }) => [
            styles.supportButton,
            { backgroundColor: tokens.primary },
            !acknowledged ? styles.supportButtonDisabled : null,
            pressed && acknowledged ? styles.pressed : null,
          ]}
          testID="worker-v5-delete-account-open-support"
        >
          <Text style={[styles.supportButtonText, { color: tokens.primaryText }]}>{textByLanguage(language, 'Mở Hỗ trợ', 'Open Support')}</Text>
        </Pressable>
      </View>
    </View>
  )
}

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.font, style]} />
}

const styles = StyleSheet.create({
  acknowledgementRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  acknowledgementText: {
    flex: 1,
    ...typography.footnote,
  },
  body: {
    ...typography.footnote,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkmark: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  font: {
    ...typography.body,
  },
  headingCopy: {
    flex: 1,
    gap: 4,
  },
  headingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  iconFrame: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.992 }],
  },
  stack: {
    gap: 18,
  },
  subtitle: {
    ...typography.footnote,
  },
  supportButton: {
    alignItems: 'center',
    borderRadius: 18,
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  supportButtonDisabled: {
    opacity: 0.42,
  },
  supportButtonText: {
    ...typography.callout,
    fontWeight: '700',
  },
  title: {
    ...typography.title3,
    fontWeight: '700',
  },
  warning: {
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  warningTitle: {
    ...typography.callout,
    fontWeight: '700',
  },
})
