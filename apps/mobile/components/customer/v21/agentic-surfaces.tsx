import { Text, View } from 'react-native'

import { useAppLanguage } from '@/lib/app-language'
import { CaseWideMintAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets } from './assets'
import { customerV21AgenticStyles as styles } from './agentic-styles'
import { CaseWorkSourceChip } from './history-active-surfaces'
import { PaymentLedgerStep } from './payment-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'
import { AssetTile, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'

function agenticScope(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, '')
}

export function AgenticChatFact({ centered = false, label, value }: { centered?: boolean; label: string; value: string }) {
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <View style={[styles.agenticChatFact, centered && styles.agenticChatFactCentered, { backgroundColor: tokens.service, borderColor: tokens.borderStrong }]}>
      <ZipMintAura scope={`ChatFact${agenticScope(label)}`} />
      <Text numberOfLines={1} style={[styles.agenticChatFactLabel, centered && sharedStyles.centerText, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.agenticChatFactValue, centered && sharedStyles.centerText, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

export function AgenticCasePaymentCardPanel({
  amount,
  caseCode,
  ledgerMethod,
  method,
  platformFee,
  protectedPayment,
  service,
  status,
  workerNet,
}: {
  amount: string
  caseCode: string
  ledgerMethod: string
  method: string
  platformFee: string
  protectedPayment: boolean
  service: string
  status: string
  workerNet: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  return (
    <V21Card
      style={[styles.agenticChatCard, { backgroundColor: tokens.raised, borderColor: 'rgba(116,224,209,0.56)' }]}
      testID="customer-v21-case-payment-card"
    >
      <SourceCardSkin />
      <CaseWideMintAura scope="CasePaymentChat" testID="customer-v21-case-payment-card-mint-aura" />
      <ZipMintAura scope="CasePaymentChatFine" testID="customer-v21-case-payment-card-zip-mint-aura" />
      <View style={styles.agenticChatHeader}>
        <AssetTile image={customerV21Assets.payment} label={language === 'vi' ? 'Thanh toán' : 'Payment'} size={44} sourceAura style={styles.agenticChatIcon} />
        <View style={sharedStyles.flex}>
          <Text numberOfLines={2} style={[styles.agenticChatTitle, { color: tokens.text }]}>
            {language === 'vi' ? 'Kael bảo vệ khoản thanh toán' : 'Kael protects the payment'}
          </Text>
          <Text numberOfLines={2} style={[styles.agenticChatBody, { color: tokens.muted }]}>
            {`${service} · ${caseCode}`}
          </Text>
        </View>
        <CaseWorkSourceChip label={status} scope="CasePaymentStatus" />
      </View>

      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Số tiền' : 'Amount'} value={amount} />
        <AgenticChatFact label={language === 'vi' ? 'Kênh' : 'Method'} value={method} />
      </View>
      <View style={styles.agenticChatFactGrid}>
        <AgenticChatFact label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'} value={platformFee} />
        <AgenticChatFact label={language === 'vi' ? 'Thợ nhận' : 'Worker net'} value={workerNet} />
      </View>

      <View style={[styles.agenticPaymentLedger, { backgroundColor: tokens.service, borderColor: tokens.border }]} testID="customer-v21-case-payment-ledger">
        <PaymentLedgerStep
          body={ledgerMethod}
          state="done"
          tokens={tokens}
          title={language === 'vi' ? 'Lệnh thanh toán thật' : 'Real payment order'}
        />
        <PaymentLedgerStep
          body={protectedPayment ? (language === 'vi' ? 'Đang giữ an toàn trong hệ thống' : 'Held safely in the system') : status}
          state={protectedPayment ? 'active' : 'pending'}
          tokens={tokens}
          title={language === 'vi' ? 'Bảo vệ tiền' : 'Money protection'}
        />
        <PaymentLedgerStep
          body={language === 'vi' ? 'Chỉ mở sau khi công việc hoàn tất đúng quy trình' : 'Opens only after the job completes properly'}
          state="pending"
          tokens={tokens}
          title={language === 'vi' ? 'Giải ngân' : 'Payout'}
        />
      </View>

      <Text numberOfLines={2} style={[styles.agenticChatNote, { color: tokens.muted }]}>
        {language === 'vi'
          ? 'Kael chỉ theo dõi khoản tiền từ payment order thật. Không thanh toán ngoài nền tảng.'
          : 'Kael only tracks money from a real payment order. Do not pay off-platform.'}
      </Text>
    </V21Card>
  )
}
