import { useRouter } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { KaelButton, KaelTextInput } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'

import { ProfileSettingsGlyph } from '../profile/profile-settings-icons'
import { useCustomerV21SurfaceTheme, V21Card, V21Screen, V21TopBar } from '../ui/shared-surfaces'

export function ProfilePersonalDetailsPrototype() {
  const router = useRouter()
  const { tokens } = useCustomerV21SurfaceTheme()
  const [name, setName] = useState('Phan Mạnh Tú')
  const [email, setEmail] = useState('manhtu0407+customer@gmail.com')
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState(false)

  return (
    <V21Screen
      frameStyle={styles.frame}
      screenId="6.1-profile-overview"
      testID="customer-profile-personal-details-prototype"
    >
      <V21TopBar
        onBack={() => router.back()}
        showAvatar={false}
        subtitle=""
        title="Thông tin cá nhân"
        titleStyle={styles.topTitle}
        testID="customer-profile-personal-details-prototype-top-bar"
      />

      <V21Card
        style={[styles.formSurface, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
        testID="customer-profile-personal-details-prototype-form"
      >
        <View style={styles.formHeader}>
          <View style={[styles.introIcon, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
            <ProfileSettingsGlyph color={tokens.primary} name="personal" testID="customer-profile-personal-details-prototype-intro-icon" />
          </View>
          <View style={styles.introCopy}>
            <Text style={[styles.introTitle, { color: tokens.text }]}>Kiểm soát thông tin của bạn</Text>
            <Text style={[styles.introBody, { color: tokens.muted }]}>Cập nhật cách NestScout liên hệ với bạn.</Text>
          </View>
        </View>

        <View style={styles.fieldStack}>
          <Text style={[styles.fieldLabel, { color: tokens.text }]}>Họ và tên</Text>
          <View style={[styles.inputShell, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
            <KaelTextInput
              accessibilityLabel="Họ và tên"
              autoCapitalize="words"
              onChangeText={(value) => {
                setName(value)
                setSaved(false)
              }}
              style={[styles.input, { color: tokens.text }]}
              testID="customer-profile-personal-details-prototype-name"
              value={name}
            />
          </View>
        </View>

        <View style={styles.fieldStack}>
          <View style={styles.fieldLabelRow}>
            <Text style={[styles.fieldLabel, { color: tokens.text }]}>Gmail</Text>
            <Text style={[styles.fieldMeta, { color: tokens.muted }]}>Tài khoản</Text>
          </View>
          <View style={[styles.inputShell, styles.readonlyShell, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
            <KaelTextInput
              accessibilityLabel="Gmail"
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(value) => {
                setEmail(value)
                setSaved(false)
              }}
              style={[styles.input, { color: tokens.text }]}
              testID="customer-profile-personal-details-prototype-email"
              value={email}
            />
          </View>
        </View>

        <View style={styles.fieldStack}>
          <Text style={[styles.fieldLabel, { color: tokens.text }]}>Số điện thoại</Text>
          <View style={[styles.inputShell, { backgroundColor: tokens.base, borderColor: tokens.border }]}>
            <KaelTextInput
              accessibilityLabel="Số điện thoại"
              keyboardType="phone-pad"
              onChangeText={(value) => {
                setPhone(value)
                setSaved(false)
              }}
              placeholder="Chưa cập nhật"
              placeholderTextColor={tokens.muted}
              style={[styles.input, { color: tokens.text }]}
              testID="customer-profile-personal-details-prototype-phone"
              value={phone}
            />
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: tokens.border }]} />

        <View style={styles.privacyRow}>
          <ProfileSettingsGlyph color={tokens.primary} name="password" />
          <Text style={[styles.privacyText, { color: tokens.muted }]}>Thông tin này chỉ dùng cho tài khoản và liên hệ dịch vụ.</Text>
        </View>

        <KaelButton
          label={saved ? 'Đã lưu' : 'Lưu thay đổi'}
          onPress={() => setSaved(true)}
          showPrimaryGradient={false}
          style={styles.saveButton}
          testID="customer-profile-personal-details-prototype-save"
          variant="primary"
        />
      </V21Card>
    </V21Screen>
  )
}

const styles = StyleSheet.create({
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  fieldLabel: {
    ...typography.footnote,
    fontWeight: '700',
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  fieldMeta: {
    ...typography.caption2,
    fontWeight: '600',
  },
  fieldStack: {
    gap: 7,
  },
  formHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  formSurface: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  frame: {
    gap: 0,
  },
  input: {
    flex: 1,
    ...typography.body,
    minHeight: 54,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  inputShell: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 56,
    paddingHorizontal: 14,
  },
  introBody: {
    ...typography.footnote,
    marginTop: 2,
  },
  introCopy: {
    flex: 1,
    gap: 2,
  },
  introIcon: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  introTitle: {
    ...typography.callout,
    fontWeight: '700',
  },
  privacyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  privacyText: {
    flex: 1,
    ...typography.caption1,
  },
  readonlyShell: {
    opacity: 0.88,
  },
  saveButton: {
    minHeight: 52,
  },
  topTitle: {
    fontWeight: '600',
  },
})
