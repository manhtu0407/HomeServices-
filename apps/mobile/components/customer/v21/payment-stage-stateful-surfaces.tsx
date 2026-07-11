import { Text, View, type ImageSourcePropType } from 'react-native'

import type { AppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, CaseWorkCardAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets, type CustomerV21Visual } from './assets'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { CaseWorkerAvatar } from './history-surfaces'
import { customerV21PaymentStyles as paymentStyles } from './payment-styles'
import { PaymentProtectedStagePanel, PaymentReviewStagePanel } from './payment-surfaces'
import { AssetTile, V21Card } from './shared-surfaces'

function PaymentKaelSourceCard({
  body,
  image,
  testID,
  title,
  tokens,
}: {
  body: string
  image: CustomerV21Visual
  testID: string
  title: string
  tokens: CustomerThemeTokens
}) {
  const auraScope = testID.replace(/[^a-zA-Z0-9]/g, '')
  const usesPaymentProtectedAura = testID === 'customer-v21-payment-protected-kael-card'
  return (
    <V21Card style={[historyActiveStyles.caseKaelSourceCard, usesPaymentProtectedAura ? historyActiveStyles.caseKaelPaymentAuraCard : null]} testID={testID}>
      <SourceCardSkin />
      {usesPaymentProtectedAura ? <CaseWorkCardAura scope={`${auraScope}PaymentProtected`} testID={`${testID}-card-mint-aura`} /> : null}
      <CaseWideMintAura scope={auraScope} testID={`${testID}-wide-mint-aura`} />
      <ZipMintAura scope={auraScope} testID={`${testID}-mint-aura`} />
      <View style={historyActiveStyles.caseKaelSourceContent}>
        <AssetTile image={image} label="Kael" size={38} sourceAura style={historyActiveStyles.caseKaelSourceIcon} />
        <View style={paymentStyles.flex}>
          <Text numberOfLines={1} style={[historyActiveStyles.caseKaelSourceTitle, { color: tokens.text }]}>{title}</Text>
          <Text numberOfLines={2} style={[historyActiveStyles.caseKaelSourceBody, { color: tokens.muted }]}>{body}</Text>
        </View>
        <Text style={[paymentStyles.chevronText, { color: tokens.primary }]}>›</Text>
      </View>
    </V21Card>
  )
}

export function PaymentReviewStageView({
  address,
  amount,
  caseCode,
  disabled,
  language,
  method,
  onNext,
  platformFee,
  service,
  serviceAsset,
  serviceDetail,
  status,
  time,
  tokens,
  workerInitials,
  workerMeta,
  workerName,
  workerNet,
}: {
  address: string
  amount: string
  caseCode: string
  disabled: boolean
  language: AppLanguage
  method: string
  onNext: () => void
  platformFee: string
  service: string
  serviceAsset: ImageSourcePropType
  serviceDetail: string
  status: string
  time: string
  tokens: CustomerThemeTokens
  workerInitials: string
  workerMeta: string
  workerName: string
  workerNet: string
}) {
  return (
    <PaymentReviewStagePanel
      address={address}
      amount={amount}
      caseCode={caseCode}
      disabled={disabled}
      kaelSourceCard={(
        <PaymentKaelSourceCard
          body={language === 'vi' ? 'Tiền chỉ đi qua payment order thật và sổ cái nội bộ.' : 'Money only moves through a real payment order and ledger.'}
          image={customerV21Assets.kael}
          testID="customer-v21-payment-review-kael-card"
          title={language === 'vi' ? 'Bảo vệ thanh toán cùng Kael' : 'Payment protection with Kael'}
          tokens={tokens}
        />
      )}
      method={method}
      onNext={onNext}
      platformFee={platformFee}
      service={service}
      serviceAsset={serviceAsset}
      serviceDetail={serviceDetail}
      status={status}
      time={time}
      workerAvatar={<CaseWorkerAvatar initials={workerInitials} tokens={tokens} uri={null} />}
      workerMeta={workerMeta}
      workerName={workerName}
      workerNet={workerNet}
    />
  )
}

export function PaymentProtectedStageView({
  amount,
  caseCode,
  completionBody,
  hasPayment,
  language,
  onNext,
  paymentConfirmedBody,
  payoutBody,
  protectedBody,
  protectedPayment,
  service,
  serviceAsset,
  time,
  tokens,
  workerName,
}: {
  amount: string
  caseCode: string
  completionBody: string
  hasPayment: boolean
  language: AppLanguage
  onNext: () => void
  paymentConfirmedBody: string
  payoutBody: string
  protectedBody: string
  protectedPayment: boolean
  service: string
  serviceAsset: ImageSourcePropType
  time: string
  tokens: CustomerThemeTokens
  workerName: string
}) {
  return (
    <PaymentProtectedStagePanel
      amount={amount}
      caseCode={caseCode}
      completionBody={completionBody}
      hasPayment={hasPayment}
      kaelSourceCard={(
        <PaymentKaelSourceCard
          body={language === 'vi' ? 'Không thanh toán ngoài nền tảng. Tôi sẽ theo dõi trạng thái tiền cùng công việc.' : 'Do not pay off-platform. I will follow money state with the job.'}
          image={customerV21Assets.kael}
          testID="customer-v21-payment-protected-kael-card"
          title={language === 'vi' ? 'Kael nhắc bạn' : 'Kael reminder'}
          tokens={tokens}
        />
      )}
      onNext={onNext}
      paymentConfirmedBody={paymentConfirmedBody}
      payoutBody={payoutBody}
      protectedBody={protectedBody}
      protectedPayment={protectedPayment}
      service={service}
      serviceAsset={serviceAsset}
      time={time}
      workerName={workerName}
    />
  )
}
