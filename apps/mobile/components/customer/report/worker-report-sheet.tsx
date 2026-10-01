import { CUSTOMER_REPORTABLE_VIOLATIONS, type CustomerReportableViolation } from '@nestscout/shared'
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { KaelTextInput } from '@/components/ui/kael-primitives'
import { typography } from '@/design/theme'
import type { AppLanguage } from '@/lib/app-language'
import { useAuth } from '@/lib/auth-provider'
import { disciplineService } from '@/lib/services/discipline-service'

import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  useCustomerThemeMode,
} from '../customer-theme'

const MIN_STATEMENT = 10

const HARM_CODES = new Set<CustomerReportableViolation>([
  'theft',
  'intentional_damage',
  'harassment_sexual',
  'violence',
  'threats',
  'covert_recording',
])

const LABELS: Record<CustomerReportableViolation, [string, string]> = {
  off_app_dealing: ['Thợ đề nghị làm hoặc trả tiền ngoài app', 'Worker offered to deal outside the app'],
  extra_cash: ['Thợ đòi thêm tiền mặt ngoài giá đã chốt', 'Worker asked for extra cash'],
  theft: ['Mất tài sản sau khi thợ làm việc', 'Property missing after the visit'],
  intentional_damage: ['Thợ cố ý làm hư hại đồ đạc', 'Worker damaged property on purpose'],
  harassment_sexual: ['Quấy rối tình dục', 'Sexual harassment'],
  violence: ['Bạo lực', 'Violence'],
  threats: ['Đe dọa', 'Threats'],
  covert_recording: ['Quay phim hoặc ghi âm lén', 'Covert filming or recording'],
}

export function isHarmReport(code: CustomerReportableViolation): boolean {
  return HARM_CODES.has(code)
}

export function WorkerReportSheet({
  jobId,
  language,
  onClose,
  visible,
}: {
  jobId: string
  language: AppLanguage
  onClose: () => void
  visible: boolean
}) {
  const { session } = useAuth()
  const mode = useCustomerThemeMode()
  const glass = useGlassAccessibility()
  const base = getCustomerThemeTokens(mode)
  const tokens = glass.reduceTransparency ? getReducedTransparencyCustomerTokens(base) : base
  const [category, setCategory] = useState<CustomerReportableViolation | null>(null)
  const [statement, setStatement] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'sent' | 'offline' | 'signed_out' | 'failed' | 'rate_limited' | 'not_reportable' | 'worker_changed' | null>(null)
  const vi = language === 'vi'
  const canSend = category !== null && statement.trim().length >= MIN_STATEMENT && !sending && result !== 'sent'

  const send = async () => {
    if (!canSend || !category) return
    setSending(true)
    const response = await disciplineService.reportWorker(jobId, category, statement.trim(), session?.access_token ?? '')
    setSending(false)
    if (response.success) setResult('sent')
    else if (response.code === 'RATE_LIMITED') setResult('rate_limited')
    else if (response.code === 'INVALID_STATUS') setResult('not_reportable')
    else if (response.code === 'JOB_WORKER_CHANGED') setResult('worker_changed')
    // Each cause gets its own instruction: a signed-out customer checking the Wi-Fi fixes nothing.
    else if (response.code === 'AUTH_REQUIRED' || response.status === 401) setResult('signed_out')
    else if (response.code === 'NETWORK_ERROR' || response.code === 'TIMEOUT') setResult('offline')
    else setResult('failed')
  }

  const close = () => {
    setCategory(null)
    setStatement('')
    setResult(null)
    onClose()
  }

  return (
    <Modal animationType="none" onRequestClose={close} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: tokens.raised, borderColor: tokens.border }]} testID="customer-worker-report-sheet">
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text accessibilityRole="header" style={[styles.title, { color: tokens.text }]}>{vi ? 'Báo cáo thợ' : 'Report the worker'}</Text>
            <Text style={[styles.body, { color: tokens.muted }]}>
              {vi
                ? 'Quản trị viên NestScout sẽ xem xét báo cáo cùng bằng chứng trong app trước khi xử lý. Báo cáo sai sự thật có thể khiến tài khoản của bạn bị khóa.'
                : 'A NestScout administrator reviews the report with the in-app evidence before acting. A false report can get your account locked.'}
            </Text>
            {CUSTOMER_REPORTABLE_VIOLATIONS.map((code) => {
              const selected = category === code
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={code}
                  onPress={() => setCategory(code)}
                  style={[styles.option, { borderColor: selected ? tokens.primary : tokens.border }, selected && { backgroundColor: tokens.statusSurface, borderWidth: 2 }]}
                  testID={`customer-worker-report-option-${code}`}
                >
                  <Text style={[styles.optionLabel, { color: tokens.text }]}>{vi ? LABELS[code][0] : LABELS[code][1]}</Text>
                </Pressable>
              )
            })}
            {category && isHarmReport(category) ? (
              <View style={[styles.urgent, { borderColor: tokens.borderStrong }]} testID="customer-worker-report-urgent">
                <Text style={[styles.optionLabel, { color: tokens.text }]}>
                  {vi ? 'Nếu bạn đang gặp nguy hiểm, hãy gọi 113 ngay.' : 'If you are in danger, call 113 now.'}
                </Text>
                <Text style={[styles.body, { color: tokens.muted }]}>
                  {vi
                    ? 'Với báo cáo về an toàn, quản trị viên có thể tạm ngừng cho thợ nhận việc ngay trong lúc xác minh.'
                    : 'For safety reports, an administrator can pause the worker from new jobs while it is verified.'}
                </Text>
              </View>
            ) : null}
            <KaelTextInput
              accessibilityLabel={vi ? 'Mô tả sự việc' : 'What happened'}
              maxLength={2000}
              multiline
              onChangeText={setStatement}
              placeholder={vi ? 'Mô tả sự việc: thời gian, điều bạn thấy hoặc nghe' : 'What happened: when, what you saw or heard'}
              placeholderTextColor={tokens.subtleText}
              style={[styles.input, { borderColor: tokens.borderStrong, color: tokens.text }]}
              testID="customer-worker-report-statement"
              value={statement}
            />
            {result ? (
              <Text accessibilityLiveRegion="polite" style={[styles.body, { color: tokens.text }]} testID="customer-worker-report-result">
                {result === 'sent'
                  ? (vi ? 'Đã gửi báo cáo. NestScout sẽ liên hệ khi có kết quả xem xét.' : 'Report sent. NestScout will follow up after the review.')
                  : result === 'rate_limited'
                    ? (vi ? 'Bạn đã gửi quá nhiều báo cáo hôm nay.' : 'You have sent too many reports today.')
                    : result === 'not_reportable'
                      ? (vi ? 'Chỉ báo cáo được thợ đã nhận công việc của bạn.' : 'You can only report the worker who took your job.')
                    : result === 'worker_changed'
                      ? (vi ? 'Công việc này đã đổi thợ. Hãy báo qua mục Hỗ trợ để NestScout xác định đúng người.' : 'This job changed workers. Report it through Support so NestScout identifies the right person.')
                      : result === 'signed_out'
                        ? (vi ? 'Phiên đăng nhập đã hết hạn. Đăng nhập lại rồi gửi báo cáo.' : 'Your session has expired. Sign in again, then send the report.')
                        : result === 'offline'
                          ? (vi ? 'Chưa gửi được báo cáo. Kiểm tra kết nối rồi thử lại.' : 'Could not send the report. Check your connection and try again.')
                          : (vi ? 'NestScout chưa nhận được báo cáo. Vui lòng thử lại sau ít phút.' : 'NestScout could not take the report yet. Please try again in a few minutes.')}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSend, busy: sending }}
              disabled={!canSend}
              onPress={() => void send()}
              style={[styles.primary, { backgroundColor: canSend ? tokens.primary : tokens.disabled }]}
              testID="customer-worker-report-submit"
            >
              <Text style={[styles.primaryLabel, { color: canSend ? tokens.primaryText : tokens.muted }]}>
                {sending ? (vi ? 'Đang gửi' : 'Sending') : (vi ? 'Gửi báo cáo' : 'Send report')}
              </Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={close} style={styles.secondary} testID="customer-worker-report-close">
              <Text style={[styles.optionLabel, { color: tokens.primary }]}>{result === 'sent' ? (vi ? 'Đóng' : 'Close') : (vi ? 'Để sau' : 'Not now')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(7, 26, 36, 0.4)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    maxHeight: '90%',
  },
  content: {
    gap: 10,
    padding: 18,
    paddingBottom: 32,
  },
  title: {
    ...typography.title3,
    fontWeight: '600',
  },
  body: {
    ...typography.footnote,
  },
  option: {
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optionLabel: {
    ...typography.subheadline,
  },
  urgent: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 96,
    padding: 12,
    textAlignVertical: 'top',
    ...typography.footnote,
  },
  primary: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryLabel: {
    ...typography.subheadline,
    fontWeight: '600',
  },
  secondary: {
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
})
