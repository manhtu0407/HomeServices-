import type { ComponentType } from 'react'
import {
  Image,
  Text as RNText,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native'
import type { LocalDeal } from '@nestscout/shared'

import { MintAura } from '@/components/ui/kael-primitives'
import type { AppLanguage } from '@/lib/app-language'

import { formatVnd, textByLanguage } from '../ui/format'
import { styles } from './case-styles'

type WorkerV5CaseAuraComponent = ComponentType<{
  scope: string
  style?: StyleProp<ViewStyle>
  testID?: string
}>

type WorkerV5CaseEmblemAura = ComponentType<{
  scope: string
  testID?: string
}>

type WorkerV5CaseCheckFill = ComponentType<{
  scope: string
  testID?: string
}>

function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[styles.workerCustomerFontText, style]} />
}

export function WorkerV5CaseClosedHero({
  deal,
  language,
  reduceTransparency,
  successCheckFill: SuccessCheckFill,
  successEmblemAura: SuccessEmblemAura,
  workerNet,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
  successCheckFill: WorkerV5CaseCheckFill
  successEmblemAura: WorkerV5CaseEmblemAura
  workerNet: number | null
}) {
  const hasIncome = Boolean(workerNet && workerNet > 0)
  const amount = hasIncome ? formatVnd(workerNet ?? 0, language) : '0'
  const status = hasIncome
    ? textByLanguage(language, 'Có thể rút tiền', 'Payout available')
    : textByLanguage(language, 'Chờ đối soát', 'Waiting settlement')
  const closed = deal?.status === 'confirmed_by_customer' || deal?.status === 'payment_pending' || deal?.status === 'paid' || deal?.status === 'reviewed'
  return (
    <View style={[styles.caseClosedHeroCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-case-closed-hero">
      {!reduceTransparency ? <MintAura intensity="component" style={styles.caseClosedHeroAura} testID="worker-v5-case-closed-mint-aura" /> : null}
      <View style={styles.caseClosedCheckShell}>
        {!reduceTransparency ? <SuccessEmblemAura scope="CaseClosed" testID="worker-v5-case-closed-check-aura" /> : null}
        <View style={styles.caseClosedCheck}>
          {!reduceTransparency ? <SuccessCheckFill scope="CaseClosed" testID="worker-v5-case-closed-check-fill" /> : null}
          <Text style={styles.caseClosedCheckText}>✓</Text>
        </View>
      </View>
      <View style={styles.caseClosedStatusPill}>
        <View style={styles.statusDotSmall} />
        <Text style={styles.caseClosedStatusText} numberOfLines={2} testID="worker-v5-case-closed-status">{status}</Text>
      </View>
      <Text style={styles.caseClosedTitle} numberOfLines={2} testID="worker-v5-case-closed-title">{closed ? textByLanguage(language, 'Hoàn tất công việc', 'Work completed') : textByLanguage(language, 'Chưa hoàn tất công việc', 'Work not completed')}</Text>
      <Text style={styles.caseClosedAmount} numberOfLines={1} testID="worker-v5-case-closed-amount">{amount}</Text>
      <Text style={styles.caseClosedAmountLabel} numberOfLines={2}>
        {hasIncome ? textByLanguage(language, 'Đã ghi vào sổ thu nhập', 'Recorded in income ledger') : textByLanguage(language, 'Chờ sổ thu nhập đồng bộ', 'Waiting for income ledger')}
      </Text>
    </View>
  )
}

export function WorkerV5CaseTrailCard({
  caseWideAura: CaseWideAura,
  completionRecordIcon,
  deal,
  incomeLedgerIcon,
  language,
  reduceTransparency,
  zipAura: ZipAura,
}: {
  caseWideAura: WorkerV5CaseAuraComponent
  completionRecordIcon: ImageSourcePropType
  deal: LocalDeal | null
  incomeLedgerIcon: ImageSourcePropType
  language: AppLanguage
  reduceTransparency: boolean
  zipAura: WorkerV5CaseAuraComponent
}) {
  const artifactReady = Boolean(deal?.completionNotes?.trim() || deal?.completionPhotoUrls?.length)
  const ledgerReady = Boolean(deal?.payment?.workerNet && deal.payment.workerNet > 0)
  const rows = [
    {
      icon: completionRecordIcon,
      meta: artifactReady
        ? textByLanguage(language, `${deal?.completionPhotoUrls?.length ?? 0} ảnh · có ghi chú`, `${deal?.completionPhotoUrls?.length ?? 0} photos · note exists`)
        : textByLanguage(language, 'Chưa có hồ sơ hoàn tất thật', 'No real completion artifact'),
      status: artifactReady ? textByLanguage(language, 'Đã khóa', 'Locked') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Hồ sơ hoàn tất', 'Completion artifact'),
    },
    {
      icon: incomeLedgerIcon,
      meta: ledgerReady ? formatVnd(deal?.payment?.workerNet ?? 0, language) : textByLanguage(language, 'Chờ hệ thống đối soát', 'Waiting for system settlement'),
      status: ledgerReady ? textByLanguage(language, 'Đã ghi', 'Recorded') : textByLanguage(language, 'Chờ', 'Waiting'),
      title: textByLanguage(language, 'Giải ngân sổ thu nhập', 'Ledger release'),
    },
  ]
  return (
    <View style={[styles.caseTrailCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-case-trail-card">
      {rows.map((row, index) => (
        <View key={row.title} style={styles.caseTrailRow}>
          {!reduceTransparency ? (
            <>
              <CaseWideAura
                scope={`CaseTrailRow${index}`}
                style={styles.caseTrailRowAura}
                testID={`worker-v5-case-trail-row-mint-aura-${index}`}
              />
              <ZipAura
                scope={`CaseTrailRow${index}`}
                style={styles.caseTrailRowZipAura}
                testID={`worker-v5-case-trail-row-zip-mint-aura-${index}`}
              />
            </>
          ) : null}
          <View style={styles.caseTrailIconShell}>
            {!reduceTransparency ? <MintAura intensity="iconTile" style={styles.caseTrailIconMintAura} testID={`worker-v5-case-trail-icon-aura-${index}`} /> : null}
            <Image resizeMode="contain" source={row.icon} style={styles.caseTrailIcon} testID={`worker-v5-case-trail-icon-${index}`} />
          </View>
          <View style={styles.caseTrailCopy}>
            <Text style={styles.caseTrailTitle} numberOfLines={2} testID={`worker-v5-case-trail-title-${index}`}>{row.title}</Text>
            <Text style={styles.caseTrailMeta} numberOfLines={2} testID={`worker-v5-case-trail-meta-${index}`}>{row.meta}</Text>
          </View>
          <Text style={styles.caseTrailStatus} numberOfLines={2} testID={`worker-v5-case-trail-status-${index}`}>{row.status}</Text>
        </View>
      ))}
    </View>
  )
}

export function WorkerV5CaseMessagePreview({
  deal,
  language,
  reduceTransparency,
}: {
  deal: LocalDeal | null
  language: AppLanguage
  reduceTransparency: boolean
}) {
  if (!deal) return null
  const scope = deal.scopeChange
  const rows = [
    {
      body: deal.draft.description || textByLanguage(language, 'Không có mô tả yêu cầu', 'No request description'),
      label: textByLanguage(language, 'Nguồn yêu cầu', 'Request source'),
      tone: 'peer' as const,
    },
    scope?.requestedDescription
      ? {
        body: scope.requestedDescription,
        label: textByLanguage(language, 'Nháp đổi phạm vi', 'Scope draft'),
        tone: 'user' as const,
      }
      : null,
    {
      body: textByLanguage(
        language,
        'Kael chỉ gắn nguồn vào review; không thay tin nhắn của khách hoặc thợ.',
        'Kael only attaches sources to review; it does not rewrite customer or worker messages.',
      ),
      label: textByLanguage(language, 'Kael · ranh giới', 'Kael · boundary'),
      tone: 'system' as const,
    },
  ].filter((row): row is { body: string; label: string; tone: 'peer' | 'system' | 'user' } => Boolean(row))

  return (
    <View style={[styles.chatPreviewCard, reduceTransparency && styles.opaqueCard]} testID="worker-v5-chat-message-preview">
      {rows.map((row) => (
        <View
          key={`${row.label}-${row.body}`}
          style={[
            styles.chatPreviewRow,
            row.tone === 'user' ? styles.chatPreviewRowUser : null,
          ]}
        >
          <View
            style={[
              styles.chatMessage,
              reduceTransparency ? styles.opaqueCard : null,
              row.tone === 'peer' ? styles.chatMessagePeer : null,
              row.tone === 'system' ? styles.chatMessageSystem : null,
              row.tone === 'user' ? styles.chatMessageUser : null,
            ]}
          >
            <Text style={styles.chatMessageLabel}>{row.label}</Text>
            <Text style={styles.chatMessageBody}>{row.body}</Text>
          </View>
        </View>
      ))}
    </View>
  )
}
