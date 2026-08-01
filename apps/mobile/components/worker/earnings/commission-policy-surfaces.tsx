import { Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { styles } from './commission-policy-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function commissionRate(rateBps: number | null | undefined) {
  if (typeof rateBps !== 'number' || !Number.isFinite(rateBps)) return null
  return `${rateBps / 100}%`
}

function PolicyPoint({ children }: { children: string }) {
  return (
    <View style={styles.point}>
      <View style={styles.pointDot} />
      <Text style={styles.pointCopy}>{children}</Text>
    </View>
  )
}

export function WorkerV5CommissionPolicy({
  earnings,
  language,
  reduceTransparency,
}: {
  earnings: EarningsResponse | null | undefined
  language: AppLanguage
  reduceTransparency: boolean
}) {
  const currentRate = commissionRate(earnings?.current_commission_rate_bps)
  const level = earnings?.current_commission_level

  return (
    <View
      style={[styles.policyCard, reduceTransparency && styles.opaqueCard]}
      testID="worker-v5-commission-policy"
    >
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="CommissionPolicy"
        testID="worker-v5-commission-policy-formula-mint-aura"
      />
      <View style={styles.rateHeader}>
        <View style={styles.rateCopy}>
          <Text style={styles.eyebrow}>{textByLanguage(language, 'MỨC CỦA BẠN', 'YOUR RATE')}</Text>
          <Text style={styles.rateValue}>
            {currentRate ?? textByLanguage(language, 'Đang cập nhật', 'Updating')}
          </Text>
        {level ? (
          <Text style={styles.rateMeta}>
            {textByLanguage(language, `Bậc hiện tại: ${level}`, `Current level: ${level}`)}
          </Text>
        ) : null}
      </View>
      </View>

      <Text style={styles.sectionTitle}>{textByLanguage(language, 'Vì sao mức khởi điểm là 15%?', 'Why does the starting rate begin at 15%?')}</Text>
      <Text style={styles.paragraph}>
        {textByLanguage(
          language,
          'Khoản này được tính trên giá công việc đã chốt. 85% còn lại thuộc về thợ. NestScout dùng phần 15% để duy trì những việc cần thiết giúp mỗi công việc diễn ra rõ ràng và an toàn hơn.',
          'This amount is calculated from the confirmed job price. The remaining 85% belongs to the worker. NestScout uses the 15% to keep each job clear and safer.',
        )}
      </Text>
      <View style={styles.pointList}>
        <PolicyPoint>{textByLanguage(language, 'Tìm và kết nối khách có nhu cầu phù hợp với kỹ năng của thợ.', 'Find customers whose needs match the worker’s skills.')}</PolicyPoint>
        <PolicyPoint>{textByLanguage(language, 'Ghi nhận giá đã chốt, khoản thu và quá trình đối soát của từng công việc.', 'Record the confirmed price, earnings, and reconciliation for each job.')}</PolicyPoint>
        <PolicyPoint>{textByLanguage(language, 'Duy trì ứng dụng và hỗ trợ khi thợ hoặc khách cần giải quyết vấn đề.', 'Maintain the app and provide help when workers or customers need support.')}</PolicyPoint>
      </View>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>{textByLanguage(language, 'Làm tốt để giữ lại nhiều hơn', 'Do good work and keep more')}</Text>
        <Text style={styles.progressCopy}>
          {textByLanguage(
            language,
            'Càng làm việc đều, hoàn thành nhiều công việc, đến đúng hẹn và giữ đánh giá tốt, cơ hội lên bậc cao hơn càng lớn. Khi bậc cao hơn được áp dụng, tỷ lệ hoa hồng có thể giảm để bạn giữ lại nhiều hơn từ những công việc tiếp theo.',
            'Consistent work, more completed jobs, on-time arrival, and strong ratings improve the chance of reaching a higher level. When a higher level applies, the commission rate may decrease so you keep more from future jobs.',
          )}
        </Text>
      </View>
      <Text style={styles.footnote}>
        {textByLanguage(
          language,
          'Mức áp dụng cho mỗi công việc được giữ nguyên từ lúc khoản thanh toán được ghi nhận; việc đổi bậc sau đó không làm thay đổi giao dịch cũ.',
          'The rate applied to a job is fixed when its payment is recorded; a later level change does not alter past transactions.',
        )}
      </Text>
    </View>
  )
}
