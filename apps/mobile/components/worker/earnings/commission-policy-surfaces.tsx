import { Text as RNText, View, type TextProps } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'
import type { EarningsResponse } from '@/lib/api-types'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { textByLanguage } from '../ui/format'
import { styles } from './commission-policy-styles'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

function commissionRates(rateBps: number | null | undefined) {
  if (typeof rateBps !== 'number' || !Number.isFinite(rateBps)) return null
  return { fee: `${rateBps / 100}%`, kept: `${(10000 - rateBps) / 100}%` }
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
  const rates = commissionRates(earnings?.current_commission_rate_bps)

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
          <Text style={styles.eyebrow}>{textByLanguage(language, 'PHÍ NỀN TẢNG', 'PLATFORM FEE')}</Text>
          <Text style={styles.rateValue}>
            {rates?.fee ?? textByLanguage(language, 'Đang cập nhật', 'Updating')}
          </Text>
          <Text style={styles.rateMeta}>
            {textByLanguage(language, 'Cố định cho mọi công việc', 'Fixed for every job')}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>{textByLanguage(language, 'Phí nền tảng dùng để làm gì?', 'What does the platform fee pay for?')}</Text>
      <Text style={styles.paragraph}>
        {rates
          ? textByLanguage(
            language,
            `Phí được tính trên giá công việc đã chốt. ${rates.kept} còn lại thuộc về thợ. NestScout dùng phần ${rates.fee} để duy trì những việc cần thiết giúp mỗi công việc diễn ra rõ ràng và an toàn hơn.`,
            `The fee is calculated from the confirmed job price. The remaining ${rates.kept} belongs to the worker. NestScout uses the ${rates.fee} to keep each job clear and safer.`,
          )
          : textByLanguage(
            language,
            'Phí được tính trên giá công việc đã chốt; phần còn lại thuộc về thợ.',
            'The fee is calculated from the confirmed job price; the rest belongs to the worker.',
          )}
      </Text>
      <View style={styles.pointList}>
        <PolicyPoint>{textByLanguage(language, 'Tìm và kết nối khách có nhu cầu phù hợp với kỹ năng của thợ.', 'Find customers whose needs match the worker’s skills.')}</PolicyPoint>
        <PolicyPoint>{textByLanguage(language, 'Ghi nhận giá đã chốt, khoản thu và quá trình đối soát của từng công việc.', 'Record the confirmed price, earnings, and reconciliation for each job.')}</PolicyPoint>
        <PolicyPoint>{textByLanguage(language, 'Duy trì ứng dụng và hỗ trợ khi thợ hoặc khách cần giải quyết vấn đề.', 'Maintain the app and provide help when workers or customers need support.')}</PolicyPoint>
      </View>

      <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>{textByLanguage(language, 'Thưởng thay cho giảm phí', 'Rewards instead of fee cuts')}</Text>
        <Text style={styles.progressCopy}>
          {textByLanguage(
            language,
            'Phí nền tảng không đổi theo bậc hay số việc. Thay vào đó, NestScout thưởng theo mốc khi khách bạn mang về tiếp tục đặt và thanh toán dịch vụ trong app.',
            'The platform fee does not change with level or job count. Instead, NestScout pays milestone rewards when customers you bring in keep booking and paying in the app.',
          )}
        </Text>
      </View>
      <Text style={styles.footnote}>
        {textByLanguage(
          language,
          'Mức phí của mỗi công việc được ghi lại lúc khoản thanh toán được ghi nhận và không thay đổi về sau.',
          'The fee for each job is recorded when its payment is recorded and does not change afterwards.',
        )}
      </Text>
    </View>
  )
}
