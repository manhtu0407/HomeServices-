import type { ComponentType, ReactNode } from 'react'
import { Image, Pressable, Text, View, type ImageSourcePropType } from 'react-native'

import { KaelButton } from '@/components/ui/kael-primitives'
import { useAppLanguage } from '@/lib/app-language'

import type { CustomerThemeTokens } from '../customer-theme'
import { CaseWideMintAura, CaseWorkActionButtonAura, SourceCardSkin, ZipMintAura } from './aura-surfaces'
import { customerV21Assets, customerV21BankAssets, type CustomerV21BankKey } from './assets'
import { customerV21BookingStyles as bookingStyles } from './booking-styles'
import { customerV21CommonCopy } from './copy'
import { paymentLedgerConfirmationStep } from './case-work-money-display-model'
import { customerV21HistoryActiveStyles as historyActiveStyles } from './history-active-styles'
import { CaseSuccessEmblem } from './history-surfaces'
import { customerV21PaymentStyles as styles } from './payment-styles'
import { AssetTile, MatchingHandoffChip, SectionActionHeader, useCustomerV21SurfaceTheme, V21Card } from './shared-surfaces'
import { customerV21SharedStyles as sharedStyles } from './shared-styles'

type CustomerV21PaymentBank = { key: CustomerV21BankKey; name: string; vietQrCode: string }
type CustomerV21SourceSkin = ComponentType<{ testID?: string }>
type CustomerV21ZipAura = ComponentType<{ intensity?: 'default' | 'strong'; scope: string; testID?: string }>
type FulfillmentStepState = 'active' | 'done' | 'pending'

export function PaymentPriceLine({
  label,
  tokens,
  value,
}: {
  label: string
  tokens: CustomerThemeTokens
  value: string
}) {
  return (
    <View style={[styles.paymentPriceLine, { borderBottomColor: tokens.border }]}>
      <Text numberOfLines={1} style={[styles.paymentPriceLabel, { color: tokens.muted }]}>{label}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentPriceValue, { color: tokens.text }]}>{value}</Text>
    </View>
  )
}

export function PaymentHeroMethodIcon({
  bank,
  sourceCardSkin: SourceCardSkin,
  zipMintAura: ZipMintAura,
}: {
  bank: CustomerV21PaymentBank | null
  sourceCardSkin: CustomerV21SourceSkin
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={styles.paymentMethodHeroIconFrame} testID="customer-v21-payment-method-hero-icon">
      <SourceCardSkin />
      <ZipMintAura scope="PaymentMethodHeroIcon" testID="customer-v21-payment-method-hero-icon-mint-aura" />
      {bank ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={customerV21BankAssets[bank.key]}
          style={styles.paymentMethodHeroBankLogo}
          testID={`customer-v21-payment-method-hero-bank-logo-${bank.key}`}
        />
      ) : (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={customerV21Assets.wallet}
          style={styles.paymentMethodHeroWalletImage}
          testID="customer-v21-payment-method-hero-wallet-icon"
        />
      )}
    </View>
  )
}

export function PaymentBankTile({
  bank,
  disabled,
  onPress,
  selected,
  showMintAura = false,
  sourceCardSkin: SourceCardSkin,
  zipMintAura: ZipMintAura,
}: {
  bank: CustomerV21PaymentBank
  disabled: boolean
  onPress: () => void
  selected: boolean
  showMintAura?: boolean
  sourceCardSkin: CustomerV21SourceSkin
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <Pressable
      accessibilityLabel={`${bank.name} VietQR`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.paymentBankTile,
        selected ? styles.paymentBankTileSelected : null,
        disabled ? styles.paymentBankTileDisabled : null,
        pressed ? styles.pressed : null,
      ]}
      testID={`customer-v21-payment-bank-tile-${bank.key}`}
    >
      <SourceCardSkin />
      {selected || showMintAura ? <ZipMintAura intensity={showMintAura ? 'strong' : 'default'} scope={`PaymentBankTile${bank.key}`} testID={`customer-v21-payment-bank-tile-${bank.key}-mint-aura`} /> : null}
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        source={customerV21BankAssets[bank.key]}
        style={styles.paymentBankLogo}
        testID={`customer-v21-payment-bank-logo-${bank.key}`}
      />
      {selected ? (
        <View style={styles.paymentBankCheck}>
          <Text style={styles.paymentBankCheckText}>✓</Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export function PaymentMethodIconFrame({
  image,
  label,
  sourceCardSkin: SourceCardSkin,
  testID,
  zipMintAura: ZipMintAura,
}: {
  image: ImageSourcePropType
  label: string
  sourceCardSkin: CustomerV21SourceSkin
  testID: string
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={styles.paymentMethodRowIcon}>
      <SourceCardSkin />
      <ZipMintAura scope={label.replace(/[^a-zA-Z0-9]/g, '')} />
      <Image
        accessibilityIgnoresInvertColors
        accessibilityLabel={label}
        resizeMode="contain"
        source={image}
        style={styles.paymentMethodAssetIcon}
        testID={testID}
      />
    </View>
  )
}

export function PaymentMethodRow({
  image,
  imageTestID,
  label,
  sourceCardSkin,
  tokens,
  value,
  zipMintAura,
}: {
  image: ImageSourcePropType
  imageTestID: string
  label: string
  sourceCardSkin: CustomerV21SourceSkin
  tokens: CustomerThemeTokens
  value: string
  zipMintAura: CustomerV21ZipAura
}) {
  return (
    <View style={styles.paymentMethodRow}>
      <PaymentMethodIconFrame image={image} label={label} sourceCardSkin={sourceCardSkin} testID={imageTestID} zipMintAura={zipMintAura} />
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: tokens.muted }]}>{value}</Text>
      </View>
      <Text style={[styles.chevronText, { color: tokens.primary }]}>›</Text>
    </View>
  )
}

export function PaymentMethodStagePanel({
  amount,
  disabled,
  method,
  onNext,
  onSelectBank,
  paymentReady,
  recommendedBody,
  recommendedTitle,
  selectedBank,
  selectedBankKey,
  status,
  visibleBanks,
}: {
  amount: string
  disabled: boolean
  method: string
  onNext: () => void
  onSelectBank: (key: CustomerV21BankKey) => void
  paymentReady: boolean
  recommendedBody: string
  recommendedTitle: string
  selectedBank: CustomerV21PaymentBank | null
  selectedBankKey: CustomerV21BankKey | null
  status: string
  visibleBanks: CustomerV21PaymentBank[]
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  const copy = customerV21CommonCopy[language]

  return (
    <>
      <V21Card glass style={styles.paymentMethodHeroCard} testID="customer-v21-payment-method-total">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodTotal" testID="customer-v21-payment-method-total-mint-aura" />
        <ZipMintAura scope="PaymentMethodTotalBackground" testID="customer-v21-payment-method-total-bg-mint-aura" />
        <View style={styles.paymentMethodHeroContent}>
          <View style={styles.paymentMethodHeroTextColumn}>
            <Text style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Số tiền cần thanh toán' : 'Amount due'}</Text>
            <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentMethodAmount, { color: tokens.primary }]}>{amount}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Lệnh thanh toán được bảo vệ theo công việc thật.' : 'Payment order is protected by the real job.'}</Text>
          </View>
          <PaymentHeroMethodIcon bank={selectedBank} sourceCardSkin={SourceCardSkin} zipMintAura={ZipMintAura} />
        </View>
      </V21Card>

      <SectionActionHeader title={language === 'vi' ? 'Ngân hàng khuyên dùng' : 'Recommended bank'} />
      <V21Card style={styles.paymentBankRecommendedCard} testID="customer-v21-payment-method-selected">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodSelected" testID="customer-v21-payment-method-selected-mint-aura" />
        <ZipMintAura scope="PaymentMethodRecommended" testID="customer-v21-payment-method-recommended-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <View style={styles.paymentBankRecommendedLogoBox}>
            {selectedBank ? (
              <Image
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                source={customerV21BankAssets[selectedBank.key]}
                style={styles.paymentBankRecommendedLogo}
                testID={`customer-v21-payment-bank-recommended-logo-${selectedBank.key}`}
              />
            ) : (
              <View style={styles.paymentBankRecommendedFallbackIcon} testID="customer-v21-payment-bank-recommended-wallet-icon">
                <SourceCardSkin />
                <Image accessibilityIgnoresInvertColors resizeMode="contain" source={customerV21Assets.wallet} style={styles.paymentMethodHeroWalletImage} />
              </View>
            )}
          </View>
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{recommendedTitle}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{recommendedBody}</Text>
          </View>
          <MatchingHandoffChip label={selectedBank ? (language === 'vi' ? 'Đã chọn' : 'Selected') : copy.dataPending} style={styles.paymentMethodRightChip} tone={selectedBank ? 'success' : 'selected'} />
        </View>
      </V21Card>

      <SectionActionHeader action={language === 'vi' ? '6 ngân hàng' : '6 banks'} title={language === 'vi' ? 'Chọn ngân hàng Việt Nam' : 'Choose a Vietnamese bank'} />
      <View style={styles.paymentBankGrid} testID="customer-v21-payment-method-grid">
        <CaseWideMintAura scope="PaymentBankGrid" testID="customer-v21-payment-bank-grid-wide-mint-aura" />
        <ZipMintAura scope="PaymentBankGrid" testID="customer-v21-payment-bank-grid-mint-aura" />
        {visibleBanks.map((bank) => (
          <PaymentBankTile
            bank={bank}
            disabled={false}
            key={bank.key}
            onPress={() => onSelectBank(bank.key)}
            selected={bank.key === selectedBankKey}
            sourceCardSkin={SourceCardSkin}
            zipMintAura={ZipMintAura}
          />
        ))}
      </View>

      <SectionActionHeader action={language === 'vi' ? '2 lựa chọn' : '2 options'} title={language === 'vi' ? 'Phương thức khác' : 'Other methods'} />
      <V21Card style={styles.paymentMethodOtherCard} testID="customer-v21-payment-method-other">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodOther" testID="customer-v21-payment-method-other-mint-aura" />
        <PaymentMethodRow image={customerV21Assets.paymentCard} imageTestID="customer-v21-payment-card-method-image" label={language === 'vi' ? 'Thẻ nội địa / quốc tế' : 'Domestic / international card'} sourceCardSkin={SourceCardSkin} tokens={tokens} value={paymentReady ? (language === 'vi' ? 'Visa, Mastercard, JCB và ATM nội địa' : 'Visa, Mastercard, JCB and domestic ATM') : copy.dataPending} zipMintAura={ZipMintAura} />
        <View style={[historyActiveStyles.fulfillmentDivider, { backgroundColor: tokens.border }]} />
        <PaymentMethodRow image={customerV21Assets.paymentBankTransfer} imageTestID="customer-v21-payment-transfer-method-image" label={language === 'vi' ? 'Chuyển khoản ngân hàng' : 'Bank transfer'} sourceCardSkin={SourceCardSkin} tokens={tokens} value={paymentReady ? `${method} · ${status}` : copy.dataPending} zipMintAura={ZipMintAura} />
      </V21Card>

      <V21Card style={styles.paymentSafetyCard} testID="customer-v21-payment-method-safety">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentMethodSafety" testID="customer-v21-payment-method-safety-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <PaymentMethodIconFrame image={customerV21Assets.shield} label={language === 'vi' ? 'An toàn' : 'Safety'} sourceCardSkin={SourceCardSkin} testID="customer-v21-payment-method-safety-icon-image" zipMintAura={ZipMintAura} />
          <View style={styles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Tiền của bạn được giữ an toàn' : 'Your money stays protected'}</Text>
            <Text numberOfLines={2} style={[styles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Chỉ giải ngân sau khi công việc và ledger đúng trạng thái.' : 'Release only happens after the job and ledger reach the right state.'}</Text>
          </View>
        </View>
      </V21Card>

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="PaymentMethodContinue" />}
        disabled={disabled}
        label={disabled ? copy.paymentLocked : (language === 'vi' ? 'Tiếp tục thanh toán' : 'Continue payment')}
        onPress={onNext}
        style={historyActiveStyles.casePrimaryStageButton}
        testID="customer-v21-payment-method-next"
      />
    </>
  )
}

export function PaymentLedgerStep({
  body,
  state,
  title,
  tokens,
}: {
  body: string
  state: FulfillmentStepState
  title: string
  tokens: CustomerThemeTokens
}) {
  const done = state === 'done'
  const active = state === 'active'
  const highlighted = done || active
  return (
    <View style={styles.paymentLedgerStep}>
      <View style={[styles.paymentLedgerRail, { backgroundColor: highlighted ? tokens.primary : tokens.border }]} />
      <View
        style={[
          styles.paymentLedgerDot,
          {
            backgroundColor: active ? tokens.primary : done ? '#F4FFFC' : tokens.raised,
            borderColor: highlighted ? tokens.primary : tokens.border,
          },
        ]}
      >
        {active ? <View pointerEvents="none" style={styles.paymentLedgerDotAura} /> : null}
        <Text style={[styles.paymentLedgerDotText, { color: active ? '#FFFFFF' : highlighted ? tokens.primary : tokens.muted }]}>{done ? '✓' : active ? '•' : ''}</Text>
      </View>
      <View style={styles.flex}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: tokens.text }]}>{title}</Text>
        <Text numberOfLines={1} style={[styles.bodyText, { color: active ? tokens.primary : tokens.muted }]}>{body}</Text>
      </View>
    </View>
  )
}

export function PaymentReviewStagePanel({
  address,
  amount,
  caseCode,
  disabled,
  kaelSourceCard,
  method,
  onNext,
  platformFee,
  service,
  serviceAsset,
  serviceDetail,
  status,
  time,
  workerAvatar,
  workerMeta,
  workerName,
  workerNet,
}: {
  address: string
  amount: string
  caseCode: string
  disabled: boolean
  kaelSourceCard: ReactNode
  method: string
  onNext: () => void
  platformFee: string
  service: string
  serviceAsset: ImageSourcePropType
  serviceDetail: string
  status: string
  time: string
  workerAvatar: ReactNode
  workerMeta: string
  workerName: string
  workerNet: string
}) {
  const language = useAppLanguage()
  const { tokens } = useCustomerV21SurfaceTheme()
  const copy = customerV21CommonCopy[language]
  return (
    <>
      <V21Card style={styles.paymentReviewCaseCard} testID="customer-v21-payment-review-case">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentReviewCase" testID="customer-v21-payment-review-case-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <View style={styles.paymentReviewLeadingCell}>
            <AssetTile image={serviceAsset} label={service} size={42} sourceAura style={styles.paymentReviewServiceIcon} />
          </View>
          <View style={styles.paymentReviewTextColumn}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{service}</Text>
            <Text numberOfLines={2} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{caseCode} · {serviceDetail}</Text>
          </View>
          <MatchingHandoffChip label={disabled ? copy.dataPending : (language === 'vi' ? 'Đã khóa giá' : 'Price locked')} tone={disabled ? 'selected' : 'success'} />
        </View>
        <View style={[historyActiveStyles.fulfillmentDivider, { backgroundColor: tokens.border }]} />
        <View style={styles.paymentReviewRow}>
          <View style={styles.paymentReviewLeadingCell}>
            {workerAvatar}
          </View>
          <View style={styles.paymentReviewTextColumn}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{workerName}</Text>
            <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{workerMeta}</Text>
          </View>
        </View>
        <View style={styles.paymentReviewMetaRow}>
          <Text numberOfLines={1} style={[sharedStyles.bodyText, styles.paymentReviewMetaText, { color: tokens.muted }]}>{time}</Text>
          <Text numberOfLines={1} style={[sharedStyles.bodyText, styles.paymentReviewMetaTextRight, { color: tokens.muted }]}>{address}</Text>
        </View>
      </V21Card>

      <SectionActionHeader action={disabled ? copy.dataPending : (language === 'vi' ? 'Đã khóa giá' : 'Locked')} title={language === 'vi' ? 'Chi tiết thanh toán' : 'Payment details'} />
      <V21Card style={styles.paymentPriceCard} testID="customer-v21-payment-review-details">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentReviewDetails" testID="customer-v21-payment-review-details-mint-aura" />
        <PaymentPriceLine label={language === 'vi' ? 'Số tiền hệ thống' : 'System amount'} tokens={tokens} value={amount} />
        <PaymentPriceLine label={language === 'vi' ? 'Phí nền tảng' : 'Platform fee'} tokens={tokens} value={platformFee} />
        <PaymentPriceLine label={language === 'vi' ? 'Phương thức' : 'Method'} tokens={tokens} value={method} />
        <PaymentPriceLine label={language === 'vi' ? 'Trạng thái' : 'Status'} tokens={tokens} value={status} />
        <View style={[styles.paymentTotalLine, { borderTopColor: tokens.border }]}>
          <Text style={[styles.paymentTotalLabel, { color: tokens.text }]}>{language === 'vi' ? 'Tổng thanh toán' : 'Total'}</Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentTotalValue, { color: tokens.primary }]}>{amount}</Text>
        </View>
        <View style={styles.paymentWorkerNetPill}>
          <Text style={[styles.paymentWorkerNetLabel, { color: tokens.text }]}>{language === 'vi' ? 'Thợ nhận dự kiến' : 'Worker net'}</Text>
          <Text style={[styles.paymentWorkerNetValue, { color: tokens.primary }]}>{workerNet}</Text>
        </View>
      </V21Card>

      {kaelSourceCard}

      <V21Card style={styles.paymentSafetyCard} testID="customer-v21-payment-review-safety">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentReviewSafetyWide" testID="customer-v21-payment-review-safety-wide-mint-aura" />
        <ZipMintAura scope="PaymentReviewSafety" testID="customer-v21-payment-review-safety-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <AssetTile image={customerV21Assets.shield} label={language === 'vi' ? 'An toàn' : 'Safety'} size={34} sourceAura style={styles.paymentSafetyIcon} />
          <View style={sharedStyles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{language === 'vi' ? 'Giữ an toàn đến khi hoàn tất.' : 'Safe until completion.'}</Text>
            <Text numberOfLines={2} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{language === 'vi' ? 'Release, hoàn tiền hoặc tranh chấp cần đúng thẩm quyền.' : 'Release, refund, or dispute requires the right authority.'}</Text>
          </View>
        </View>
      </V21Card>

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="PaymentReviewPay" />}
        disabled={disabled}
        label={disabled ? copy.paymentLocked : (language === 'vi' ? 'Thanh toán an toàn' : 'Safe payment')}
        onPress={onNext}
        style={historyActiveStyles.casePrimaryStageButton}
        testID="customer-v21-payment-review-next"
      />
    </>
  )
}

export function PaymentProtectedStagePanel({
  amount,
  caseCode,
  completionBody,
  hasPayment,
  kaelSourceCard,
  onNext,
  paymentConfirmedBody,
  payoutBody,
  protectedBody,
  protectedPayment,
  service,
  serviceAsset,
  time,
  workerName,
}: {
  amount: string
  caseCode: string
  completionBody: string
  hasPayment: boolean
  kaelSourceCard: ReactNode
  onNext: () => void
  paymentConfirmedBody: string
  payoutBody: string
  protectedBody: string
  protectedPayment: boolean
  service: string
  serviceAsset: ImageSourcePropType
  time: string
  workerName: string
}) {
  const language = useAppLanguage()
  const { reduceTransparency, tokens } = useCustomerV21SurfaceTheme()
  const copy = customerV21CommonCopy[language]
  const paymentConfirmation = paymentLedgerConfirmationStep(protectedPayment, language)
  return (
    <>
      <V21Card glass style={styles.paymentProtectedHeroCard} testID="customer-v21-payment-protected-hero">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentProtectedHero" testID="customer-v21-payment-protected-hero-mint-aura" />
        <ZipMintAura scope="PaymentProtectedHeroFine" testID="customer-v21-payment-protected-hero-zip-mint-aura" />
        <CaseSuccessEmblem done={protectedPayment} reduceTransparency={reduceTransparency} tokens={tokens} />
        <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentProtectedTitle, { color: tokens.text }]}>
          {protectedPayment
            ? (language === 'vi' ? 'Thanh toán thành công!' : 'Payment successful!')
            : (language === 'vi' ? 'Chờ thanh toán' : 'Payment pending')}
        </Text>
        <Text numberOfLines={2} style={[sharedStyles.bodyText, sharedStyles.centerText, { color: tokens.muted }]}>
          {protectedPayment
            ? (language === 'vi' ? `${amount} đang được giữ an toàn trong hệ thống.` : `${amount} is protected in the system.`)
            : copy.paymentLocked}
        </Text>
        <MatchingHandoffChip label={protectedPayment ? (language === 'vi' ? 'Được bảo vệ' : 'Protected') : copy.dataPending} style={styles.paymentProtectedChip} tone={protectedPayment ? 'success' : 'selected'} />
      </V21Card>

      <V21Card style={styles.paymentProtectedServiceCard} testID="customer-v21-payment-protected-service">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentProtectedService" testID="customer-v21-payment-protected-service-mint-aura" />
        <ZipMintAura scope="PaymentProtectedServiceFine" testID="customer-v21-payment-protected-service-zip-mint-aura" />
        <View style={styles.paymentReviewRow}>
          <AssetTile image={serviceAsset} label={service} size={42} sourceAura style={styles.paymentReviewServiceIcon} />
          <View style={sharedStyles.flex}>
            <Text numberOfLines={1} style={[sharedStyles.cardTitle, { color: tokens.text }]}>{service}</Text>
            <Text numberOfLines={1} style={[sharedStyles.bodyText, { color: tokens.muted }]}>{workerName} · {time}</Text>
          </View>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={[styles.paymentProtectedAmount, { color: tokens.primary }]}>{amount}</Text>
        </View>
      </V21Card>

      <SectionActionHeader action={hasPayment ? (language === 'vi' ? 'Sổ cái ›' : 'Ledger ›') : copy.dataPending} title={language === 'vi' ? 'Trạng thái khoản tiền' : 'Money status'} />
      <V21Card style={styles.paymentLedgerCard} testID="customer-v21-payment-protected-ledger">
        <SourceCardSkin />
        <CaseWideMintAura scope="PaymentProtectedLedger" testID="customer-v21-payment-protected-ledger-mint-aura" />
        <ZipMintAura scope="PaymentProtectedLedgerFine" testID="customer-v21-payment-protected-ledger-zip-mint-aura" />
        <PaymentLedgerStep body={paymentConfirmedBody} state={paymentConfirmation.state} tokens={tokens} title={paymentConfirmation.title} />
        <PaymentLedgerStep body={protectedBody} state={protectedPayment ? 'active' : 'pending'} tokens={tokens} title={protectedPayment ? (language === 'vi' ? 'Đang giữ an toàn' : 'Held safely') : (language === 'vi' ? 'Đối soát' : 'Reconciliation')} />
        <PaymentLedgerStep body={completionBody} state="pending" tokens={tokens} title={language === 'vi' ? 'Chờ hoàn tất công việc' : 'Waiting for completion'} />
        <PaymentLedgerStep body={payoutBody} state="pending" tokens={tokens} title={language === 'vi' ? 'Giải ngân vào ví thợ' : 'Worker payout'} />
      </V21Card>

      {kaelSourceCard}

      <KaelButton
        backgroundLayer={<CaseWorkActionButtonAura scope="PaymentProtectedTrack" />}
        label={language === 'vi' ? 'Theo dõi đơn hàng' : 'Track job'}
        onPress={onNext}
        style={historyActiveStyles.casePrimaryStageButton}
        testID="customer-v21-payment-protected-track"
      />
      <Text numberOfLines={1} style={[bookingStyles.mediaMicroNote, { color: tokens.muted }]}>{caseCode}</Text>
    </>
  )
}
