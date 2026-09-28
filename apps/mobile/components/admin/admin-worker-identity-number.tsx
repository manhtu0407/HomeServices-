import { useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { KaelButton, KaelTextField } from '@/components/ui/kael-primitives'
import { color, typography } from '@/design/theme'
import { adminProgramService } from '@/lib/services/admin-program-service'

import { AdminText } from './admin-text'

const CCCD_PATTERN = /^[0-9]{12}$/

// The reviewer types the 12-digit number off the ID photo. Only a keyed digest and the last
// four digits are stored, and the first approval is refused until this is on record.
export function AdminWorkerIdentityNumber({ language, workerId }: { language: 'vi' | 'en'; workerId: string }) {
  const vi = language === 'vi'
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedLast4, setSavedLast4] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const digits = value.replace(/\D/g, '')
  const valid = CCCD_PATTERN.test(digits)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    const result = await adminProgramService.setWorkerIdentityNumber(workerId, digits)
    setSaving(false)
    if (result.success && result.data.worker_id === workerId) {
      setSavedLast4(result.data.cccd_last4)
      setValue('')
      return
    }
    setError(!result.success && result.code === 'IDENTITY_BLOCKLISTED'
      ? (vi ? 'CCCD, số điện thoại hoặc email của thợ này đã bị chặn do vi phạm nghiêm trọng. Không duyệt hồ sơ này.' : 'This worker’s ID, phone or email is blocklisted for a serious violation. Do not approve.')
      : (vi ? 'Chưa lưu được số CCCD. Thử lại.' : 'Could not save the ID number. Try again.'))
  }

  return (
    <View style={styles.section} testID="admin-worker-identity-number">
      <AdminText textRole="title2" style={styles.title}>{vi ? 'Số CCCD' : 'ID number'}</AdminText>
      <AdminText textRole="subheadline" style={styles.body}>
        {vi
          ? 'Nhập 12 số trên ảnh CCCD. Hệ thống chỉ lưu dạng mã hóa (cùng số điện thoại và email đăng nhập của thợ) và 4 số cuối, dùng để chặn đăng ký lại sau vi phạm nghiêm trọng. Bắt buộc trước khi duyệt.'
          : 'Enter the 12 digits from the ID photo. Only an encoded form (with the worker’s phone and sign-in email) and the last four digits are kept, to block re-registration after a serious violation. Required before approval.'}
      </AdminText>
      {savedLast4 ? (
        <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.saved} testID="admin-worker-identity-number-saved">
          {vi ? `Đã lưu CCCD ••••${savedLast4}` : `ID saved ••••${savedLast4}`}
        </AdminText>
      ) : null}
      <KaelTextField
        accessibilityLabel={vi ? 'Số CCCD 12 chữ số' : '12-digit ID number'}
        editable={!saving}
        keyboardType="number-pad"
        maxLength={14}
        onChangeText={(text) => {
          setValue(text)
          setError(null)
        }}
        placeholder={vi ? '12 chữ số' : '12 digits'}
        placeholderTextColor={color.text.muted}
        testID="admin-worker-identity-number-input"
        value={value}
      />
      {error ? <AdminText textRole="subheadline" accessibilityRole="alert" style={styles.error}>{error}</AdminText> : null}
      <KaelButton
        disabled={!valid || saving}
        label={saving ? (vi ? 'Đang lưu' : 'Saving') : (vi ? 'Lưu số CCCD' : 'Save ID number')}
        onPress={() => { void save() }}
        testID="admin-worker-identity-number-save"
        variant="secondary"
      />
    </View>
  )
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    marginTop: 16,
  },
  title: {
    color: color.text.strong,
  },
  body: {
    color: color.text.secondary,
    ...typography.footnote,
  },
  saved: {
    color: color.brand.primaryDark,
  },
  error: {
    color: color.accent.destructive,
  },
})
