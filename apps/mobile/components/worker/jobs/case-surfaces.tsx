import type { ComponentType } from 'react'
import {
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import type { AppLanguage } from '@/lib/app-language'

import { WorkerV5FormulaMintCardAura } from '../ui/aura-surfaces'
import { formatVnd, textByLanguage } from '../ui/format'
import { WorkerV5IntegratedIcon } from '../ui/integrated-icon-surfaces'
import {
  WorkerV5PremiumStatusPill,
  WorkerV5PremiumStatusSeal,
} from '../ui/metrics-surfaces'
import { WorkerV5DetailRail } from '../ui/worker-v5-detail-rail'
import { styles } from './case-styles'

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

export type WorkerV5CaseClosedHeroState = 'settled' | 'cash_recorded' | 'waiting'

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5CaseClosedHero({
  deal,
  language,
  reduceTransparency,
  state,
  workerNet,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  state: WorkerV5CaseClosedHeroState
  workerNet: number | null
}) {
  const hasIncome = Boolean(workerNet && workerNet > 0)
  const isSettled = state === 'settled'
  const cashRecorded = state === 'cash_recorded'
  const status = cashRecorded
    ? textByLanguage(language, 'Đã ghi nhận tiền mặt', 'Cash payment recorded')
    : isSettled
    ? textByLanguage(language, 'Đã đối soát', 'Settlement complete')
    : textByLanguage(language, 'Chờ đối soát', 'Waiting settlement')
  const closed = isSettled || deal?.status === 'confirmed_by_customer' || deal?.status === 'payment_pending' || deal?.status === 'paid' || deal?.status === 'reviewed'
  return (
    <View style={[styles.caseClosedHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-case-closed-hero">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="CaseClosedHero"
        testID="worker-v5-case-closed-mint-aura"
      />
      <WorkerV5PremiumStatusSeal
        accessibilityLabel={closed ? textByLanguage(language, 'Hoàn tất công việc', 'Work completed') : textByLanguage(language, 'Chưa hoàn tất công việc', 'Work not completed')}
        artTestID="worker-v5-case-closed-settlement-seal-art"
        reduceTransparency={reduceTransparency}
        size="large"
        testID="worker-v5-case-closed-settlement-seal"
      />
      <Text style={styles.caseClosedTitle} numberOfLines={2} testID="worker-v5-case-closed-title">{closed ? textByLanguage(language, 'Hoàn tất công việc', 'Work completed') : textByLanguage(language, 'Chưa hoàn tất công việc', 'Work not completed')}</Text>
      <WorkerV5PremiumStatusPill
        label={status}
        mark={isSettled || cashRecorded ? 'check' : 'dot'}
        markTestID="worker-v5-case-closed-settlement-status-dot"
        reduceTransparency={reduceTransparency}
        testID="worker-v5-case-closed-settlement-status"
        textTestID="worker-v5-case-closed-status"
      />
      {hasIncome ? (
        <>
          <Text style={styles.caseClosedAmount} numberOfLines={1} testID="worker-v5-case-closed-amount">
            {formatVnd(workerNet ?? 0, language)}
          </Text>
          <Text style={styles.caseClosedAmountLabel} numberOfLines={2}>
            {textByLanguage(language, 'Đã ghi có vào tài khoản thợ trong ứng dụng', 'Credited to the worker in-app account')}
          </Text>
        </>
      ) : null}
    </View>
  )
}

export function WorkerV5CaseTrailCard({
  caseWideAura: _caseWideAura,
  completionRecordIcon,
  deal,
  incomeLedgerIcon,
  language,
  reduceTransparency,
  workerNet,
  zipAura: _zipAura,
}: {
  caseWideAura: WorkerV5CaseAuraComponent
  completionRecordIcon: ImageSourcePropType
  deal: LocalDeal | null
  incomeLedgerIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  workerNet: number | null
  zipAura: WorkerV5CaseAuraComponent
}) {
  const artifactReady = Boolean(deal?.completionNotes?.trim() || deal?.completionPhotoUrls?.length)
  const ledgerReady = Boolean(workerNet && workerNet > 0)
  const paymentRailIsSePay = deal?.payment?.provider === 'sepay_vietqr'
  const cashPaymentRecorded = deal?.payment?.provider === 'cash' && deal.payment.status === 'cash_confirmed'
  const pendingCreditLabel = cashPaymentRecorded
    ? textByLanguage(language, 'Đã ghi nhận hoa hồng tiền mặt', 'Cash commission recorded')
    : paymentRailIsSePay
    ? textByLanguage(language, 'Chờ SePay xác thực', 'Awaiting SePay')
    : textByLanguage(language, 'Chưa có phương thức thanh toán', 'No payment method available')
  const rows = [
    {
      details: artifactReady
        ? [
          { glyph: 'document' as const, label: textByLanguage(language, 'Hồ sơ đã khóa', 'Artifact locked') },
          { glyph: 'check' as const, label: textByLanguage(language, 'Bằng chứng đã khóa', 'Evidence locked') },
        ]
        : [
          { glyph: 'sync' as const, label: textByLanguage(language, 'Chờ bằng chứng', 'Waiting for evidence') },
          { glyph: 'document' as const, label: textByLanguage(language, 'Ảnh & ghi chú', 'Photos and notes') },
        ],
      icon: completionRecordIcon,
      meta: artifactReady
        ? textByLanguage(language, `${deal?.completionPhotoUrls?.length ?? 0} ảnh · có ghi chú`, `${deal?.completionPhotoUrls?.length ?? 0} photos · note exists`)
        : textByLanguage(language, 'Chưa có hồ sơ hoàn tất thật', 'No real completion artifact'),
      status: artifactReady ? textByLanguage(language, 'Đã khóa', 'Locked') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion artifact'),
    },
    {
      details: ledgerReady
        ? [
          { glyph: 'money' as const, label: textByLanguage(language, 'Đã ghi có', 'Credited') },
          { glyph: 'check' as const, label: textByLanguage(language, 'Trong ứng dụng', 'In app') },
        ]
        : cashPaymentRecorded
          ? [
            { glyph: 'check' as const, label: textByLanguage(language, 'Thợ đã xác nhận đã nhận tiền', 'Worker confirmed receipt') },
            { glyph: 'money' as const, label: textByLanguage(language, 'Hoa hồng được ghi sổ riêng', 'Commission recorded separately') },
          ]
          : [
          { glyph: 'sync' as const, label: pendingCreditLabel },
          { glyph: 'money' as const, label: textByLanguage(language, 'Số dư trong ứng dụng', 'In-app balance') },
        ],
      icon: incomeLedgerIcon,
      meta: ledgerReady
        ? formatVnd(workerNet ?? 0, language)
        : cashPaymentRecorded
          ? textByLanguage(language, 'Không tạo khoản ghi có từ tiền mặt', 'Cash does not create an in-app credit')
          : textByLanguage(language, 'Chưa có khoản ghi có đã xác thực', 'No verified credit yet'),
      status: ledgerReady
        ? textByLanguage(language, 'Đã ghi có', 'Credited')
        : cashPaymentRecorded
          ? textByLanguage(language, 'Đã ghi nhận', 'Recorded')
          : textByLanguage(language, 'Chờ', 'Waiting'),
      title: cashPaymentRecorded
        ? textByLanguage(language, 'Đối soát hoa hồng tiền mặt', 'Cash commission reconciliation')
        : textByLanguage(language, 'Ghi có tài khoản thợ', 'Credit worker account'),
    },
  ]
  return (
    <View style={[styles.caseTrailCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-case-trail-card">
      <WorkerV5FormulaMintCardAura
        reduceTransparency={reduceTransparency}
        scope="CaseTrail"
        testID="worker-v5-case-trail-formula-mint-aura"
      />
      {rows.map((row, index) => (
        <View key={row.title} style={styles.caseTrailRow}>
          <WorkerV5IntegratedIcon
            bleed={13}
            image={row.icon}
            reduceTransparency={reduceTransparency}
            testID={`worker-v5-case-trail-icon-${index}`}
            tone={index === 0 ? 'document' : 'money'}
            variant="panel"
          />
          <View style={styles.caseTrailCopy}>
            <Text style={styles.caseTrailTitle} numberOfLines={2} testID={`worker-v5-case-trail-title-${index}`}>{row.title}</Text>
            <Text style={styles.caseTrailMeta} numberOfLines={2} testID={`worker-v5-case-trail-meta-${index}`}>{row.meta}</Text>
            <WorkerV5DetailRail items={row.details} testID={`worker-v5-case-trail-detail-${index}`} />
          </View>
          <Text style={styles.caseTrailStatus} numberOfLines={2} testID={`worker-v5-case-trail-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}
