import { useReducer } from 'react'
import { Pressable, StyleSheet, Text as RNText, View, type TextProps } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelButton, KaelTextInput } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { accountDeletionErrorMessage, accountDeletionService } from '@/lib/account-deletion-service'
import { generateClientRequestId } from '@/lib/client-request-id'

import { ProfileSettingsGlyph } from '../../customer/profile/profile-settings-icons'
import { textByLanguage } from '../ui/format'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode } from '../worker-theme'

type DeleteAccountState = {
  acknowledged: boolean
  clientRequestId: string
  confirmation: string
  deleting: boolean
  message: string | null
  reauthRequired: boolean
}

function mergeDeleteAccountState(
  state: DeleteAccountState,
  next: Partial<DeleteAccountState>,
) {
  return { ...state, ...next }
}

export function WorkerV5DeleteAccountBody({
  accessToken,
  language,
  onDeleted,
  onReauthenticate,
}: {
  accessToken: string | null
  language: AppLanguage
  onDeleted: () => Promise<void> | void
  onReauthenticate: () => Promise<void> | void
}) {
  const [{ acknowledged, clientRequestId, confirmation, deleting, message, reauthRequired }, setDeleteState] = useReducer(
    mergeDeleteAccountState,
    undefined,
    () => ({
      acknowledged: false,
      clientRequestId: generateClientRequestId(),
      confirmation: '',
      deleting: false,
      message: null,
      reauthRequired: false,
    }),
  )
  const { reduceTransparency } = useGlassAccessibility()
  const themeMode = useWorkerThemeMode()
  const baseTokens = getWorkerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const isDark = themeMode === 'dark'
  const canDelete = acknowledged && confirmation.trim() === 'XÓA TÀI KHOẢN' && !deleting

  const deleteAccount = async () => {
    if (!canDelete || !accessToken) {
      if (!accessToken) {
        setDeleteState({
          message: textByLanguage(
            language,
            'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.',
            'Your session expired. Sign in again and retry.',
          ),
          reauthRequired: true,
        })
      }
      return
    }

    setDeleteState({ deleting: true, message: null, reauthRequired: false })
    try {
      const result = await accountDeletionService.deleteAccount({
        acknowledge_data_loss: true,
        client_request_id: clientRequestId,
        confirmation: 'XÓA TÀI KHOẢN',
      }, accessToken)
      if (!result.success) {
        setDeleteState({
          message: accountDeletionErrorMessage(language, result),
          reauthRequired: result.code === 'AUTH_REQUIRED' || result.code === 'REAUTH_REQUIRED',
        })
        return
      }
      await onDeleted()
    } finally {
      setDeleteState({ deleting: false })
    }
  }

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
              {textByLanguage(language, 'Xác nhận từng bước để gửi yêu cầu ngay trong ứng dụng.', 'Confirm each step to submit the request in the app.')}
            </Text>
          </View>
        </View>

        <View style={[styles.warning, { backgroundColor: tokens.base, borderColor: tokens.danger }]} testID="worker-v5-delete-account-warning">
          <Text style={[styles.warningTitle, { color: tokens.text }]}>{textByLanguage(language, 'Trước khi tiếp tục', 'Before you continue')}</Text>
          <Text style={[styles.body, { color: tokens.muted }]}>
            {textByLanguage(
              language,
              'Không thể xóa khi còn công việc, tranh chấp, thanh toán hoặc đối soát đang xử lý. Thông tin cá nhân sẽ bị xóa; hồ sơ giao dịch bắt buộc được giữ ở dạng không còn dùng để đăng nhập.',
              'Deletion is blocked while jobs, disputes, payments, or settlements remain open. Personal data is removed while required transaction records remain without login access.',
            )}
          </Text>
        </View>

        <Pressable
          accessibilityLabel={textByLanguage(language, 'Xác nhận tôi hiểu việc xóa tài khoản có thể không hoàn tác', 'I understand account deletion may not be reversible')}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged, disabled: deleting }}
          disabled={deleting}
          onPress={() => setDeleteState({ acknowledged: !acknowledged })}
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

        <View style={styles.confirmationStack}>
          <Text style={[styles.body, { color: tokens.muted }]}>
            {textByLanguage(language, 'Nhập đúng cụm từ sau để xác nhận:', 'Enter this exact phrase to confirm:')}
          </Text>
          <Text selectable style={[styles.confirmationPhrase, { color: tokens.text }]}>XÓA TÀI KHOẢN</Text>
          <KaelTextInput
            accessibilityLabel={textByLanguage(language, 'Cụm từ xác nhận xóa tài khoản', 'Account deletion confirmation phrase')}
            autoCapitalize="characters"
            editable={!deleting}
            onChangeText={(value) => setDeleteState({ confirmation: value })}
            placeholder="XÓA TÀI KHOẢN"
            placeholderTextColor={tokens.subtleText}
            style={[styles.confirmationInput, { backgroundColor: tokens.base, borderColor: tokens.borderStrong, color: tokens.text }]}
            testID="worker-v5-delete-account-confirmation"
            value={confirmation}
          />
        </View>

        <KaelButton
          disabled={!canDelete}
          label={deleting
            ? textByLanguage(language, 'Đang xóa tài khoản', 'Deleting account')
            : textByLanguage(language, 'Xóa tài khoản của tôi', 'Delete my account')}
          loading={deleting}
          onPress={() => void deleteAccount()}
          showPrimaryGradient={false}
          style={canDelete ? { backgroundColor: tokens.danger } : null}
          testID="worker-v5-delete-account-submit"
          variant="destructive"
        />
        {message ? (
          <Text accessibilityRole="alert" style={[styles.message, { color: tokens.danger }]} testID="worker-v5-delete-account-message">
            {message}
          </Text>
        ) : null}
        {reauthRequired ? (
          <KaelButton
            label={textByLanguage(language, 'Đăng nhập lại', 'Sign in again')}
            onPress={() => void onReauthenticate()}
            testID="worker-v5-delete-account-reauthenticate"
          />
        ) : null}
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
  confirmationInput: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 54,
    paddingHorizontal: 14,
  },
  confirmationPhrase: {
    ...typography.callout,
    fontWeight: '700',
  },
  confirmationStack: {
    gap: 8,
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
  message: {
    ...typography.footnote,
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
